/**
 * Filling the two sides of a main pier with berths (SPEC §5.5).
 */
import {
  add,
  clipSegmentToRegion,
  distance,
  EPS,
  intersectIntervals,
  pointInRegion,
  roundVec,
  scale,
  segmentIntersectsBox,
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
  /**
   * Optional berth quota per class. When set, classes are not chosen by target share:
   * each berth goes to the LONGEST allowed class that is still below its quota, so the
   * rows are filled class by class from the largest boats down (size zoning).
   */
  quota?: Record<string, number>;
}

export const newMixState = (classes: BoatClass[]): MixState => ({
  total: 0,
  counts: Object.fromEntries(classes.map((c) => [c.id, 0])),
});

export interface FillContext {
  prepared: PreparedSite;
  /** All boat classes of the project; only those with share > 0 are used. */
  classes: BoatClass[];
  params: Params;
  pattern: BerthPattern;
  design: RowDesign;
  /**
   * Re-order each run so that larger boats sit towards the pier head (default true).
   * The generator turns this off while searching: the order does not change berth counts.
   */
  orderRuns?: boolean;
  /** Only classes up to this boat length are placed (size zoning). */
  maxBoatLength?: number;
  /** Derived data, computed once per context. */
  plan?: FillPlan;
}

/** Everything about the classes and the pattern that the row filling needs repeatedly. */
interface FillPlan {
  classes: BoatClass[];
  /** Target shares normalised to sum to 1, in the order of `classes`. */
  shares: number[];
  /** Indices into `classes`, longest boat first. */
  byLengthDesc: number[];
  capacity: number;
  /** Clear water needed from the pier edge to the far side of the fairway, m. */
  reach: number;
  longestFinger: number;
  /** Bay geometry at s = 0 per combination of class indices. */
  bayCache: Map<number, BayGeometry>;
}

function planFor(ctx: FillContext): FillPlan {
  if (ctx.plan) return ctx.plan;
  const limit = ctx.maxBoatLength ?? Infinity;
  const classes = activeClasses(ctx.classes).filter((c) => c.length <= limit + 1e-9);
  const shareSum = classes.reduce((sum, c) => sum + c.share, 0);
  const plan: FillPlan = {
    classes,
    shares: classes.map((c) => c.share / shareSum),
    byLengthDesc: classes.map((_, i) => i).sort((a, b) => classes[b]!.length - classes[a]!.length),
    capacity: ctx.pattern.boatsPerBay(ctx.params),
    reach: ctx.design.rowDepth + ctx.design.fairwayWidth,
    longestFinger: 0,
    bayCache: new Map(),
  };
  for (let i = 0; i < classes.length; i++) {
    for (const d of bayAtOrigin(ctx, plan, [i]).dividers) plan.longestFinger = Math.max(plan.longestFinger, d.d1);
  }
  ctx.plan = plan;
  return plan;
}

export interface PlacedBay {
  /** Where the bay starts along the row, m. */
  s: number;
  boats: BoatClass[];
  /** Geometry of the bay as if it started at s = 0; shift by `s` to place it. */
  geometry: BayGeometry;
}

const shiftRect = (r: LocalRect, s: number): LocalRect => ({ s0: r.s0 + s, s1: r.s1 + s, d0: r.d0, d1: r.d1 });

/** Bay geometry at s = 0, computed once per combination of boat classes. */
function bayAtOrigin(ctx: FillContext, plan: FillPlan, classIndices: number[]): BayGeometry {
  let key = 0;
  for (const i of classIndices) key = key * (plan.classes.length + 1) + i + 1;
  let geometry = plan.bayCache.get(key);
  if (!geometry) {
    geometry = ctx.pattern.bay(classIndices.map((i) => plan.classes[i]!), 0, ctx.params);
    plan.bayCache.set(key, geometry);
  }
  return geometry;
}

/**
 * Lay out one row. Returns the placed bays grouped into contiguous runs
 * (a new run starts wherever the row had to skip over something).
 *
 * Class choice (DECISIONS I7): each berth goes to the class that is furthest behind its
 * target share if one more berth is added; ties go to the class listed first.
 */
