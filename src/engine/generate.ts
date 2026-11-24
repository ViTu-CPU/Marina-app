/**
 * Layout generator (SPEC §5): a deterministic parametric search.
 *
 * For every candidate pier direction and lateral offset, parallel pier lines are laid
 * across the site at the pier pitch, clipped to shore-connected piers and filled with
 * berths. The best candidate of each strategy is then evaluated in full (fairways,
 * validation, statistics) and the alternatives are ranked by the selected objective.
 *
 * No randomness is used: the same input always gives the same output.
 */
import { DEFAULT_TOP_N } from './defaults';
import {
  activeClasses,
  fairwayWidthFor,
  fillPierRows,
  newMixState,
  rowDesign,
  rowsToElements,
  summarizeRows,
  type FillContext,
  type FilledRow,
  type FillOptions,
  type MixState,
  type RowDesign,
} from './fill';
import {
  add,
  bearingToVector,
  boundingBox,
  boxesOverlap,
  clipSegmentToRegion,
  convexInsideRegion,
  distance,
  distancePointToPolyline,
  dot,
  ensureCounterClockwise,
  EPS,
  intersectIntervals,
  pointInRing,
  polygonArea,
  roundVec,
  scale,
  sub,
  vectorToBearing,
  type Region,
} from './geometry';
import { evaluateLayout, type LayoutDraft } from './layout';
import type {
  Berth,
  BoatClass,
  Finger,
  Layout,
  MainPier,
  ObjectiveSettings,
  Params,
  PierSide,
  Polygon,
  Site,
  Vec2,
} from './model';
import { localRectToPolygon, patternFor, type BerthPattern, type LocalRect } from './patterns';
import { buildReachGrid, isSwept, reachableCells, type OccupiedBox, type ReachGrid } from './reach';
import { combinationLength, moduleCombination } from './modules';
import { layoutRows, pierAxis, rowFrame, toLocalRect } from './rows';
import { rankLayouts } from './score';
import { berthCaps, effectiveObjective, mixClasses } from './targets';
import {
  pierPolygon,
  placePiersOnLine,
  prepareSite,
  SHORE_TOLERANCE,
  type PierSegment,
  type PlacementReport,
  type PreparedSite,
} from './site';
import { cutOffBerths } from './validate';

export interface GenerateInput {
  site: Site;
  boatClasses: BoatClass[];
  params: Params;
  objective: ObjectiveSettings;
  /** Number of alternatives to return (default 5). */
  topN?: number;
}

export interface Diagnostic {
  code:
    | 'NO_WATER_AREA'
    | 'NO_SHORELINE'
    | 'NO_ENTRANCE'
    | 'NO_BOAT_CLASSES'
    | 'NO_PIER_REACHES_SHORE'
    | 'WATER_TOO_SHORT_FOR_PIER'
    | 'WATER_NARROWER_THAN_MODULE'
    | 'ALL_BERTHS_BLOCKED';
  message: string;
}

export interface GenerateResult {
  /** Alternatives, best first. Empty when nothing fits; then `diagnostics` says why. */
  layouts: Layout[];
  diagnostics: Diagnostic[];
}

export type StrategyId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Offset sweep step across one pier pitch, m (SPEC §5.4). */
export const OFFSET_STEP = 1;
/** Orientation sweep step, degrees (SPEC §5.2). */
export const ANGLE_STEP = 5;
/** Offset sweep step of the size-zoned strategy E, m. */
export const ZONED_OFFSET_STEP = 1;
/** For how many start offsets (per direction) strategy E runs its exact search. */
const ZONED_SHORTLIST = 6;
/** How many berth-less piers are remembered for the diagnostics. */
const MAX_BLOCKED_SAMPLE = 200;
/** Offset step of the coarse first pass over the orientations of strategy C, m. */
const COARSE_OFFSET_STEP = 4;
/** Orientations within this fraction of the fourth best after the coarse pass get the full sweep. */
const COARSE_KEEP_FRACTION = 0.75;
/** How many different orientations strategy C contributes to the pool of alternatives. */
const C_POOL_SIZE = 4;
/** Two layouts are near-duplicates when berth and pier counts are both within this fraction. */
const DUPLICATE_TOLERANCE = 0.02;

// ---------------------------------------------------------------------------
// Candidate orientations
// ---------------------------------------------------------------------------

const normalizeAxis = (bearingDeg: number): number => {
  const a = ((bearingDeg % 180) + 180) % 180;
  // Snap away floating-point noise so that e.g. 89.99999999 and 90 are one candidate.
  const snapped = Math.round(a * 1e6) / 1e6;
  return snapped >= 180 ? 0 : snapped;
};

/**
 * Direction of the shoreline as an axis bearing in [0, 180): the length-weighted mean
 * direction of its segments. Falls back to the longest segment when the mean is undefined
 * (e.g. two equally long legs at right angles).
 */
export function mainShorelineBearing(shoreline: Vec2[]): number | null {
  let sumSin = 0;
  let sumCos = 0;
  let longest = 0;
  let longestBearing: number | null = null;
  for (let i = 0; i + 1 < shoreline.length; i++) {
    const v = sub(shoreline[i + 1]!, shoreline[i]!);
    const len = Math.hypot(v.x, v.y);
    if (len === 0) continue;
    const bearing = vectorToBearing(v);
    const doubled = (2 * bearing * Math.PI) / 180;
    sumSin += len * Math.sin(doubled);
    sumCos += len * Math.cos(doubled);
    if (len > longest) {
      longest = len;
      longestBearing = bearing;
    }
  }
  if (longestBearing === null) return null;
  if (Math.hypot(sumSin, sumCos) < 1e-6 * longest) return normalizeAxis(longestBearing);
  return normalizeAxis((Math.atan2(sumSin, sumCos) * 180) / Math.PI / 2);
}

/** Pier directions to try (SPEC §5.2), as axis bearings in [0, 180), without duplicates. */
export function candidateOrientations(site: Site, params: Params): { all: number[]; shorePerpendicular: number } {
  const shore = mainShorelineBearing(site.shoreline) ?? 90;
  const shorePerpendicular = normalizeAxis(shore + 90);
  if (params.orientation !== 'auto') {
    const fixed = normalizeAxis(params.orientation);
    return { all: [fixed], shorePerpendicular: fixed };
  }
  const angles = [shorePerpendicular];
  // Parallel to the three longest edges of the water boundary.
  const edges = site.water
    .map((p, i) => sub(site.water[(i + 1) % site.water.length]!, p))
    .map((v) => ({ len: Math.hypot(v.x, v.y), bearing: vectorToBearing(v) }))
    .filter((e) => e.len > 0)
    .sort((a, b) => b.len - a.len)
    .slice(0, 3);
  for (const e of edges) angles.push(normalizeAxis(e.bearing));
  for (let a = 0; a < 180; a += ANGLE_STEP) angles.push(a);
  const unique: number[] = [];
  for (const a of angles) if (!unique.some((u) => Math.abs(u - a) < 1e-3)) unique.push(a);
  return { all: unique, shorePerpendicular };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

interface CandidatePier {
  segment: PierSegment;
  rows: FilledRow[];
  /** How the pier was filled, so the fill can be repeated for the final layout. */
  fillOptions: FillOptions;
  /** Strategy F: the fill context of the pier's group (the site less the earlier groups). */
  fill?: FillContext;
}

interface Candidate {
  strategy: StrategyId;
  /** Pier axis bearing, degrees. */
  angle: number;
  /** Strategy F: the pier directions of its groups, in the order they were placed, degrees. */
  angles?: number[];
  /** Strategy F: the groups are sized by boat class (D68). */
  zoned?: boolean;
  piers: CandidatePier[];
  /** Berths that can be reached from the entrance (estimated on the reach grid). */
  berths: number;
  pontoonLength: number;
  /**
   * Builds the piers again with the runs ordered by boat length. Set by strategies whose
   * rows depend on each other (size zoning); the others are re-filled pier by pier.
   */
  rebuild?: () => CandidatePier[];
}

interface SearchContext {
  prepared: PreparedSite;
  fill: FillContext;
  /** Upper limit of berths per class when the mix is given as target counts (D20). */
  caps?: Record<string, number>;
  /**
   * False: the pier on which the target counts run out is not re-filled to share its berths over
   * both sides (`fillPier`); it is only cut at its last bay. Strategy F's search, for speed.
   */
  balanceLastPier?: boolean;
  design: RowDesign;
  params: Params;
  objective: ObjectiveSettings;
  /** Reach grids by fairway width, built on demand. */
  reachGrids: Map<number, ReachGrid>;
  /** Pier length one berth takes on average with the target mix, m (for pruning the search). */
  meanBerthAdvance: number;
  report: PlacementReport & {
    piersPlaced: number;
    /** Number of piers that could be placed but got no berths. */
    berthlessPiers: number;
    /**
     * A sample of those piers, used to measure the available module width. Only piers
     * square to or along the shore (strategies A, B and D) are collected.
     */
    blockedPiers: PierSegment[];
  };
}

function reachGridFor(ctx: SearchContext, fairwayWidth: number): ReachGrid {
  let grid = ctx.reachGrids.get(fairwayWidth);
  if (!grid) {
    grid = buildReachGrid(ctx.prepared, fairwayWidth);
    ctx.reachGrids.set(fairwayWidth, grid);
  }
  return grid;
}

/**
 * Berth count and pontoon length of a candidate. Only berths that a boat can reach from
 * the entrance are counted, so the search does not favour layouts that wall off part of
 * the site (estimated on the reach grid; the exact check follows for the layouts returned).
 * Each row is tested with a circle as wide as its own fairway.
 */
function summarize(ctx: SearchContext, strategy: StrategyId, angle: number, piers: CandidatePier[]): Candidate;
function summarize(ctx: SearchContext, strategy: StrategyId, angle: number, piers: CandidatePier[], floor: number): Candidate | null;
function summarize(ctx: SearchContext, strategy: StrategyId, angle: number, piers: CandidatePier[], floor = 0): Candidate | null {
  if (floor > 0) {
    // Reachable berths cannot exceed the berths placed: skip the reach test when even
    // those are too few to matter.
    let placed = 0;
    for (const p of piers) placed += summarizeRows(p.rows).berths;
    if (placed < floor) return null;
  }
  const occupied: OccupiedBox[] = [];
  const widths = new Set<number>();
  let pontoonLength = 0;
  for (const p of piers) {
    const length = distance(p.segment.start, p.segment.end);
    pontoonLength += length + summarizeRows(p.rows).fingerLength;
    const first = p.rows[0]!;
    const width = ctx.params.mainPierWidth;
    // The pier itself, in the frame of its first row (d < 0 is under the pier).
    occupied.push({ origin: first.frame.origin, along: first.frame.along, outward: first.frame.outward, s0: 0, s1: length, d0: -width, d1: 0 });
    for (const row of p.rows) {
      let sMin = Infinity;
      let sMax = -Infinity;
      for (const run of row.runs) {
        sMin = Math.min(sMin, run[0]!.s);
        const last = run[run.length - 1]!;
        sMax = Math.max(sMax, last.s + last.geometry.footprint);
      }
      occupied.push({ origin: row.frame.origin, along: row.frame.along, outward: row.frame.outward, s0: sMin, s1: sMax, d0: 0, d1: row.depth });
      widths.add(row.fairwayWidth);
    }
  }
  let berths = 0;
  for (const fairwayWidth of widths) {
    const grid = reachGridFor(ctx, fairwayWidth);
    const reached = reachableCells(grid, occupied);
    for (const p of piers) {
      for (const row of p.rows) {
        if (row.fairwayWidth !== fairwayWidth) continue;
        const { origin, along, outward } = row.frame;
        const mid = row.depth + fairwayWidth / 2;
        for (const run of row.runs) {
          for (const bay of run) {
            const s = bay.s + bay.geometry.footprint / 2;
            const x = origin.x + s * along.x + mid * outward.x;
            const y = origin.y + s * along.y + mid * outward.y;
            if (isSwept(grid, reached, x, y, fairwayWidth / 2)) berths += bay.boats.length;
          }
        }
      }
    }
  }
  return { strategy, angle, piers, berths, pontoonLength };
}

/**
 * Cheap stand-in for the objective during the search. The 'balanced' objective needs the
 * fairway area of all alternatives, which is only known after full evaluation, so the
 * search uses capacity for it.
 */
function searchScore(c: Candidate, objective: ObjectiveSettings): number {
  if (c.berths === 0) return -Infinity;
  if (objective.id === 'minInfrastructure') {
    return -c.pontoonLength / c.berths - 1000 * Math.max(0, objective.targetBerths - c.berths);
  }
  return c.berths;
}

/** True when `a` is better than `b`; ties go to less pontoon, then to the earlier candidate. */
function better(a: Candidate, b: Candidate | null, objective: ObjectiveSettings): boolean {
  if (!b) return a.berths > 0;
  const sa = searchScore(a, objective);
  const sb = searchScore(b, objective);
  if (sa !== sb) return sa > sb;
  return a.pontoonLength < b.pontoonLength - 1e-9;
}

/** Extent of the water polygon along a unit direction. */
function extentAlong(site: Site, axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of site.water) {
    const u = dot(p, axis);
    if (u < min) min = u;
    if (u > max) max = u;
  }
  return { min, max };
}

