/**
 * Manual edits of a layout (SPEC §8): remove/restore a berth, lock a pier, move a pier,
 * and (D22) fill one side of a pier, change a berth's class, delete, resize or add a pier.
 * Each edit returns a new, fully re-evaluated layout marked as modified.
 */
import { fillPierRows, newMixState, rowDesign, rowsToElements } from './fill';
import {
  add,
  boundingBox,
  boxesOverlap,
  centroid,
  convexOverlapDepth,
  distance,
  dot,
  ensureCounterClockwise,
  EPS,
  regionFromPolygon,
  roundVec,
  scale,
  sub,
  type Box,
} from './geometry';
import { differenceRegions, unionRegions } from './geometryOps';
import { evaluateLayout } from './layout';
import type { Berth, BoatClass, Finger, Layout, MainPier, Params, PierSide, Polygon, Vec2 } from './model';
import { fingerPierPattern, localRectToPolygon } from './patterns';
import { MAX_BOAT_PIER_GAP } from './patterns/fingerPier';
import { layoutRows, pierAxis, rowFrame, toLocalRect } from './rows';
import { pierPolygon, type PreparedSite } from './site';
import { mixClasses } from './targets';

export interface EditContext {
  prepared: PreparedSite;
  classes: BoatClass[];
  params: Params;
}

function reevaluate(layout: Layout, ctx: EditContext): Layout {
  const next = evaluateLayout({ ...layout, modified: true }, ctx.prepared, ctx.classes, ctx.params);
  return { ...next, score: layout.score };
}

/** Mark a berth as removed or restore it. The fingers stay. */
export function setBerthRemoved(layout: Layout, berthId: string, removed: boolean, ctx: EditContext): Layout {
  if (!layout.berths.some((b) => b.id === berthId && b.removed !== removed)) return layout;
  return reevaluate(
    { ...layout, berths: layout.berths.map((b) => (b.id === berthId ? { ...b, removed } : b)) },
    ctx,
  );
}

/** Lock or unlock a pier. A locked pier cannot be moved. Does not count as a geometry edit. */
export function setPierLocked(layout: Layout, pierId: string, locked: boolean): Layout {
  if (!layout.piers.some((p) => p.id === pierId && p.locked !== locked)) return layout;
  return { ...layout, piers: layout.piers.map((p) => (p.id === pierId ? { ...p, locked } : p)) };
}

/**
 * Move a pier with its fingers and berths by `delta` (metres, world axes). The caller
 * decides the direction (along the pier axis or square to it). Locked piers do not move.
 */
export function movePier(layout: Layout, pierId: string, delta: Vec2, ctx: EditContext): Layout {
  const pier = layout.piers.find((p) => p.id === pierId);
  if (!pier || pier.locked || (delta.x === 0 && delta.y === 0)) return layout;
  const shift = (shape: Polygon): Polygon => shape.map((p) => roundVec(add(p, delta)));
  return reevaluate(
    {
      ...layout,
      piers: layout.piers.map((p) =>
        p.id === pierId ? { ...p, start: roundVec(add(p.start, delta)), end: roundVec(add(p.end, delta)) } : p,
      ),
      fingers: layout.fingers.map((f) => (f.pierId === pierId ? { ...f, shape: shift(f.shape) } : f)),
      berths: layout.berths.map((b) => (b.pierId === pierId ? { ...b, slot: shift(b.slot), boat: shift(b.boat) } : b)),
    },
    ctx,
  );
}

// ---------------------------------------------------------------------------
// Further manual edits (DECISIONS D22)
// ---------------------------------------------------------------------------

/** True when a finger of `pier` lies on `side` of it. */
function fingerOnSide(finger: Finger, pier: MainPier, side: PierSide): boolean {
  const frame = rowFrame(pier, side);
  return dot(sub(centroid(finger.shape), frame.origin), frame.outward) >= 0;
}

export interface FillSideOptions {
  /** Fill with this boat class only, or with the project's mix when null. */
  classId: string | null;
  /** Empty pier length at the shore end, before the first finger, m. */
  emptyLength: number;
}

/**
 * Replace the berths and fingers on one side of a pier by a fresh fill: with one boat
 * class only (e.g. "only 12 m boats on this side") or with the project's mix, starting
 * `emptyLength` metres from the shore end. The bays are kept clear of the site's
 * obstacles and zones and of every other pier, finger and berth of the layout; the
 * fairway in front of the new row must be navigable as in the generator (I8).
 * With the mix, the classes follow the targets counted over the whole layout. Target
 * counts are not applied as limits here: the user asked for this side to be filled.
 */