function fillRow(frame: RowFrame, rowStart: number, rowEnd: number, ctx: FillContext, mix: MixState): PlacedBay[][] {
  const { prepared, design } = ctx;
  const plan = planFor(ctx);
  const { classes, shares, reach } = plan;
  const span = rowEnd - rowStart;
  if (classes.length === 0 || span < design.minBayFootprint) return [];

  const at = (s: number, d: number): Vec2 => add(frame.origin, add(scale(frame.along, s), scale(frame.outward, d)));

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
  if (stretches.length === 0) return [];

  // Running counts by class index; written back to `mix` at the end.
  const counts = classes.map((c) => mix.counts[c.id] ?? 0);
  let total = mix.total;
  const quota = mix.quota ? classes.map((c) => mix.quota![c.id] ?? 0) : null;
  /** Index of the class for the next berth, or -1 when every quota is used up. */
  const pick = (): number => {
    if (quota) {
      for (const i of plan.byLengthDesc) if (counts[i]! < quota[i]!) return i;
      return -1;
    }
    let best = 0;
    let bestDeficit = -Infinity;
    for (let i = 0; i < classes.length; i++) {
      const deficit = shares[i]! * (total + 1) - counts[i]!;
      if (deficit > bestDeficit + 1e-12) {
        best = i;
        bestDeficit = deficit;
      }
    }
    return best;
  };

  // Region boundaries in row-local coordinates (s along the pier, d outwards), as flat
  // [s0, d0, s1, d1, …] arrays. Bays are axis-aligned boxes there, which makes the checks cheap.
  const localEdges = (region: Region): number[] => {
    const edges: number[] = [];
    for (const part of region) {
      for (const ring of [part.outer, ...part.holes]) {
        let px = 0;
        let py = 0;
        for (let i = 0; i <= ring.length; i++) {
          const v = ring[i % ring.length]!;
          const rx = v.x - frame.origin.x;
          const ry = v.y - frame.origin.y;
          const ls = rx * frame.along.x + ry * frame.along.y;
          const ld = rx * frame.outward.x + ry * frame.outward.y;
          if (i > 0) edges.push(px, py, ls, ld);
          px = ls;
          py = ld;
        }
      }
    }
    return edges;
  };
  /** Edges that enter the box by more than the tolerance. */
  const edgesInBox = (edges: number[], s0: number, s1: number, d0: number, d1: number): number[] => {
    const hit: number[] = [];
    for (let i = 0; i < edges.length; i += 4) {
      if (segmentIntersectsBox(edges[i]!, edges[i + 1]!, edges[i + 2]!, edges[i + 3]!, s0 + EPS, d0 + EPS, s1 - EPS, d1 - EPS)) {
        hit.push(edges[i]!, edges[i + 1]!, edges[i + 2]!, edges[i + 3]!);
      }
    }
    return hit;
  };
  const boxIsFree = (edges: number[], s0: number, s1: number, d0: number, d1: number): boolean => {
    for (let i = 0; i < edges.length; i += 4) {
      if (segmentIntersectsBox(edges[i]!, edges[i + 1]!, edges[i + 2]!, edges[i + 3]!, s0 + EPS, d0 + EPS, s1 - EPS, d1 - EPS)) {
        return false;
      }
    }
    return true;
  };
  const navigableEdges = localEdges(prepared.navigableRegion);
  const structureEdges = localEdges(prepared.structureRegion);

  const runs: PlacedBay[][] = [];
  /** Set when every quota is used up: nothing more can be placed in this row. */
  let exhausted = false;
  for (const [from, to] of stretches) {
    if (exhausted) break;
    if (to - from < design.minBayFootprint - 1e-9) continue;
    // Boundary edges that reach into this stretch. Both the pier edge and the far side of
    // the fairway are in navigable water along the whole stretch, so a box in between is
    // navigable exactly when no boundary edge enters it.
    const navigableBand = edgesInBox(navigableEdges, from, to, 0, reach);
    const structureBand = edgesInBox(structureEdges, from, to, 0, plan.longestFinger);
    const inStructureRegion = (r: LocalRect): boolean =>
      boxIsFree(structureBand, r.s0, r.s1, r.d0, r.d1) &&
      pointInRegion(at((r.s0 + r.s1) / 2, (r.d0 + r.d1) / 2), prepared.structureRegion);
    // If the whole stretch is clear, the individual bays need no further checks.
    const clear =
      navigableBand.length === 0 &&
      structureBand.length === 0 &&
      pointInRegion(at((from + to) / 2, plan.longestFinger / 2), prepared.structureRegion);

    const blockIsNavigable = (s: number, footprint: number): boolean =>
      boxIsFree(navigableBand, s, s + footprint, 0, reach);
    const bayIsValid = (s: number, geometry: BayGeometry): boolean => {
      if (s + geometry.footprint > to + 1e-9) return false;
      if (clear) return true;
      if (!blockIsNavigable(s, geometry.footprint)) return false;
      return geometry.dividers.every((d) => inStructureRegion(shiftRect(d, s)));
    };

    /** First bay that fits at `s`: the mix-driven choice first, then smaller classes, then fewer boats. */
    const chooseBay = (s: number): PlacedBay | null => {
      // Every bay covers at least the smallest footprint, so if that is not navigable nothing is.
      if (!clear && !blockIsNavigable(s, design.minBayFootprint)) return null;
      for (let n = plan.capacity; n >= 1; n--) {
        const picks: number[] = [];
        for (let i = 0; i < n; i++) {
          const index = pick();
          if (index < 0) break;
          picks.push(index);
          counts[index]!++;
          total++;
        }
        if (picks.length < n) {
          // Not enough quota left for a bay of n boats.
          for (const index of picks) counts[index]!--;
          total -= picks.length;
          if (picks.length === 0) {
            exhausted = true;
            return null;
          }
          continue;
        }
        const geometry = bayAtOrigin(ctx, plan, picks);
        if (bayIsValid(s, geometry)) return { s, boats: picks.map((i) => classes[i]!), geometry };
        for (const index of picks) counts[index]!--;
        total -= n;

        const longest = Math.max(...picks.map((i) => classes[i]!.length));
        for (const index of plan.byLengthDesc) {
          if (classes[index]!.length >= longest) continue;
          if (quota && counts[index]! + n > quota[index]!) continue;
          const same = Array<number>(n).fill(index);
          const smaller = bayAtOrigin(ctx, plan, same);
          if (bayIsValid(s, smaller)) {
            counts[index]! += n;
            total += n;
            return { s, boats: same.map((i) => classes[i]!), geometry: smaller };
          }
        }
      }
      return null;
    };

    const stretchRuns: PlacedBay[][] = [];
    let s = from;
    let run: PlacedBay[] = [];
    while (!exhausted && s + design.minBayFootprint <= to + 1e-9) {
      const bay = chooseBay(s);
      if (bay) {
        run.push(bay);
        s += bay.geometry.advance;
      } else {
        if (run.length > 0) stretchRuns.push(run);
        run = [];
        s += SKIP_STEP;
      }
    }
    if (run.length > 0) stretchRuns.push(run);

    if (ctx.orderRuns === false) {
      runs.push(...stretchRuns);
      continue;
    }
    // Larger boats towards the pier head (SPEC §5.5): re-order each run by boat length.
    // The run keeps its total length because the same boats and bay sizes are used.
    for (const original of stretchRuns) {
      const order = original
        .flatMap((b) => b.boats)
        .map((boat) => classes.indexOf(boat))
        .sort((x, y) => classes[x]!.length - classes[y]!.length || x - y);
      const sorted: PlacedBay[] = [];
      let cursor = original[0]!.s;
      for (const bay of original) {
        const group = order.splice(0, bay.boats.length);
        const geometry = bayAtOrigin(ctx, plan, group);
        if (!bayIsValid(cursor, geometry)) break;
        sorted.push({ s: cursor, boats: group.map((i) => classes[i]!), geometry });
        cursor += geometry.advance;
      }
      // Keep the original order if the re-ordered run does not pass the checks.
      runs.push(sorted.length === original.length ? sorted : original);
    }
  }

  classes.forEach((c, i) => (mix.counts[c.id] = counts[i]!));
  mix.total = total;
  return runs;
}