/** Remove the bays that end beyond `length` and take their boats out of the mix counts. */
function trimRows(rows: FilledRow[], length: number, mix: MixState): FilledRow[] {
  const kept: FilledRow[] = [];
  for (const row of rows) {
    const runs = [];
    for (const run of row.runs) {
      const bays = [];
      for (const bay of run) {
        if (bay.s + bay.geometry.footprint <= length + 1e-9) {
          bays.push(bay);
          continue;
        }
        mix.total -= bay.boats.length;
        for (const boat of bay.boats) mix.counts[boat.id] = (mix.counts[boat.id] ?? 0) - 1;
      }
      if (bays.length > 0) runs.push(bays);
    }
    if (runs.length > 0) kept.push({ ...row, runs });
  }
  return kept;
}

/**
 * With target counts (D20) the last pier is often only partly filled. It is shortened to
 * the end of its last bay (rounded up to 0.1 m) so that no empty pontoon is built.
 */
function shrinkToBerths(segment: PierSegment, rows: FilledRow[]): PierSegment {
  let end = 0;
  for (const row of rows) for (const run of row.runs) for (const bay of run) end = Math.max(end, bay.s + bay.geometry.footprint);
  const full = distance(segment.start, segment.end);
  const length = Math.min(full, Math.ceil(end * 10 - 1e-6) / 10);
  if (end <= 0 || length >= full - 1e-6) return segment;
  return { start: segment.start, end: roundVec(add(segment.start, scale(sub(segment.end, segment.start), length / full))) };
}

const cloneMix = (mix: MixState): MixState => ({ ...mix, counts: { ...mix.counts } });

/** True when every class has reached its target count (D20). */
const capsReached = (mix: MixState): boolean =>
  mix.cap !== undefined && Object.entries(mix.cap).every(([id, cap]) => (mix.counts[id] ?? 0) >= cap);

/**
 * Fill a pier. With target counts (D20) the pier on which the targets run out would
 * otherwise be built to its full length with one side filled first; instead it gets the
 * shortest length (0.1 m steps) that takes the same number of berths, so both sides share
 * them. Other piers are filled as usual.
 */
function fillPier(
  ctx: SearchContext,
  segment: PierSegment,
  mix: MixState,
  minLength: number,
  options: FillOptions = {},
): { segment: PierSegment; rows: FilledRow[] } {
  const width = ctx.params.mainPierWidth;
  const before = ctx.caps ? cloneMix(mix) : null;
  const rows = fillPierRows({ id: '', ...segment, width }, ctx.fill, mix, options);
  if (!before || rows.length === 0 || !capsReached(mix) || ctx.balanceLastPier === false) return { segment, rows };
  const placed = mix.total - before.total;
  const full = distance(segment.start, segment.end);
  const cut = (decimetres: number): PierSegment => ({
    start: segment.start,
    end: roundVec(add(segment.start, scale(sub(segment.end, segment.start), decimetres / 10 / full))),
  });
  const attempt = (decimetres: number) => {
    const trial = cloneMix(before);
    const trialRows = fillPierRows({ id: '', ...cut(decimetres), width }, ctx.fill, trial, options);
    return { mix: trial, rows: trialRows, ok: trial.total - before.total >= placed };
  };
  let lo = Math.max(1, Math.ceil(minLength * 10 - 1e-6));
  let hi = Math.floor(full * 10 + 1e-6);
  if (lo > hi || !attempt(hi).ok) return { segment, rows };
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (attempt(mid).ok) hi = mid;
    else lo = mid + 1;
  }
  const best = attempt(hi);
  mix.total = best.mix.total;
  mix.counts = best.mix.counts;
  return { segment: shrinkToBerths(cut(hi), best.rows), rows: best.rows };
}

/**
 * D44: build the pier from whole modules. `segment` is the length the berths need (shorter than
 * `available` when target counts ran out), `available` the longest the site allows. The pier
 * becomes the shortest module combination that holds the berths within `available`, else the
 * longest that fits; bays beyond its head are dropped. Null when not even one module fits or
 * no berth is left.
 */
function snapToModules(ctx: SearchContext, segment: PierSegment, available: number, rows: FilledRow[], mix: MixState): { segment: PierSegment; rows: FilledRow[] } | null {
  const lengths = ctx.params.pierModuleLengths;
  if (lengths.length === 0) return { segment, rows };
  const length = distance(segment.start, segment.end);
  const modules = moduleCombination(length, available, lengths);
  if (!modules) {
    trimRows(rows, 0, mix);
    return null;
  }
  const built = combinationLength(modules);
  const kept = built < length - 1e-6 ? trimRows(rows, built, mix) : rows;
  if (kept.length === 0) return null;
  const end = roundVec(add(segment.start, scale(sub(segment.end, segment.start), built / length)));
  return { segment: { start: segment.start, end }, rows: kept };
}

/** Step by which a pier is shortened when its head is not clear, m. */
const HEAD_SHORTEN_STEP = 1;

/**
 * True when boats can turn around the pier head: the water beyond the head is navigable
 * for `headWidth`, across the pier, its rows and the fairways in front of them.
 */
function headIsClear(ctx: SearchContext, segment: PierSegment, rows: FilledRow[], headWidth: number): boolean {
  const { params, prepared } = ctx;
  const length = distance(segment.start, segment.end);
  const along = scale(sub(segment.end, segment.start), 1 / length);
  const left = { x: -along.y, y: along.x };
  const reach = (side: PierSide): number => {
    const row = rows.find((r) => r.side === side);
    return row ? row.depth + row.fairwayWidth : 0;
  };
  const frame = { origin: add(segment.start, scale(left, params.mainPierWidth / 2)), along, outward: left };
  const box = localRectToPolygon(
    { s0: length, s1: length + headWidth, d0: -params.mainPierWidth - reach('right'), d1: reach('left') },
    frame,
  );
  return convexInsideRegion(box, prepared.navigableRegion);
}

/**
 * Make sure the head of a filled pier is clear. Where the water ends at an angle, the
 * rows reach it before the pier's centreline does; the pier is then shortened in steps
 * and the bays beyond the new head are dropped (and taken out of the mix counts).
 * Returns null when no usable length remains.
 */