export function fillPierSide(layout: Layout, pierId: string, side: PierSide, options: FillSideOptions, ctx: EditContext): Layout {
  const pier = layout.piers.find((p) => p.id === pierId);
  if (!pier) return layout;
  const mixed = mixClasses(ctx.classes, ctx.params);
  const chosen = options.classId === null ? null : mixed.find((c) => c.id === options.classId);
  if (options.classId !== null && !chosen) return layout;
  const classes = chosen ? [{ ...chosen, share: 1 }] : mixed;
  const design = rowDesign(classes, ctx.params, fingerPierPattern);
  if (!design) return layout;

  const berths = layout.berths.filter((b) => !(b.pierId === pierId && b.side === side));
  const fingers = layout.fingers.filter((f) => !(f.pierId === pierId && fingerOnSide(f, pier, side)));

  // Everything else in the layout near this side is taken out of the regions the fill uses.
  const { length } = pierAxis(pier);
  const frame = rowFrame(pier, side);
  const band = boundingBox(
    localRectToPolygon({ s0: -1, s1: length + 1, d0: -1, d1: design.rowDepth + design.fairwayWidth + 1 }, frame),
  );
  const near = (shape: Polygon) => boxesOverlap(boundingBox(shape), band);
  const occupied = unionRegions(
    [
      ...layout.piers.filter((p) => p.id !== pierId).map((p) => pierPolygon(p.start, p.end, p.width)),
      ...fingers.map((f) => f.shape),
      ...berths.filter((b) => !b.removed).map((b) => b.slot),
    ]
      .filter(near)
      .map((shape) => regionFromPolygon(ensureCounterClockwise(shape))),
  );
  const prepared: PreparedSite = {
    ...ctx.prepared,
    structureRegion: differenceRegions(ctx.prepared.structureRegion, occupied),
    navigableRegion: differenceRegions(ctx.prepared.navigableRegion, occupied),
  };

  const mix = newMixState(classes);
  for (const b of berths) {
    if (b.removed || mix.counts[b.boatClassId] === undefined) continue;
    mix.counts[b.boatClassId]!++;
    mix.total++;
  }
  const rows = fillPierRows(pier, { prepared, classes, params: ctx.params, pattern: fingerPierPattern, design }, mix, {
    sides: [side],
    rowStart: Math.max(0, options.emptyLength),
  });
  const added = keepNeighbourFairways(rowsToElements(pier.id, rows), pier, side, { ...layout, berths, fingers }, ctx);
  return reevaluate({ ...layout, berths: [...berths, ...added.berths], fingers: [...fingers, ...added.fingers] }, ctx);
}

/**
 * Drop new berths whose slot lies in the fairway that a berth of another row needs in
 * front of it (SPEC §6), so that filling one side never takes the fairway of the rows
 * already there. Fingers left without a berth beside them are dropped too.
 */
function keepNeighbourFairways(
  added: { berths: Berth[]; fingers: Finger[] },
  pier: MainPier,
  side: PierSide,
  rest: Layout,
  ctx: EditContext,
): { berths: Berth[]; fingers: Finger[] } {
  const corridors: { shape: Polygon; box: Box }[] = [];
  for (const row of layoutRows(rest.piers, rest.fingers, rest.berths, ctx.classes, ctx.params)) {
    for (const b of row.berths) {
      const slot = toLocalRect(b.slot, row.frame);
      const reach = row.depth + row.fairwayWidth;
      if (reach - slot.d1 < EPS) continue;
      const shape = localRectToPolygon({ s0: slot.s0, s1: slot.s1, d0: slot.d1, d1: reach }, row.frame);
      corridors.push({ shape, box: boundingBox(shape) });
    }
  }
  const berths = added.berths.filter((b) => {
    const box = boundingBox(b.slot);
    return !corridors.some((c) => boxesOverlap(box, c.box) && convexOverlapDepth(b.slot, c.shape) > EPS);
  });
  if (berths.length === added.berths.length) return added;
  const frame = rowFrame(pier, side);
  const slots = berths.map((b) => toLocalRect(b.slot, frame));
  const fingers = added.fingers.filter((f) => {
    const r = toLocalRect(f.shape, frame);
    return slots.some((slot) => Math.abs(slot.s0 - r.s1) < 0.005 || Math.abs(slot.s1 - r.s0) < 0.005);
  });
  return { berths, fingers };
}

