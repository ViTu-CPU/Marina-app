/**
 * Filling the two sides of a main pier with berths (SPEC §5.5).
 */
import {
  add,
  clipSegmentToRegion,
  convexInsideRegion,
  distance,
  EPS,
  intersectIntervals,
  roundVec,
  scale,
  type Region,
} from './geometry';
import type { Berth, BoatClass, Finger, Params, PierSide, Vec2 } from './model';
import {
  localRectToPolygon,
  type BayGeometry,
  type BerthPattern,
  type LocalRect,
  type RowFrame,
} from './patterns';
import type { PreparedSite } from './site';

/** When a bay cannot be placed, the row cursor moves on by this much, m. */
export const SKIP_STEP = 0.5;

/** Row dimensions shared by every row of a layout (uniform pier pitch, DECISIONS D2). */
export interface RowDesign {
  /** Slot length of the longest boat class in the mix, m. */
  rowDepth: number;
  /** Fairway width required in front of the rows, m. */
  fairwayWidth: number;
  /** Centre-to-centre distance of parallel piers, m (SPEC §5.3). */
  pitch: number;
  /** Shortest possible bay including both dividers, m. */
  minBayFootprint: number;
}

/** Boat classes that take part in the mix, i.e. with a positive share. */
export const activeClasses = (classes: BoatClass[]): BoatClass[] => classes.filter((c) => c.share > 0);

/** Fairway width required next to boats of the given length (SPEC §5.3). */
export const fairwayWidthFor = (boatLength: number, params: Params): number =>
  Math.max(params.fairwayMin, params.fairwayFactor * boatLength);

export function rowDesign(classes: BoatClass[], params: Params, pattern: BerthPattern): RowDesign | null {
  const active = activeClasses(classes);
  if (active.length === 0) return null;
  const longest = active.reduce((a, b) => (b.length > a.length ? b : a));
  const rowDepth = pattern.slotLength(longest, params);
  const fairwayWidth = fairwayWidthFor(longest.length, params);
  const minBayFootprint = Math.min(...active.map((c) => pattern.bay([c], 0, params).footprint));
  return {
    rowDepth,
    fairwayWidth,
    pitch: params.mainPierWidth + 2 * rowDepth + fairwayWidth,
    minBayFootprint,
  };
}

/**
 * Running berth counts per class. Shared by all rows of a layout so that the target mix
 * is followed over the whole layout, not row by row.
 */
export interface MixState {
  total: number;
  counts: Record<string, number>;
}

export const newMixState = (classes: BoatClass[]): MixState => ({
  total: 0,
  counts: Object.fromEntries(classes.map((c) => [c.id, 0])),
});

/**
 * The class that is furthest behind its target share if one more berth is added.
 * Ties go to the class listed first. `tentative` holds picks made but not yet committed.
 */
function pickByDeficit(classes: BoatClass[], shareSum: number, mix: MixState, tentative: BoatClass[]): BoatClass {
  const total = mix.total + tentative.length;
  let best = classes[0]!;
  let bestDeficit = -Infinity;
  for (const c of classes) {
    const count = (mix.counts[c.id] ?? 0) + tentative.filter((t) => t.id === c.id).length;
    const deficit = (c.share / shareSum) * (total + 1) - count;
    if (deficit > bestDeficit + 1e-12) {
      best = c;
      bestDeficit = deficit;
    }
  }
  return best;
}

export interface FillContext {
  prepared: PreparedSite;
  /** All boat classes of the project; only those with share > 0 are used. */
  classes: BoatClass[];
  params: Params;
  pattern: BerthPattern;
  design: RowDesign;
}

interface PlacedBay {
  s: number;
  boats: BoatClass[];
  geometry: BayGeometry;
}

/**
 * Lay out one row. Returns the placed bays grouped into contiguous runs
 * (a new run starts wherever the row had to skip over something).
 */