function fitHead(
  ctx: SearchContext,
  segment: PierSegment,
  rows: FilledRow[],
  mix: MixState,
  minLength: number,
  headWidth: number,
): { segment: PierSegment; rows: FilledRow[] } | null {
  if (headIsClear(ctx, segment, rows, headWidth)) return { segment, rows };
  const full = distance(segment.start, segment.end);
  for (let cut = HEAD_SHORTEN_STEP; full - cut >= minLength; cut += HEAD_SHORTEN_STEP) {
    const length = full - cut;
    const end = roundVec(add(segment.start, scale(sub(segment.end, segment.start), length / full)));
    const shortened = { start: segment.start, end };
    if (headIsClear(ctx, shortened, rows, headWidth)) {
      const trimmed = trimRows(rows, length, mix);
      return trimmed.length > 0 ? { segment: shortened, rows: trimmed } : null;
    }
  }
  trimRows(rows, 0, mix);
  return null;
}

/**
 * One candidate: parallel piers at `spacing`, the first one `offset` from the edge of the
 * site. Returns null when the candidate cannot reach `floor` berths, which is known
 * early from the total length of its piers (see `floorFor`).
 */
function parallelCandidate(
  ctx: SearchContext,
  strategy: StrategyId,
  angle: number,
  offset: number,
  spacing: number,
  floor: number,
): Candidate | null {
  const piers = parallelPiers(ctx, strategy, angle, offset, spacing, newMixState(ctx.fill.classes, ctx.caps), floor);
  return piers ? summarize(ctx, strategy, angle, piers, floor) : null;
}

/**
 * The piers of a parallel candidate, filled; `mix` is updated in place. Null when the piers
 * cannot reach `floor` berths. `keep` can leave out placed piers before they are filled
 * (strategy F keeps those that start from one stretch of shore).
 */
function parallelPiers(
  ctx: SearchContext,
  strategy: StrategyId,
  angle: number,
  offset: number,
  spacing: number,
  mix: MixState,
  floor: number,
  keep?: (segment: PierSegment) => boolean,
  /** Placed piers by angle and offset, for searches that place on the same site repeatedly. */
  placements?: Map<string, PierSegment[]>,
): CandidatePier[] | null {
  const { prepared, design, params } = ctx;
  const dir = bearingToVector(angle);
  const lateral = { x: dir.y, y: -dir.x }; // to the right of the pier direction
  const { min, max } = extentAlong(prepared.site, lateral);
  const minLength = params.shoreOffset + design.minBayFootprint;

  const key = `${angle}|${offset}|${spacing}`;
  let all = placements?.get(key);
  if (!all) {
    all = [];
    for (let u = min + offset; u <= max; u += spacing) {
      const placed = placePiersOnLine(
        prepared,
        scale(lateral, u),
        dir,
        { width: params.mainPierWidth, maxLength: params.maxMainPierLength, headClearance: design.fairwayWidth, minLength, shoreGap: params.shoreGap },
        ctx.report,
      );
      for (const raw of placed) all.push({ start: roundVec(raw.start), end: roundVec(raw.end) });
    }
    placements?.set(key, all);
  }
  const segments = keep ? all.filter(keep) : all;
  if (floor > 0) {
    // Upper estimate of the berths these piers can hold: both sides full at the average
    // pier length per berth, plus a margin of two berths per row for rounding.
    let estimate = 0;
    for (const s of segments) estimate += 2 * ((distance(s.start, s.end) - params.shoreOffset) / ctx.meanBerthAdvance + 2);
    if (estimate < floor) return null;
  }

  const piers: CandidatePier[] = [];
  for (const placed of segments) {
    ctx.report.piersPlaced++;
    const filled = fillPier(ctx, placed, mix, minLength);
    const rows = filled.rows;
    if (rows.length === 0) {
      // Slanted candidates of the sweep are left out: a box square to a slanted pier
      // measures the site diagonally, which would make the diagnostic misleading.
      if (strategy !== 'C' && ctx.report.blockedPiers.length < MAX_BLOCKED_SAMPLE) ctx.report.blockedPiers.push(placed);
      ctx.report.berthlessPiers++;
      continue;
    }
    const fitted = fitHead(ctx, filled.segment, rows, mix, minLength, design.fairwayWidth);
    if (fitted) {
      const segment = ctx.caps ? shrinkToBerths(fitted.segment, fitted.rows) : fitted.segment;
      const built = snapToModules(ctx, segment, distance(fitted.segment.start, fitted.segment.end), fitted.rows, mix);
      if (built) piers.push({ segment: built.segment, rows: built.rows, fillOptions: {} });
    }
  }
  return piers;
}

/**
 * The berth count below which a candidate cannot matter. Pruning relies on the search
 * score growing with the berth count, which does not hold for 'minInfrastructure'.
 */
const floorFor = (ctx: SearchContext, ...counts: number[]): number =>
  ctx.objective.id === 'minInfrastructure' ? 0 : Math.max(0, ...counts);

/**
 * Best offset for parallel piers at the given angle and spacing. Candidates that cannot
 * reach `atLeast` berths are of no interest to the caller and may be skipped.
 */
function bestParallel(
  ctx: SearchContext,
  strategy: StrategyId,
  angle: number,
  spacing: number,
  atLeast = 0,
  step = OFFSET_STEP,
): Candidate | null {
  let best: Candidate | null = null;
  for (let offset = 0; offset < spacing; offset += step) {
    const candidate = parallelCandidate(ctx, strategy, angle, offset, spacing, floorFor(ctx, best?.berths ?? 0, atLeast));
    if (candidate && better(candidate, best, ctx.objective)) best = candidate;
  }
  return best;
}

/**
 * Strategy D: one main pier lying along a shoreline segment, with berths on the water
 * side only (DECISIONS D4). Every shoreline segment is tried; the best one is returned.
 */