export interface PierFill {
  fingers: Finger[];
  berths: Berth[];
}

/** The bays placed on one side of a pier, before they are turned into model elements. */
export interface FilledRow {
  side: PierSide;
  frame: RowFrame;
  runs: PlacedBay[][];
  /** Depth reserved for the row, measured from the pier edge, m. */
  depth: number;
  /** Fairway width kept clear in front of the row, m. */
  fairwayWidth: number;
}

export interface FillOptions {
  sides?: PierSide[];
  /** Where the rows start, m from the pier start. Defaults to `params.shoreOffset`. */
  rowStart?: number;
}

type PierLike = { id: string; start: Vec2; end: Vec2; width: number };

/** Place bays on the sides of a pier from the shore end outwards. `mix` is updated in place. */
export function fillPierRows(pier: PierLike, ctx: FillContext, mix: MixState, options: FillOptions = {}): FilledRow[] {
  const pierLength = distance(pier.start, pier.end);
  const along = { x: (pier.end.x - pier.start.x) / pierLength, y: (pier.end.y - pier.start.y) / pierLength };
  const leftNormal = { x: -along.y, y: along.x };
  const rows: FilledRow[] = [];
  for (const side of options.sides ?? (['left', 'right'] as const)) {
    const outward = side === 'left' ? leftNormal : scale(leftNormal, -1);
    const frame: RowFrame = { origin: add(pier.start, scale(outward, pier.width / 2)), along, outward };
    const runs = fillRow(frame, options.rowStart ?? ctx.params.shoreOffset, pierLength, ctx, mix);
    if (runs.length > 0) {
      rows.push({ side, frame, runs, depth: ctx.design.rowDepth, fairwayWidth: ctx.design.fairwayWidth });
    }
  }
  return rows;
}