/**
 * Give a berth another boat class. The slot keeps its position at the pier edge and its
 * start along the row; its size follows the new class (SPEC §4). If the new boat is
 * wider than the old slot, the overlap with the next finger shows up as an issue.
 */
export function setBerthClass(layout: Layout, berthId: string, classId: string, ctx: EditContext): Layout {
  const berth = layout.berths.find((b) => b.id === berthId);
  const boat = ctx.classes.find((c) => c.id === classId);
  const pier = berth && layout.piers.find((p) => p.id === berth.pierId);
  if (!berth || !boat || !pier || berth.boatClassId === classId) return layout;
  const { params } = ctx;
  const frame = rowFrame(pier, berth.side);
  const old = toLocalRect(berth.slot, frame);
  const slot = { s0: old.s0, s1: old.s0 + boat.beam + params.beamClearance, d0: 0, d1: boat.length + params.lengthClearance };
  const gap = Math.min(MAX_BOAT_PIER_GAP, params.lengthClearance / 2);
  const sideGap = params.beamClearance / 2;
  const hull = { s0: slot.s0 + sideGap, s1: slot.s1 - sideGap, d0: gap, d1: gap + boat.length };
  const toPolygon = (r: typeof slot) => localRectToPolygon(r, frame).map(roundVec);
  return reevaluate(
    {
      ...layout,
      berths: layout.berths.map((b) => (b.id === berthId ? { ...b, boatClassId: classId, slot: toPolygon(slot), boat: toPolygon(hull) } : b)),
    },
    ctx,
  );
}

/** Delete a pier with its fingers and berths. Locked piers are not deleted. */
export function deletePier(layout: Layout, pierId: string, ctx: EditContext): Layout {
  const pier = layout.piers.find((p) => p.id === pierId);
  if (!pier || pier.locked) return layout;
  return reevaluate(
    {
      ...layout,
      piers: layout.piers.filter((p) => p.id !== pierId),
      fingers: layout.fingers.filter((f) => f.pierId !== pierId),
      berths: layout.berths.filter((b) => b.pierId !== pierId),
    },
    ctx,
  );
}

/**
 * Change a pier's length, keeping its shore end. Fingers and berths that would end beyond
 * the new head are deleted; a longer pier gets empty metres, which can then be filled.
 * Locked piers do not change. The length is rounded to 0.1 m.
 */
export function setPierLength(layout: Layout, pierId: string, length: number, ctx: EditContext): Layout {
  const pier = layout.piers.find((p) => p.id === pierId);
  const rounded = Math.round(length * 10) / 10;
  if (!pier || pier.locked || !(rounded > 0)) return layout;
  const axis = pierAxis(pier);
  if (Math.abs(axis.length - rounded) < 1e-9) return layout;
  const end = roundVec(add(pier.start, scale(axis.along, rounded)));
  const beyond = (shape: Polygon) => toLocalRect(shape, rowFrame(pier, 'left')).s1 > rounded + 1e-6;
  return reevaluate(
    {
      ...layout,
      piers: layout.piers.map((p) => (p.id === pierId ? { ...p, end } : p)),
      fingers: layout.fingers.filter((f) => f.pierId !== pierId || !beyond(f.shape)),
      berths: layout.berths.filter((b) => b.pierId !== pierId || !beyond(b.slot)),
    },
    ctx,
  );
}

/**
 * Add an empty main pier drawn by the user (shore end first). It has the layout's pier
 * width and can then be filled side by side. Ids continue the P1, P2, … numbering.
 */
export function addPier(layout: Layout, start: Vec2, end: Vec2, ctx: EditContext): Layout {
  if (distance(start, end) < 1) return layout;
  let n = layout.piers.length + 1;
  while (layout.piers.some((p) => p.id === `P${n}`)) n++;
  const pier: MainPier = {
    id: `P${n}`,
    start: roundVec(start),
    end: roundVec(end),
    width: ctx.params.mainPierWidth,
    locked: false,
    origin: 'manual',
  };
  return reevaluate({ ...layout, piers: [...layout.piers, pier] }, ctx);
}