function fillRow(frame: RowFrame, rowStart: number, rowEnd: number, ctx: FillContext, mix: MixState): PlacedBay[][] {
  const { prepared, params, pattern, design } = ctx;
  const classes = activeClasses(ctx.classes);
  const shareSum = classes.reduce((sum, c) => sum + c.share, 0);
  const byLengthDesc = [...classes].sort((a, b) => b.length - a.length);
  const capacity = pattern.boatsPerBay(params);
  // Every berth needs clear water from the pier edge to the far side of its fairway.
  const reach = design.rowDepth + design.fairwayWidth;
  const longestFinger = Math.max(
    ...classes.map((c) => Math.max(0, ...pattern.bay([c], 0, params).dividers.map((d) => d.d1))),
  );

  const at = (s: number, d: number): Vec2 => add(frame.origin, add(scale(frame.along, s), scale(frame.outward, d)));
  const rect = (r: LocalRect) => localRectToPolygon(r, frame);
  const span = rowEnd - rowStart;
  if (span < design.minBayFootprint) return [];

  // Stretches of the row where both the pier edge and the far side of the fairway are in
  // navigable water. Outside them no bay can be valid, so they are skipped cheaply.
  const clipAt = (d: number, region: Region): [number, number][] =>
    clipSegmentToRegion(at(rowStart, d), at(rowEnd, d), region).map(
      ([t0, t1]): [number, number] => [rowStart + t0 * span, rowStart + t1 * span],
    );
  const stretches = intersectIntervals(
    clipAt(EPS, prepared.navigableRegion),
    clipAt(reach - EPS, prepared.navigableRegion),
  );

  const runs: PlacedBay[][] = [];
  for (const [from, to] of stretches) {
    if (to - from < design.minBayFootprint - 1e-9) continue;
    // If the whole stretch is clear, the individual bays need no further checks.
    const clear =
      convexInsideRegion(rect({ s0: from, s1: to, d0: 0, d1: reach }), prepared.navigableRegion) &&
      convexInsideRegion(rect({ s0: from, s1: to, d0: 0, d1: longestFinger }), prepared.structureRegion);

    const bayIsValid = (s: number, geometry: BayGeometry): boolean => {
      if (s + geometry.footprint > to + 1e-9) return false;
      if (clear) return true;
      if (!convexInsideRegion(rect({ s0: s, s1: s + geometry.footprint, d0: 0, d1: reach }), prepared.navigableRegion)) {
        return false;
      }
      return geometry.dividers.every((d) => convexInsideRegion(rect(d), prepared.structureRegion));
    };

    /** First bay that fits at `s`: the mix-driven choice first, then smaller classes, then fewer boats. */
    const chooseBay = (s: number): PlacedBay | null => {
      for (let n = capacity; n >= 1; n--) {
        const picks: BoatClass[] = [];
        for (let i = 0; i < n; i++) picks.push(pickByDeficit(classes, shareSum, mix, picks));
        const longest = Math.max(...picks.map((p) => p.length));
        const candidates = [picks, ...byLengthDesc.filter((c) => c.length < longest).map((c) => Array<BoatClass>(n).fill(c))];
        for (const boats of candidates) {
          const geometry = pattern.bay(boats, s, params);
          if (bayIsValid(s, geometry)) return { s, boats, geometry };
        }
      }
      return null;
    };

    const stretchRuns: PlacedBay[][] = [];
    let s = from;
    let run: PlacedBay[] = [];
    while (s + design.minBayFootprint <= to + 1e-9) {
      const bay = chooseBay(s);
      if (bay) {
        run.push(bay);
        mix.total += bay.boats.length;
        for (const b of bay.boats) mix.counts[b.id] = (mix.counts[b.id] ?? 0) + 1;
        s += bay.geometry.advance;
      } else {
        if (run.length > 0) stretchRuns.push(run);
        run = [];
        s += SKIP_STEP;
      }
    }
    if (run.length > 0) stretchRuns.push(run);

    // Larger boats towards the pier head (SPEC §5.5): re-order each run by boat length.
    // The run keeps its total length because the same boats and bay sizes are used.
    for (const original of stretchRuns) {
      const boats = original.flatMap((b) => b.boats).sort((a, b) => a.length - b.length);
      const sorted: PlacedBay[] = [];
      let cursor = original[0]!.s;
      for (const bay of original) {
        const group = boats.splice(0, bay.boats.length);
        const geometry = pattern.bay(group, cursor, params);
        if (!bayIsValid(cursor, geometry)) break;
        sorted.push({ s: cursor, boats: group, geometry });
        cursor += geometry.advance;
      }
      // Keep the original order if the re-ordered run does not pass the checks.
      runs.push(sorted.length === original.length ? sorted : original);
    }
  }
  return runs;
}

export interface PierFill {
  fingers: Finger[];
  berths: Berth[];
}

/**
 * Fill both sides of a pier from the shore end outwards. `mix` is updated in place.
 * Element ids are derived from the pier id, so the result is deterministic.
 */
export function fillPier(
  pier: { id: string; start: Vec2; end: Vec2; width: number },
  ctx: FillContext,
  mix: MixState,
  sides: PierSide[] = ['left', 'right'],
): PierFill {
  const pierLength = distance(pier.start, pier.end);
  const along = { x: (pier.end.x - pier.start.x) / pierLength, y: (pier.end.y - pier.start.y) / pierLength };
  const leftNormal = { x: -along.y, y: along.x };
  const fingers: Finger[] = [];
  const berths: Berth[] = [];

  for (const side of sides) {
    const outward = side === 'left' ? leftNormal : scale(leftNormal, -1);
    const frame: RowFrame = { origin: add(pier.start, scale(outward, pier.width / 2)), along, outward };
    const runs = fillRow(frame, ctx.params.shoreOffset, pierLength, ctx, mix);
    const tag = side === 'left' ? 'L' : 'R';
    let fingerNo = 0;
    let berthNo = 0;
    for (const run of runs) {
      // Neighbouring bays share a divider; it takes the length of the longer neighbour.
      const dividers: LocalRect[] = [];
      for (const bay of run) {
        for (const d of bay.geometry.dividers) {
          const last = dividers[dividers.length - 1];
          if (last && Math.abs(last.s0 - d.s0) < 1e-6) last.d1 = Math.max(last.d1, d.d1);
          else dividers.push({ ...d });
        }
        for (const b of bay.geometry.berths) {
          berthNo++;
          berths.push({
            id: `${pier.id}-${tag}${berthNo}`,
            pierId: pier.id,
            side,
            boatClassId: b.boatClassId,
            slot: localRectToPolygon(b.slot, frame).map(roundVec),
            boat: localRectToPolygon(b.boat, frame).map(roundVec),
            removed: false,
            issues: [],
          });
        }
      }
      for (const d of dividers) {
        fingerNo++;
        fingers.push({
          id: `${pier.id}-${tag}F${fingerNo}`,
          pierId: pier.id,
          shape: localRectToPolygon(d, frame).map(roundVec),
        });
      }
    }
  }
  return { fingers, berths };
}