function bestShoreParallel(ctx: SearchContext): Candidate | null {
  const { prepared, design, params } = ctx;
  const { site } = prepared;
  const width = params.mainPierWidth;
  let best: Candidate | null = null;
  for (let i = 0; i + 1 < site.shoreline.length; i++) {
    const a = site.shoreline[i]!;
    const b = site.shoreline[i + 1]!;
    const segmentLength = distance(a, b);
    if (segmentLength < design.minBayFootprint) continue;
    const dir = scale(sub(b, a), 1 / segmentLength);
    const left = { x: -dir.y, y: dir.x };
    const mid = add(a, scale(dir, segmentLength / 2));
    // Which side of the shoreline segment is water?
    const side: PierSide | null = pointInRing(add(mid, scale(left, 1)), site.water)
      ? 'left'
      : pointInRing(add(mid, scale(left, -1)), site.water)
        ? 'right'
        : null;
    if (!side) continue;
    const toWater = side === 'left' ? left : scale(left, -1);
    // D49: the pier lies the gangway gap off the shore.
    const base = add(a, scale(toWater, width / 2 + params.shoreGap));

    // The centreline and both edges of the pier must be in buildable water.
    let intervals: [number, number][] | null = null;
    for (const lateral of [0, width / 2 - EPS, -(width / 2 - EPS)]) {
      const from = add(base, scale(toWater, lateral));
      const clipped = clipSegmentToRegion(from, add(from, scale(dir, segmentLength)), prepared.structureRegion).map(
        ([t0, t1]): [number, number] => [t0 * segmentLength, t1 * segmentLength],
      );
      intervals = intervals === null ? clipped : intersectIntervals(intervals, clipped);
    }
    for (const [t0, t1] of intervals ?? []) {
      const length = Math.min(params.maxMainPierLength, t1 - t0);
      if (length < design.minBayFootprint) continue;
      const segment = { start: roundVec(add(base, scale(dir, t0))), end: roundVec(add(base, scale(dir, t0 + length))) };
      if (!convexInsideRegion(pierPolygon(segment.start, segment.end, width), prepared.structureRegion)) continue;
      ctx.report.piersPlaced++;
      const mix = newMixState(ctx.fill.classes, ctx.caps);
      // The whole pier lies on the shore, so there is no shore end to keep clear.
      const fillOptions: FillOptions = { sides: [side], rowStart: 0 };
      const filled = fillPier(ctx, segment, mix, design.minBayFootprint, fillOptions);
      if (filled.rows.length === 0) {
        if (ctx.report.blockedPiers.length < MAX_BLOCKED_SAMPLE) ctx.report.blockedPiers.push(segment);
        ctx.report.berthlessPiers++;
        continue;
      }
      const built = snapToModules(ctx, filled.segment, length, filled.rows, mix);
      if (!built) continue;
      const candidate = summarize(ctx, 'D', vectorToBearing(dir) % 180, [{ segment: built.segment, rows: built.rows, fillOptions }]);
      if (better(candidate, best, ctx.objective)) best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Strategy F: groups of piers in different directions
// ---------------------------------------------------------------------------

/** A stretch of shoreline turning less than this from its first segment is one section, degrees. */
const SECTION_TURN = 30;
/** Sections shorter than this get no pier group of their own, m (Assumption: about one bay pair). */
const MIN_SECTION_LENGTH = 15;
/** At most this many sections (the longest) start a group. */
const MAX_SECTIONS = 4;
/** At most this many groups of parallel piers in one layout. */
const MAX_GROUPS = 3;
/** Offset step of the strategy F search: of the first group, and of the groups after it, m. */
const MIXED_OFFSET_STEP = 2;
const MIXED_LATER_STEP = 4;
/** Two pier directions closer than this count as one, degrees. */
const SAME_DIRECTION = 10;
/**
 * How many strategy F candidates are evaluated in full. The search's reach grid is a little
 * lenient, so the best estimate can lose berths in the exact check; the best after it is kept.
 */
const MIXED_POOL_SIZE = 3;
/** The water kept for earlier groups is grown by this, so that groups do not touch, m. */
const GROUP_GAP = 0.05;

const axisDifference = (a: number, b: number): number => {
  const d = Math.abs(normalizeAxis(a) - normalizeAxis(b));
  return Math.min(d, 180 - d);
};

/** A stretch of the shoreline that runs in one direction. */
export interface ShoreSection {
  points: Vec2[];
  /** Axis bearing of the stretch in [0, 180), degrees. */
  bearing: number;
  length: number;
}

/**
 * The shoreline split where it turns by more than `SECTION_TURN` from where the current stretch
 * began; stretches shorter than `MIN_SECTION_LENGTH` are dropped, the longest `MAX_SECTIONS` kept.
 */
export function shoreSections(shoreline: Vec2[]): ShoreSection[] {
  const raw: Vec2[][] = [];
  let current: Vec2[] | null = null;
  let first = 0;
  for (let i = 0; i + 1 < shoreline.length; i++) {
    const a = shoreline[i]!;
    const b = shoreline[i + 1]!;
    if (distance(a, b) === 0) continue;
    const bearing = normalizeAxis(vectorToBearing(sub(b, a)));
    if (current && axisDifference(bearing, first) <= SECTION_TURN) current.push(b);
    else {
      if (current) raw.push(current);
      current = [a, b];
      first = bearing;
    }
  }
  if (current) raw.push(current);
  return raw
    .map((points) => {
      let length = 0;
      for (let i = 0; i + 1 < points.length; i++) length += distance(points[i]!, points[i + 1]!);
      return { points, bearing: mainShorelineBearing(points) ?? 0, length };
    })
    .filter((s) => s.length >= MIN_SECTION_LENGTH)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_SECTIONS);
}

/**
 * The search context for a group placed after `placed`: no structure in the earlier piers, their
 * rows and the fairways in front of the rows and around the pier heads; no boat in the piers and
 * rows, nor in those fairways (`noBerths`), which the new rows may still use as their own fairway.
 */
function contextAfter(ctx: SearchContext, placed: CandidatePier[]): SearchContext {
  if (placed.length === 0) return ctx;
  const width = ctx.params.mainPierWidth;
  const grow = (r: LocalRect): LocalRect => ({ s0: r.s0 - GROUP_GAP, s1: r.s1 + GROUP_GAP, d0: r.d0 - GROUP_GAP, d1: r.d1 + GROUP_GAP });
  const taken: Polygon[] = [];
  const lanes: Polygon[] = [];
  for (const p of placed) {
    const length = distance(p.segment.start, p.segment.end);
    const along = scale(sub(p.segment.end, p.segment.start), 1 / length);
    const left = { x: -along.y, y: along.x };
    const frame = { origin: add(p.segment.start, scale(left, width / 2)), along, outward: left };
    taken.push(localRectToPolygon(grow({ s0: 0, s1: length, d0: -width, d1: 0 }), frame));
    let headWidth = 0;
    for (const row of p.rows) {
      let sMin = Infinity;
      let sMax = -Infinity;
      for (const run of row.runs) {
        sMin = Math.min(sMin, run[0]!.s);
        const last = run[run.length - 1]!;
        sMax = Math.max(sMax, last.s + last.geometry.footprint);
      }
      taken.push(localRectToPolygon(grow({ s0: sMin, s1: sMax, d0: 0, d1: row.depth }), row.frame));
      lanes.push(localRectToPolygon(grow({ s0: 0, s1: length, d0: row.depth, d1: row.depth + row.fairwayWidth }), row.frame));
      headWidth = Math.max(headWidth, row.fairwayWidth);
    }
    const reach = (side: PierSide): number => {
      const row = p.rows.find((r) => r.side === side);
      return row ? row.depth + row.fairwayWidth : 0;
    };
    lanes.push(localRectToPolygon(grow({ s0: length, s1: length + headWidth, d0: -width - reach('right'), d1: reach('left') }), frame));
  }
  // The rectangles become holes of the regions. They may overlap each other and the region's edge:
  // the region tests (point, segment, convex polygon) treat a point in any hole as outside, so no
  // polygon overlay is needed, which keeps the search fast.
  const prepared: PreparedSite = {
    ...ctx.prepared,
    structureRegion: withHoles(ctx.prepared.structureRegion, [...taken, ...lanes]),
    navigableRegion: withHoles(ctx.prepared.navigableRegion, taken),
  };
  const noBerths: Region = lanes.map((outer) => ({ outer: ensureCounterClockwise(outer), holes: [] }));
  return { ...ctx, prepared, fill: { ...ctx.fill, prepared, noBerths } };
}

/** The region with the rectangles cut out as holes of the parts they reach (search only). */
function withHoles(region: Region, rects: Polygon[]): Region {
  return region.map((part) => {
    const box = boundingBox(part.outer);
    const extra = rects.filter((r) => boxesOverlap(boundingBox(r), box));
    return extra.length > 0 ? { outer: part.outer, holes: [...part.holes, ...extra] } : part;
  });
}

/**
 * A way to place one group: piers at `angle`, optionally only those starting from `section`, and
 * of those only the ones within `band` (fractions 0–1 of the section's width across the piers).
 */
interface PierFamily {
  angle: number;
  section: ShoreSection | null;
  band?: [number, number];
}

/** Parts of a shore section the first group may take, so that another direction gets room. */
const FIRST_GROUP_BANDS: [number, number][] = [
  [0, 1],
  [0, 1 / 2],
  [1 / 2, 1],
  [0, 1 / 3],
  [2 / 3, 1],
];

interface GroupChoice {
  family: PierFamily;
  piers: CandidatePier[];
  mix: MixState;
  /** All piers so far, this group included, summarized. */
  candidate: Candidate;
}

/**
 * Which piers a family accepts, and its band across the piers (the lateral axis of `bestGroup`
 * and `sizeZonedLayout` with direction +1), m.
 */
function familyFilter(ctx: SearchContext, family: PierFamily): { keep?: (segment: PierSegment) => boolean; band: [number, number] | null } {
  // A pier belongs to a section when its shore end lies within the gangway gap (plus the pier
  // width for an oblique shore) of it.
  const near = ctx.params.shoreGap + ctx.params.mainPierWidth + SHORE_TOLERANCE;
  const dir = bearingToVector(family.angle);
  const lateral = { x: dir.y, y: -dir.x };
  let band: [number, number] | null = null;
  if (family.section && family.band) {
    const us = family.section.points.map((p) => dot(p, lateral));
    const lo = Math.min(...us);
    const hi = Math.max(...us);
    band = [lo + family.band[0] * (hi - lo) - EPS, lo + family.band[1] * (hi - lo) + EPS];
  }
  const range = band;
  const keep = family.section
    ? (segment: PierSegment) => {
        if (distancePointToPolyline(segment.start, family.section!.points) > near) return false;
        if (!range) return true;
        const u = dot(segment.start, lateral);
        return u >= range[0] && u <= range[1];
      }
    : undefined;
  return { ...(keep ? { keep } : {}), band };
}

/** The best offset for a group of `family` after `placed`, judged on the whole layout. */
function bestGroup(
  ctx: SearchContext,
  gctx: SearchContext,
  family: PierFamily,
  placed: CandidatePier[],
  mixIn: MixState,
  placements: Map<string, PierSegment[]>,
  step: number,
): GroupChoice | null {
  const { design } = ctx;
  const { keep } = familyFilter(ctx, family);
  let best: GroupChoice | null = null;
  for (let offset = 0; offset < design.pitch; offset += step) {
    const mix = cloneMix(mixIn);
    const piers = parallelPiers(gctx, 'F', family.angle, offset, design.pitch, mix, 0, keep, placements);
    if (!piers || piers.length === 0) continue;
    for (const p of piers) p.fill = gctx.fill;
    const candidate = summarize(ctx, 'F', family.angle, [...placed, ...piers]);
    if (better(candidate, best?.candidate ?? null, ctx.objective)) best = { family, piers, mix, candidate };
  }
  return best;
}

/**
 * Strategy F: groups of parallel piers in different directions, each square to its own stretch of
 * shore. The first group is the piers of one shore section; the next groups, in the water left
 * free, take the direction (of any section) that adds the most reachable berths. The rows of a
 * later group may face an earlier group's fairway, so fairways are shared rather than duplicated,
 * and every berth must be reachable from the entrance through a fairway of its width (reach grid),
 * which keeps the water between the groups open. Only layouts with at least two directions count.
 */
function bestMixed(base: SearchContext): Candidate[] {
  if (base.params.orientation !== 'auto') return [];
  const ctx: SearchContext = base.caps ? { ...base, balanceLastPier: false } : base;
  const sections = shoreSections(ctx.prepared.site.shoreline);
  const firsts: PierFamily[] = sections.flatMap((section) =>
    FIRST_GROUP_BANDS.map((band) => ({ angle: normalizeAxis(section.bearing + 90), section, band })),
  );
  const angles: number[] = [];
  for (const f of firsts) if (!angles.some((a) => axisDifference(a, f.angle) < SAME_DIRECTION)) angles.push(f.angle);
  if (angles.length < 2) return [];
  const later: PierFamily[] = angles.map((angle) => ({ angle, section: null }));

  const found: Candidate[] = [];
  // Different starts often lead to the same piers; their reduced site is computed once.
  const contexts = new Map<string, SearchContext>();
  const placementsOf = new Map<SearchContext, Map<string, PierSegment[]>>();
  const seenFirst = new Set<string>();
  const pierKey = (piers: CandidatePier[]) => piers.map((p) => `${p.segment.start.x},${p.segment.start.y},${p.segment.end.x},${p.segment.end.y}`).sort().join(';');
  const contextFor = (placed: CandidatePier[]): SearchContext => {
    const k = pierKey(placed);
    let c = contexts.get(k);
    if (!c) {
      c = contextAfter(ctx, placed);
      contexts.set(k, c);
    }
    return c;
  };
  for (const first of firsts) {
    let placed: CandidatePier[] = [];
    let mix = newMixState(ctx.fill.classes, ctx.caps);
    let current: Candidate | null = null;
    const groupAngles: number[] = [];
    for (let round = 0; round < MAX_GROUPS; round++) {
      // With target counts (D20) nothing more can be placed once every count is met.
      if (round > 0 && capsReached(mix)) break;
      const gctx = contextFor(placed);
      let choice: GroupChoice | null = null;
      for (const family of round === 0 ? [first] : later) {
        let placements = placementsOf.get(gctx);
        if (!placements) placementsOf.set(gctx, (placements = new Map()));
        const g = bestGroup(ctx, gctx, family, placed, mix, placements, round === 0 ? MIXED_OFFSET_STEP : MIXED_LATER_STEP);
        if (!g) continue;
        // A group must add berths that can be reached, not just move them around.
        if (current && !(g.candidate.berths > current.berths)) continue;
        if (better(g.candidate, choice?.candidate ?? null, ctx.objective)) choice = g;
      }
      if (!choice) break;
      placed = [...placed, ...choice.piers];
      mix = choice.mix;
      current = choice.candidate;
      groupAngles.push(choice.family.angle);
      // Starts with the same first group continue the same way: follow only the first of them.
      if (round === 0) {
        const k = pierKey(placed);
        if (seenFirst.has(k)) {
          current = null;
          break;
        }
        seenFirst.add(k);
      }
    }
    const distinct: number[] = [];
    for (const a of groupAngles) if (!distinct.some((d) => axisDifference(a, d) < SAME_DIRECTION)) distinct.push(a);
    if (!current || distinct.length < 2) continue;
    const candidate: Candidate = { ...current, angle: groupAngles[0]!, angles: distinct };
    // The same piers can come from several starts; keep one of each.
    if (!found.some((c) => pierKey(c.piers) === pierKey(candidate.piers))) found.push(candidate);
  }
  found.sort((x, y) => (better(x, y, ctx.objective) ? -1 : better(y, x, ctx.objective) ? 1 : 0));
  return found.slice(0, MIXED_POOL_SIZE);
}

// ---------------------------------------------------------------------------
// Strategy F with size zoning (D68)
// ---------------------------------------------------------------------------

/** Offset step of the size-zoned groups' search, m. */
const ZONED_MIXED_STEP = 6;
/**
 * The size-zoned groups are searched asking for this many times the berths of the best
 * one-direction layout (more than fit, to rank the offsets, as E does). Measured on four test
 * basins (L-shaped bay, U, corner, wide L) with 1, 1.25, 1.5 and 2: 1.25 gave the most berths
 * in all four (I129).
 */
const ZONED_MIXED_PROBE = 1.25;
/** Parts of a stretch of shore the first size-zoned group may take. */
const ZONED_FIRST_BANDS: [number, number][] = [
  [0, 1 / 2],
  [1 / 2, 1],
];
/** Fractions of the largest complete total that are tried (see `bestZonedMixed`). */
const ZONED_MIXED_TOTALS = [1, 0.9, 0.8];
/** How many of the best first groups (each start) are followed by the search for the second one. */
const ZONED_MIXED_SHORTLIST = 1;

/**
 * Strategy F with every row sized by its own boats, as strategy E (D68). The first group is a
 * size-zoned layout on one half of a stretch of shore, square to it, from the largest boats down; the second, in the
 * water left free and in the other direction, goes on with the same berth quotas. As in E, the
 * total is the largest for which every class gets its full share (bisection).
 */
function bestZonedMixed(base: SearchContext, reference: number): Candidate | null {
  if (base.params.orientation !== 'auto') return null;
  const ctx: SearchContext = base.caps ? { ...base, balanceLastPier: false } : base;
  const zoned0 = zonedContext(ctx);
  if (zoned0.zones.length < 2) return null;
  const largest = zoned0.zones[0]!;
  const firstModule = ctx.params.mainPierWidth + 2 * largest.depth + largest.fairway;
  const capLimit = ctx.caps ? Object.values(ctx.caps).reduce((a, b) => a + b, 0) : Infinity;
  const zonedOf = new Map<SearchContext, ZonedContext>([[ctx, zoned0]]);
  const zonedFor = (c: SearchContext): ZonedContext => {
    let z = zonedOf.get(c);
    if (!z) zonedOf.set(c, (z = zonedContext(c)));
    return z;
  };
  const quotaMix = (total: number): MixState => ({ ...newMixState(zoned0.classes), quota: apportion(total, zoned0.classes) });

  interface Plan {
    first: PierFamily;
    one: Omit<ZonedOptions, 'total' | 'order'>;
    two: Omit<ZonedOptions, 'total' | 'order'> | null;
  }
  /** Both groups for `total` berths; the second only if the first leaves quota. */
  const build = (plan: Plan, total: number, order: boolean) => {
    const mix = quotaMix(total);
    const one = sizeZonedLayout(ctx, zoned0, { ...plan.one, total, order }, mix).piers;
    let two: CandidatePier[] = [];
    if (plan.two && mix.total < total) {
      const c2 = contextAfter(ctx, one);
      two = sizeZonedLayout(c2, zonedFor(c2), { ...plan.two, total, order }, mix).piers;
    }
    return { one, two, placed: mix.total };
  };

  let best: Candidate | null = null;
  const sections = shoreSections(ctx.prepared.site.shoreline);
  const angles: number[] = [];
  for (const section of sections) {
    const a = normalizeAxis(section.bearing + 90);
    if (!angles.some((x) => axisDifference(x, a) < SAME_DIRECTION)) angles.push(a);
  }
  if (angles.length < 2) return null;
  const firsts: PierFamily[] = sections.flatMap((section) =>
    ZONED_FIRST_BANDS.map((band) => ({ angle: normalizeAxis(section.bearing + 90), section, band })),
  );
  for (const first of firsts) {
    const others = angles.filter((a) => axisDifference(a, first.angle) >= SAME_DIRECTION);
    if (others.length === 0) continue;
    const { keep, band } = familyFilter(ctx, first);
    // Ask for more berths than fit, to rank the start offsets (as E does).
    const probe = Math.min(capLimit, Math.ceil(reference * ZONED_MIXED_PROBE) + 10);
    const ones: { one: Plan['one']; reached: number; mix: MixState; piers: CandidatePier[] }[] = [];
    for (const direction of [1, -1] as const) {
      const range: [number, number] | undefined = band ? (direction === 1 ? band : [-band[1], -band[0]]) : undefined;
      for (let offset = ctx.params.mainPierWidth / 2; offset < firstModule; offset += ZONED_MIXED_STEP) {
        const one = { angle: first.angle, direction, head: 'own' as const, offset, ...(range ? { range } : {}), ...(keep ? { keep } : {}) };
        const mix = quotaMix(probe);
        const piers = sizeZonedLayout(ctx, zoned0, { ...one, total: probe, order: false }, mix).piers;
        if (piers.length > 0) ones.push({ one, reached: summarize(ctx, 'F', first.angle, piers).berths, mix, piers });
      }
    }
    ones.sort((x, y) => y.reached - x.reached);
    let bestPlan: { plan: Plan; placed: number; reached: number } | null = null;
    for (const o of ones.slice(0, ZONED_MIXED_SHORTLIST)) {
      const c2 = contextAfter(ctx, o.piers);
      for (const angle of others) {
        for (const direction of [1, -1] as const) {
          for (let offset = ctx.params.mainPierWidth / 2; offset < firstModule; offset += ZONED_MIXED_STEP) {
            const two = { angle, direction, head: 'own' as const, offset };
            const mix = cloneMix(o.mix);
            const piers = sizeZonedLayout(c2, zonedFor(c2), { ...two, total: probe, order: false }, mix).piers;
            if (piers.length === 0) continue;
            // Judged by the berths that can be reached: the second group must not wall off the first.
            const reached = summarize(ctx, 'F', first.angle, [...o.piers, ...piers]).berths;
            if (!bestPlan || reached > bestPlan.reached) bestPlan = { plan: { first, one: o.one, two }, placed: mix.total, reached };
          }
        }
      }
    }
    if (!bestPlan) continue;
    // The largest total for which every class gets its full share.
    const complete = (total: number) => build(bestPlan!.plan, total, false).placed === total;
    let high = Math.min(probe, bestPlan.placed);
    // Start the bisection near the berths the search placed; below that only if it must.
    let low = Math.floor(high * 0.6);
    if (low > 0 && !complete(low)) low = 0;
    if (complete(high)) low = high;
    else {
      while (high - low > 1) {
        const mid = (low + high) >> 1;
        if (complete(mid)) low = mid;
        else high = mid;
      }
    }
    if (low <= 0) continue;
    const plan = bestPlan.plan;
    // Asking for fewer berths can leave a fairway open that the full total closes: a few
    // totals below the largest complete one are tried and the one reaching most berths kept.
    let chosen: { total: number; built: ReturnType<typeof build>; candidate: Candidate } | null = null;
    for (const k of ZONED_MIXED_TOTALS) {
      const total = Math.max(1, Math.floor(low * k));
      const built = build(plan, total, false);
      if (built.two.length === 0) continue; // one direction only: that is strategy E
      const candidate = summarize(ctx, 'F', first.angle, [...built.one, ...built.two]);
      if (!chosen || better(candidate, chosen.candidate, ctx.objective)) chosen = { total, built, candidate };
    }
    if (!chosen) continue;
    const { total, candidate } = chosen;
    candidate.angles = [first.angle, plan.two!.angle];
    candidate.zoned = true;
    candidate.rebuild = () => {
      const again = build(plan, total, true);
      return [...again.one, ...again.two];
    };
    if (better(candidate, best, ctx.objective)) best = candidate;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Strategy E: piers sized by boat class
// ---------------------------------------------------------------------------

/** Split `total` berths over the classes by target share (largest remainder method). */
export function apportion(total: number, classes: BoatClass[]): Record<string, number> {
  const shareSum = classes.reduce((sum, c) => sum + c.share, 0);
  const exact = classes.map((c) => (total * c.share) / shareSum);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);
  const byRemainder = exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    counts[i]!++;
    left--;
  }
  return Object.fromEntries(classes.map((c, i) => [c.id, counts[i]!]));
}

interface ZonedOptions {
  angle: number;
  /** +1: the largest boats start at the low end of the lateral axis; -1: at the high end. */
  direction: 1 | -1;
  /** Clear water at the pier heads: by each pier's own largest boat, or by the largest class everywhere. */
  head: 'own' | 'widest';
  /** Distance of the first pier line from the edge of the site, m. */
  offset: number;
  /** Number of berths to place; split over the classes by target share. */
  total: number;
  /** Order the runs by boat length (final layout) or not (search). */
  order: boolean;
  /** D68: only pier lines within this range of the forward axis, m (the offset counts from its start). */
  range?: [number, number];
  /** D68: only the piers this accepts (e.g. those starting from one stretch of shore). */
  keep?: (segment: PierSegment) => boolean;
}

/**
 * One size-zoned layout (DECISIONS D10). Piers are placed one after another across the
 * site. Each row is designed for the largest class that still has berths to place, so
 * rows go from the largest boats to the smallest, and every row gets the depth and the
 * fairway of its own boats instead of those of the largest class:
 *
 *   row depth     = slot length of the row's largest class
 *   fairway width = the wider of what the two rows facing it need
 *   pier position = previous row edge + fairway + row depth + half the pier width
 *
 * Because sizes only go down along the way, the fairway in front of a row is always
 * decided by the row placed before it, which is already known.
 */
function sizeZonedLayout(
  ctx: SearchContext,
  zoned: ZonedContext,
  options: ZonedOptions,
  /** D68: continue the quotas of an earlier group (updated in place); `total` is then not used. */
  shared?: MixState,
): { piers: CandidatePier[]; placed: number } {
  const { prepared, params } = ctx;
  const { classes } = zoned;
  const width = params.mainPierWidth;
  const dir = bearingToVector(options.angle);
  const forward = scale({ x: dir.y, y: -dir.x }, options.direction);
  const extent = extentAlong(prepared.site, forward);
  const min = options.range ? options.range[0] : extent.min;
  const max = options.range ? Math.min(options.range[1], extent.max) : extent.max;
  const mix: MixState = shared ?? { ...newMixState(classes), quota: apportion(options.total, classes) };
  const nextClass = (): ZoneClass | undefined => zoned.zones.find((z) => (mix.counts[z.boat.id] ?? 0) < (mix.quota![z.boat.id] ?? 0));

  const piers: CandidatePier[] = [];
  /** Far edge of the last row placed, and the fairway that row needs in front of it. */
  let previous: { edge: number; fairway: number } | null = null;
  let skipped = 0;
  for (;;) {
    const back = nextClass();
    if (!back) break;
    // The fairway behind this pier must suit both the row before it and its own back row.
    const gap: number = previous ? Math.max(previous.fairway, back.fairway) : back.fairway;
    const u: number = (previous ? previous.edge + gap + back.depth + width / 2 : min + options.offset) + skipped;
    if (u > max) break;
    const headWidth = options.head === 'widest' ? zoned.zones[0]!.fairway : back.fairway;
    const segments = placePiersOnLine(prepared, scale(forward, u), dir, {
      width,
      shoreGap: params.shoreGap,
      maxLength: params.maxMainPierLength,
      headClearance: headWidth,
      minLength: params.shoreOffset + back.minFootprint,
    });

    let frontDesign: ZoneClass | null = null;
    let placedHere = false;
    for (const raw of segments) {
      let segment: PierSegment = { start: roundVec(raw.start), end: roundVec(raw.end) };
      if (options.keep && !options.keep(segment)) continue;
      const along = scale(sub(segment.end, segment.start), 1 / distance(segment.start, segment.end));
      // Which side of this pier looks forward depends on which way the pier runs.
      const frontSide: PierSide = dot({ x: -along.y, y: along.x }, forward) > 0 ? 'left' : 'right';
      const backSide: PierSide = frontSide === 'left' ? 'right' : 'left';
      const filled = segment.end;
      const fillBoth = (on: PierSegment, order: boolean) => {
        const pier = { id: '', ...on, width };
        let rows = fillPierRows(pier, zoned.context(back, gap, order), mix, { sides: [backSide] });
        const front = nextClass();
        if (front) rows = [...rows, ...fillPierRows(pier, zoned.context(front, front.fairway, order), mix, { sides: [frontSide] })];
        return { rows, front };
      };

      // Unordered first: it decides the pier's final length (head clearance, target counts, modules).
      const first = fillBoth(segment, false);
      if (first.rows.length === 0) continue;
      const fitted = fitHead(ctx, segment, first.rows, mix, params.shoreOffset + back.minFootprint, headWidth);
      if (!fitted) continue;
      segment = ctx.caps ? shrinkToBerths(fitted.segment, fitted.rows) : fitted.segment;
      let built = snapToModules(ctx, segment, distance(fitted.segment.start, fitted.segment.end), fitted.rows, mix);
      if (!built) continue;
      let front = first.front;
      // I103: the rows are filled again on the final length, so that the search and the final
      // build (runs ordered, larger boats towards the head) keep the same boats. Trimming rows
      // that were ordered first would drop the largest boats at the head.
      if (options.order || distance(built.segment.end, filled) > 1e-9) {
        trimRows(built.rows, 0, mix);
        const again = fillBoth(built.segment, options.order);
        if (again.rows.length === 0) continue;
        built = { segment: built.segment, rows: again.rows };
        front = again.front;
      }
      piers.push({ segment: built.segment, rows: built.rows, fillOptions: {} });
      placedHere = true;
      if (front && built.rows.some((r) => r.side === frontSide)) frontDesign = front;
    }

    if (!placedHere) {
      // Nothing could be built on this line; try one metre further on.
      skipped += 1;
      continue;
    }
    skipped = 0;
    previous = frontDesign
      ? { edge: u + width / 2 + frontDesign.depth, fairway: frontDesign.fairway }
      : { edge: u + width / 2, fairway: 0 };
  }
  return { piers, placed: mix.total };
}

interface ZoneClass {
  boat: BoatClass;
  /** Row depth for this class, m. */
  depth: number;
  /** Fairway width this class needs, m. */
  fairway: number;
  /** Shortest bay of this class or a smaller one, m. */
  minFootprint: number;
}

interface ZonedContext {
  classes: BoatClass[];
  /** Active classes, longest first. */
  zones: ZoneClass[];
  /** Fill context for a row designed for `zone` with `fairway` kept clear in front of it. */
  context: (zone: ZoneClass, fairway: number, order: boolean) => FillContext;
}

function zonedContext(ctx: SearchContext): ZonedContext {
  const { params } = ctx;
  const { pattern, prepared, classes } = ctx.fill;
  const active = activeClasses(classes);
  const footprint = (c: BoatClass) => pattern.bay([c], 0, params).footprint;
  const zones: ZoneClass[] = [...active]
    .sort((a, b) => b.length - a.length)
    .map((boat) => ({
      boat,
      depth: pattern.slotLength(boat, params),
      fairway: fairwayWidthFor(boat.length, params, pattern.berthType),
      minFootprint: Math.min(...active.filter((c) => c.length <= boat.length).map(footprint)),
    }));
  const cache = new Map<string, FillContext>();
  return {
    classes,
    zones,
    context: (zone, fairway, order) => {
      const key = `${zone.boat.id}|${fairway}|${order}`;
      let context = cache.get(key);
      if (!context) {
        context = {
          prepared,
          classes,
          params,
          pattern,
          design: { rowDepth: zone.depth, fairwayWidth: fairway, pitch: 0, minBayFootprint: zone.minFootprint },
          orderRuns: order,
          maxBoatLength: zone.boat.length,
          ...(ctx.fill.noBerths ? { noBerths: ctx.fill.noBerths } : {}),
        };
        cache.set(key, context);
      }
      return context;
    },
  };
}

/**
 * Strategy E: the best size-zoned layout square to the shore. For every start offset and
 * both directions, the largest total is found (by bisection) for which every class gets
 * its full share; the candidate with the most reachable berths wins.
 */
function bestSizeZoned(ctx: SearchContext, angle: number): Candidate | null {
  const all = zonedContext(ctx);
  if (all.zones.length < 2) return null; // with one class there is nothing to zone
  // A class whose own module does not fit anywhere would hold the whole layout back
  // (no total could give it its share). Such classes are left out; the others are placed
  // and the deviation from the target mix shows in the statistics (DECISIONS D3).
  const placeable = new Set(
    all.zones
      .filter((zone) =>
        ([1, -1] as const).some(
          (direction) =>
            sizeZonedLayout(ctx, zonedContextFor(ctx, [zone.boat]), {
              angle,
              direction,
              head: 'own',
              offset: ctx.params.mainPierWidth / 2,
              total: 1e6,
              order: false,
            }).placed > 0,
        ),
      )
      .map((zone) => zone.boat.id),
  );
  if (placeable.size === 0) return null;
  const zoned =
    placeable.size === all.zones.length
      ? all
      : zonedContextFor(ctx, ctx.fill.classes.map((c) => (placeable.has(c.id) ? c : { ...c, share: 0 })));
  const smallest = zoned.zones[zoned.zones.length - 1]!;
  const largest = zoned.zones[0]!;
  // With target counts no class may get more than its count: the total asked for is
  // limited to the counts of the classes that can be placed (D20).
  const capLimit = ctx.caps
    ? zoned.zones.reduce((sum, zone) => sum + (ctx.caps![zone.boat.id] ?? 0), 0)
    : Infinity;
  const firstModule = ctx.params.mainPierWidth + 2 * largest.depth + largest.fairway;

  /** Largest total in [lo, hi] for which the layout places every berth asked for. */
  const largestComplete = (base: Omit<ZonedOptions, 'total' | 'order'>, lo: number, hi: number): number => {
    const complete = (total: number) => sizeZonedLayout(ctx, zoned, { ...base, total, order: false }).placed === total;
    let low = Math.max(0, Math.floor(lo));
    let high = Math.max(low, Math.ceil(hi));
    if (complete(high)) return high;
    if (low > 0 && !complete(low)) low = 0;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (complete(mid)) low = mid;
      else high = mid;
    }
    return low;
  };

  const placedWith = (base: Omit<ZonedOptions, 'total' | 'order'>, total: number): number =>
    sizeZonedLayout(ctx, zoned, { ...base, total, order: false }).placed;

  let best: Candidate | null = null;
  const consider = (head: ZonedOptions['head']): boolean => {
    let allReachable = true;
    for (const direction of [1, -1] as const) {
      const first = { angle, direction, head, offset: ctx.params.mainPierWidth / 2 };
      // An upper bound for the total: fill the site with the smallest class only.
      const ceiling = Math.min(
        capLimit,
        sizeZonedLayout(ctx, zonedContextFor(ctx, [smallest.boat]), { ...first, total: 1e6, order: false }).placed,
      );
      const reference = largestComplete(first, 0, ceiling);
      if (reference <= 0) continue;
      // Rank the start offsets cheaply: ask for more berths than can fit and see how many
      // are placed. The exact search is then run for the most promising offsets only.
      const probe = Math.min(ceiling, Math.ceil(reference * 1.25) + 4);
      const offsets: { offset: number; placed: number }[] = [];
      for (let offset = first.offset; offset < firstModule; offset += ZONED_OFFSET_STEP) {
        offsets.push({ offset, placed: placedWith({ ...first, offset }, probe) });
      }
      offsets.sort((x, y) => y.placed - x.placed || x.offset - y.offset);
      for (const { offset } of offsets.slice(0, ZONED_SHORTLIST)) {
        const base = { ...first, offset };
        const total = largestComplete(base, reference * 0.8, Math.min(ceiling, reference * 1.3 + 4));
        if (total <= 0) continue;
        const built = sizeZonedLayout(ctx, zoned, { ...base, total, order: false });
        if (built.piers.length === 0) continue;
        const candidate = summarize(ctx, 'E', angle, built.piers);
        if (candidate.berths < built.placed) allReachable = false;
        candidate.rebuild = () => sizeZonedLayout(ctx, zoned, { ...base, total, order: true }).piers;
        if (better(candidate, best, ctx.objective)) best = candidate;
      }
    }
    return allReachable;
  };
  // Narrow heads first; if they cut large boats off from the entrance, also try wide heads.
  if (!consider('own')) consider('widest');
  return best;
}

/** A zoned context restricted to some classes (used for the upper bound of the total). */
function zonedContextFor(ctx: SearchContext, classes: BoatClass[]): ZonedContext {
  return zonedContext({ ...ctx, fill: { ...ctx.fill, classes } });
}

// ---------------------------------------------------------------------------
// From candidate to layout
// ---------------------------------------------------------------------------

const fmt = (v: number): string => v.toFixed(1);
const fmtAngle = (deg: number): string => `${Math.round(deg * 10) / 10}°`;

const STRATEGY_NAME: Record<StrategyId, (c: Candidate) => string> = {
  A: () => 'A – Piers perpendicular to shore',
  B: () => 'B – Perpendicular, every other pier',
  C: (c) => `C – Best orientation (${fmtAngle(c.angle)})`,
  D: () => 'D – Shore-parallel pier',
  E: () => 'E – Piers sized by boat class',
  F: (c) => `F – Mixed directions${c.zoned ? ', sized by boat class' : ''} (${(c.angles ?? [c.angle]).map(fmtAngle).join(' / ')})`,
};

/**
 * Fill a pier of a candidate again with the runs ordered by boat length. A pier of strategy F is
 * filled in its group's site; if that would change its rows (the mix can differ from the search),
 * the rows of the search are kept, since the later groups were placed around exactly those.
 */
function refill(pier: MainPier, p: CandidatePier, fill: FillContext, mix: MixState): FilledRow[] {
  if (!p.fill) return fillPierRows(pier, fill, mix, p.fillOptions);
  const trial = cloneMix(mix);
  const rows = fillPierRows(pier, fill, trial, p.fillOptions);
  const extent = (rs: FilledRow[]) =>
    rs.map((r) => `${r.side}:${r.runs.map((run) => `${run[0]!.s.toFixed(3)}-${(run[run.length - 1]!.s + run[run.length - 1]!.geometry.footprint).toFixed(3)}x${run.reduce((n, b) => n + b.boats.length, 0)}`).join(',')}`).join('|');
  const same = extent(rows) === extent(p.rows);
  const kept = same ? rows : p.rows;
  for (const row of kept) for (const run of row.runs) for (const bay of run) for (const boat of bay.boats) {
    mix.counts[boat.id] = (mix.counts[boat.id] ?? 0) + 1;
    mix.total++;
  }
  return kept;
}

/**
 * Build the layout elements of a candidate. The piers are filled again, this time with
 * the runs ordered by boat length (the search skips that step because it does not change
 * the berth counts).
 */
function toDraft(candidate: Candidate, id: string, ctx: SearchContext): LayoutDraft {
  const width = ctx.params.mainPierWidth;
  const fill: FillContext = { ...ctx.fill, orderRuns: true };
  const mix = newMixState(fill.classes, ctx.caps);
  const piers: MainPier[] = [];
  const fingers: Finger[] = [];
  const berths: Berth[] = [];
  const rebuilt = candidate.rebuild?.();
  (rebuilt ?? candidate.piers).forEach((p, i) => {
    const pier: MainPier = { id: `P${i + 1}`, start: p.segment.start, end: p.segment.end, width, locked: false, origin: 'generated' };
    const elements = rowsToElements(pier.id, rebuilt ? p.rows : refill(pier, p, p.fill ? { ...p.fill, orderRuns: true } : fill, mix));
    piers.push(pier);
    fingers.push(...elements.fingers);
    berths.push(...elements.berths);
  });
  return {
    id,
    name: STRATEGY_NAME[candidate.strategy](candidate),
    strategy: candidate.strategy,
    piers,
    fingers,
    berths,
    modified: false,
  };
}

/**
 * Remove berths that cannot be reached from the entrance (SPEC §5.5: a bay is kept only
 * if it passes the checks of §6), together with fingers and piers left without berths.
 * The number removed is recorded on the layout so that it can be shown to the user.
 */
function pruneUnreachable(draft: LayoutDraft, ctx: SearchContext): { draft: LayoutDraft; reachabilityChecked: boolean } {
  const { prepared, params } = ctx;
  let current = draft;
  let removed = 0;
  /** True when the last pass found every remaining berth reachable. */
  let reachabilityChecked = false;
  // Removing berths only frees water, so this settles quickly; the cap is a safeguard.
  for (let pass = 0; pass < 3; pass++) {
    const rows = layoutRows(current.piers, current.fingers, current.berths, ctx.fill.classes, params);
    const unreachable = new Set<string>();
    for (const cutOff of cutOffBerths(current, rows, prepared).values()) {
      for (const berth of cutOff) unreachable.add(berth.id);
    }
    if (unreachable.size === 0) {
      reachabilityChecked = true;
      break;
    }
    removed += unreachable.size;
    const berths = current.berths.filter((b) => !unreachable.has(b.id));
    const piers = current.piers.filter((p) => berths.some((b) => b.pierId === p.id));
    const fingers = current.fingers.filter((f) => {
      const pier = piers.find((p) => p.id === f.pierId);
      if (!pier) return false;
      const { left } = pierAxis(pier);
      const centre = f.shape.reduce((c, v) => ({ x: c.x + v.x / f.shape.length, y: c.y + v.y / f.shape.length }), { x: 0, y: 0 });
      const side: PierSide = dot(sub(centre, pier.start), left) > 0 ? 'left' : 'right';
      const frame = rowFrame(pier, side);
      const finger = toLocalRect(f.shape, frame);
      // Keep a finger while a remaining berth lies directly next to it.
      return berths.some((b) => {
        if (b.pierId !== pier.id || b.side !== side) return false;
        const slot = toLocalRect(b.slot, frame);
        return Math.abs(slot.s0 - finger.s1) < 0.005 || Math.abs(slot.s1 - finger.s0) < 0.005;
      });
    });
    current = { ...current, piers, fingers, berths, unreachableRemoved: removed };
  }
  return { draft: current, reachabilityChecked };
}

const within = (a: number, b: number, fraction: number): boolean =>
  Math.abs(a - b) <= fraction * Math.max(a, b);

/** SPEC §5.8: same berth count and pier count within 2 %. */
export const isNearDuplicate = (a: Layout, b: Layout): boolean =>
  within(a.stats.totalBerths, b.stats.totalBerths, DUPLICATE_TOLERANCE) &&
  within(a.piers.length, b.piers.length, DUPLICATE_TOLERANCE);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Pier length taken by one berth on average when the classes follow their target shares, m. */
function meanBerthAdvance(classes: BoatClass[], params: Params, pattern: BerthPattern): number {
  const active = activeClasses(classes);
  const perBay = pattern.boatsPerBay(params);
  const shareSum = active.reduce((sum, c) => sum + c.share, 0);
  return active.reduce(
    (sum, c) => sum + (c.share / shareSum) * (pattern.bay(Array<BoatClass>(perBay).fill(c), 0, params).advance / perBay),
    0,
  );
}

export function generateLayouts(input: GenerateInput, pattern: BerthPattern = patternFor(input.params.berthType)): GenerateResult {
  const { site, params } = input;
  // With target counts (D20) the classes carry the shares implied by the counts, and the
  // counts become upper limits.
  const boatClasses = mixClasses(input.boatClasses, params);
  const caps = berthCaps(input.boatClasses, params);
  const objective = effectiveObjective(input.objective, input.boatClasses, params);
  const topN = input.topN ?? DEFAULT_TOP_N;
  const fail = (code: Diagnostic['code'], message: string): GenerateResult => ({
    layouts: [],
    diagnostics: [{ code, message }],
  });

  if (site.water.length < 3 || polygonArea(site.water) <= 0) {
    return fail('NO_WATER_AREA', 'Draw the water area first.');
  }
  if (site.shoreline.length < 2) {
    return fail('NO_SHORELINE', 'Draw the shoreline first: piers must connect to it.');
  }
  if (distance(site.entrance.a, site.entrance.b) === 0) {
    return fail('NO_ENTRANCE', 'Set the entrance first: berths must be reachable from it.');
  }
  const design = rowDesign(boatClasses, params, pattern);
  if (!design) {
    return fail(
      'NO_BOAT_CLASSES',
      caps ? 'Give at least one boat class a target count above 0.' : 'Add at least one boat class with a target share above 0 %.',
    );
  }

  const prepared = prepareSite(site, params);
  const ctx: SearchContext = {
    prepared,
    design,
    ...(caps ? { caps } : {}),
    params,
    objective,
    reachGrids: new Map(),
    meanBerthAdvance: meanBerthAdvance(boatClasses, params, pattern),
    // Ordering the runs does not change berth counts, so the search skips it.
    fill: { prepared, classes: boatClasses, params, pattern, design, orderRuns: false },
    report: { shoreRuns: 0, longestShoreRun: 0, piersPlaced: 0, berthlessPiers: 0, blockedPiers: [] },
  };

  const orientations = candidateOrientations(site, params);
  const pool: Candidate[] = [];

  // A: perpendicular to the shore, a pier at every pitch.
  const a = bestParallel(ctx, 'A', orientations.shorePerpendicular, design.pitch);
  if (a) pool.push(a);
  // B: perpendicular to the shore, a pier at every other pitch.
  const b = bestParallel(ctx, 'B', orientations.shorePerpendicular, 2 * design.pitch);
  if (b) pool.push(b);
  // C: the best orientations of the sweep (the shore-perpendicular one is already covered by A).
  const perOrientation: Candidate[] = [];
  // First a coarse pass over every orientation (offsets 4 m apart), then the full 1 m
  // sweep for the orientations that came within reach of the best few. An orientation
  // far behind after the coarse pass cannot make up the difference with a finer offset.
  const coarse: { angle: number; berths: number }[] = [];
  for (const angle of orientations.all) {
    if (angle === orientations.shorePerpendicular) continue;
    const c = bestParallel(ctx, 'C', angle, design.pitch, 0, COARSE_OFFSET_STEP);
    if (c) coarse.push({ angle, berths: c.berths });
  }
  coarse.sort((x, y) => y.berths - x.berths || x.angle - y.angle);
  const cutoff = (coarse[C_POOL_SIZE - 1]?.berths ?? 0) * COARSE_KEEP_FRACTION;
  for (const { angle, berths } of coarse) {
    if (berths < cutoff && objective.id !== 'minInfrastructure') continue;
    // Only the best few orientations are kept, so an orientation need not be searched
    // below the berth count of the weakest one that would currently be kept.
    const kept = perOrientation.map((x) => x.berths).sort((x, y) => y - x);
    const c = bestParallel(ctx, 'C', angle, design.pitch, kept[C_POOL_SIZE - 1] ?? 0);
    if (c) perOrientation.push(c);
  }
  perOrientation.sort((x, y) => (better(x, y, objective) ? -1 : better(y, x, objective) ? 1 : x.angle - y.angle));
  pool.push(...perOrientation.slice(0, C_POOL_SIZE));
  // D: a single pier along the shore.
  const d = bestShoreParallel(ctx);
  if (d) pool.push(d);
  // E: piers square to the shore, each row sized by its own boat classes.
  const e = process.env.MARINA_NO_E ? null : bestSizeZoned(ctx, orientations.shorePerpendicular);
  if (e) pool.push(e);
  // F: groups of piers in different directions, each square to its own stretch of shore.
  // F with every row sized by its own boats (D68); with uniform modules (D67) where that gives
  // nothing (e.g. one boat class). Asked for twice the berths of the best one-direction layout.
  const zonedMixed = bestZonedMixed(ctx, Math.max(0, ...pool.map((c) => c.berths)));
  if (zonedMixed) pool.push(zonedMixed);
  else pool.push(...bestMixed(ctx));

  if (pool.length === 0) return { layouts: [], diagnostics: explainEmpty(ctx) };

  const evaluated = pool
    .map((candidate, i) => pruneUnreachable(toDraft(candidate, `L${i + 1}`, ctx), ctx))
    .filter(({ draft }) => draft.berths.length > 0)
    // The connection to the entrance has just been checked for exactly these elements.
    .map(({ draft, reachabilityChecked }) =>
      evaluateLayout(draft, prepared, boatClasses, params, { assumeConnected: reachabilityChecked }),
    );
  if (evaluated.length === 0) {
    return fail('ALL_BERTHS_BLOCKED', 'No berth can be reached from the entrance through a fairway of the required width.');
  }
  const ranked = rankLayouts(evaluated, objective);
  // I98: an orientation of the sweep (C) that is a near-duplicate of the perpendicular layout (A)
  // adds nothing; A is kept as the named family (SPEC §5.7) whichever ranks higher.
  const perpendicular = ranked.filter((l) => l.strategy === 'A');
  // Of the strategy F candidates evaluated in full, the best one is kept.
  const bestF = ranked.find((l) => l.strategy === 'F');
  const distinct = ranked.filter((l) => (l.strategy !== 'C' || !perpendicular.some((a) => isNearDuplicate(a, l))) && (l.strategy !== 'F' || l === bestF));
  const kept: Layout[] = [];
  for (const layout of distinct) {
    if (kept.some((k) => isNearDuplicate(k, layout))) continue;
    kept.push(layout);
    if (kept.length >= topN) break;
  }
  return { layouts: kept, diagnostics: [] };
}

/**
 * Width of water available for a pier module at a pier that got no berths: the pier
 * width plus the deepest box, one minimum bay wide and square to the pier, that fits in
 * navigable water beside it (tried at up to nine positions on both sides).
 */
function availableModuleWidth(ctx: SearchContext, segment: PierSegment, maxDepth: number): number {
  const width = ctx.params.mainPierWidth;
  const bay = ctx.design.minBayFootprint;
  const length = distance(segment.start, segment.end);
  const along = scale(sub(segment.end, segment.start), 1 / length);
  const left = { x: -along.y, y: along.x };
  const fits = (outward: Vec2, s: number, depth: number): boolean =>
    convexInsideRegion(
      localRectToPolygon(
        { s0: s, s1: s + bay, d0: 0, d1: depth },
        { origin: add(segment.start, scale(outward, width / 2)), along, outward },
      ),
      ctx.prepared.navigableRegion,
    );
  let best = 0;
  const positions = Math.max(1, Math.min(9, Math.floor((length - bay) / bay) + 1));
  for (const outward of [left, scale(left, -1)]) {
    for (let i = 0; i < positions; i++) {
      const s = positions === 1 ? 0 : ((length - bay) * i) / (positions - 1);
      if (!fits(outward, s, best + 0.05)) continue; // cannot beat the best so far
      let lo = best;
      let hi = maxDepth;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (fits(outward, s, mid)) lo = mid;
        else hi = mid;
      }
      best = lo;
    }
  }
  return width + best;
}