/** Dividers of a run with shared ones merged: a shared divider takes the longer length. */
function mergedDividers(run: PlacedBay[]): LocalRect[] {
  const dividers: LocalRect[] = [];
  for (const bay of run) {
    for (const d of bay.geometry.dividers) {
      const last = dividers[dividers.length - 1];
      if (last && Math.abs(last.s0 - (d.s0 + bay.s)) < 1e-6) last.d1 = Math.max(last.d1, d.d1);
      else dividers.push(shiftRect(d, bay.s));
    }
  }
  return dividers;
}

/** Berth count and total finger length of filled rows, without building any polygons. */
export function summarizeRows(rows: FilledRow[]): { berths: number; fingerLength: number } {
  let berths = 0;
  let fingerLength = 0;
  for (const row of rows) {
    for (const run of row.runs) {
      for (const bay of run) berths += bay.boats.length;
      for (const d of mergedDividers(run)) fingerLength += d.d1 - d.d0;
    }
  }
  return { berths, fingerLength };
}

/** Model elements for filled rows. Ids are derived from the pier id, so they are deterministic. */
export function rowsToElements(pierId: string, rows: FilledRow[]): PierFill {
  const fingers: Finger[] = [];
  const berths: Berth[] = [];
  for (const { side, frame, runs } of rows) {
    const tag = side === 'left' ? 'L' : 'R';
    let fingerNo = 0;
    let berthNo = 0;
    for (const run of runs) {
      for (const bay of run) {
        for (const b of bay.geometry.berths) {
          berthNo++;
          berths.push({
            id: `${pierId}-${tag}${berthNo}`,
            pierId,
            side,
            boatClassId: b.boatClassId,
            slot: localRectToPolygon(shiftRect(b.slot, bay.s), frame).map(roundVec),
            boat: localRectToPolygon(shiftRect(b.boat, bay.s), frame).map(roundVec),
            removed: false,
            issues: [],
          });
        }
      }
      for (const d of mergedDividers(run)) {
        fingerNo++;
        fingers.push({
          id: `${pierId}-${tag}F${fingerNo}`,
          pierId,
          shape: localRectToPolygon(d, frame).map(roundVec),
        });
      }
    }
  }
  return { fingers, berths };
}

/** Fill both sides of a pier and return the model elements. `mix` is updated in place. */
export function fillPier(pier: PierLike, ctx: FillContext, mix: MixState, options: FillOptions = {}): PierFill {
  return rowsToElements(pier.id, fillPierRows(pier, ctx, mix, options));
}