/** Why no layout with at least one berth could be produced (SPEC §5, last paragraph). */
function explainEmpty(ctx: SearchContext): Diagnostic[] {
  const { params, report } = ctx;
  const diagnostics: Diagnostic[] = [];
  // What the least demanding boat class needs: with size zoning (strategy E) a site is
  // usable as soon as one class fits.
  const { pattern } = ctx.fill;
  const needs = activeClasses(ctx.fill.classes).map((c) => ({
    reach: pattern.slotLength(c, params) + fairwayWidthFor(c.length, params, pattern.berthType),
    pierRun: params.shoreOffset + pattern.bay([c], 0, params).footprint + fairwayWidthFor(c.length, params, pattern.berthType),
    fairway: fairwayWidthFor(c.length, params, pattern.berthType),
  }));
  const reach = Math.min(...needs.map((n) => n.reach));
  const moduleWidth = params.mainPierWidth + reach;
  const available = Math.max(0, ...report.blockedPiers.map((p) => availableModuleWidth(ctx, p, reach + 5)));
  const tooNarrow = report.blockedPiers.length > 0 && available < moduleWidth;
  if (tooNarrow) {
    diagnostics.push({
      code: 'WATER_NARROWER_THAN_MODULE',
      message: `Water area narrower than one pier module (needs ${fmt(moduleWidth)} m, available ${fmt(available)} m).`,
    });
  }
  const shortest = needs.reduce((a, b) => (b.pierRun < a.pierRun ? b : a));
  const needed = shortest.pierRun;
  if (report.shoreRuns === 0) {
    diagnostics.push({ code: 'NO_PIER_REACHES_SHORE', message: 'No pier can reach the shoreline.' });
  } else if (report.longestShoreRun < needed) {
    diagnostics.push({
      code: 'WATER_TOO_SHORT_FOR_PIER',
      message: `Water is too short for a pier from the shore: the longest run is ${fmt(report.longestShoreRun)} m, but ${fmt(needed)} m is needed (one bay plus ${fmt(shortest.fairway)} m clear water at the pier head).`,
    });
  }
  if (diagnostics.length === 0 || (report.berthlessPiers > 0 && !tooNarrow)) {
    diagnostics.push({
      code: 'ALL_BERTHS_BLOCKED',
      message: 'All candidate berths intersect obstacles or restricted zones, or have no room for a fairway.',
    });
  }
  return diagnostics;
}
