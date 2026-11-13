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
  fillPierRows,
  newMixState,
  rowDesign,
  rowsToElements,
  summarizeRows,
  type FillContext,
  type FilledRow,
  type FillOptions,
  type RowDesign,
} from './fill';
import {
  add,
  bearingToVector,
  clipSegmentToRegion,
  convexInsideRegion,
  distance,
  dot,
  EPS,
  intersectIntervals,
  pointInRing,
  polygonArea,
  roundVec,
  scale,
  sub,
  vectorToBearing,
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
  Site,
  Vec2,
} from './model';
import { fingerPierPattern, localRectToPolygon, type BerthPattern } from './patterns';
import { buildReachGrid, isSwept, reachableCells, type OccupiedBox, type ReachGrid } from './reach';
import { layoutRows, pierAxis, rowFrame, toLocalRect } from './rows';
import { rankLayouts } from './score';
import {
  pierPolygon,
  placePiersOnLine,
  prepareSite,
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

export type StrategyId = 'A' | 'B' | 'C' | 'D';

/** Offset sweep step across one pier pitch, m (SPEC §5.4). */
export const OFFSET_STEP = 1;
/** Orientation sweep step, degrees (SPEC §5.2). */
export const ANGLE_STEP = 5;
/** How many berth-less piers are remembered for the diagnostics. */
const MAX_BLOCKED_SAMPLE = 200;
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
}

interface Candidate {
  strategy: StrategyId;
  /** Pier axis bearing, degrees. */
  angle: number;
  piers: CandidatePier[];
  /** Berths that can be reached from the entrance (estimated on the reach grid). */
  berths: number;
  pontoonLength: number;
}

interface SearchContext {
  prepared: PreparedSite;
  fill: FillContext;
  design: RowDesign;
  params: Params;
  objective: ObjectiveSettings;
  reachGrid: ReachGrid;
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

/**
 * Berth count and pontoon length of a candidate. Only berths that a boat can reach from
 * the entrance are counted, so the search does not favour layouts that wall off part of
 * the site (estimated on the reach grid; the exact check follows for the layouts returned).
 */
function summarize(ctx: SearchContext, strategy: StrategyId, angle: number, piers: CandidatePier[]): Candidate {
  const { design, reachGrid } = ctx;
  const occupied: OccupiedBox[] = [];
  let pontoonLength = 0;
  for (const p of piers) {
    const length = distance(p.segment.start, p.segment.end);
    pontoonLength += length + summarizeRows(p.rows).fingerLength;
    const first = p.rows[0]!;
    const width = ctx.params.mainPierWidth;
    // The pier itself, expressed in the frame of its first row (d < 0 is under the pier).
    occupied.push({ origin: first.frame.origin, along: first.frame.along, outward: first.frame.outward, s0: 0, s1: length, d0: -width, d1: 0 });
    for (const row of p.rows) {
      let sMin = Infinity;
      let sMax = -Infinity;
      for (const run of row.runs) {
        sMin = Math.min(sMin, run[0]!.s);
        const last = run[run.length - 1]!;
        sMax = Math.max(sMax, last.s + last.geometry.footprint);
      }
      occupied.push({ origin: row.frame.origin, along: row.frame.along, outward: row.frame.outward, s0: sMin, s1: sMax, d0: 0, d1: design.rowDepth });
    }
  }
  const reached = reachableCells(reachGrid, occupied);
  const mid = design.rowDepth + design.fairwayWidth / 2;
  let berths = 0;
  for (const p of piers) {
    for (const row of p.rows) {
      const { origin, along, outward } = row.frame;
      for (const run of row.runs) {
        for (const bay of run) {
          const s = bay.s + bay.geometry.footprint / 2;
          const x = origin.x + s * along.x + mid * outward.x;
          const y = origin.y + s * along.y + mid * outward.y;
          if (isSwept(reachGrid, reached, x, y, design.fairwayWidth / 2)) berths += bay.boats.length;
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
function trimRows(rows: FilledRow[], length: number, mix: { total: number; counts: Record<string, number> }): FilledRow[] {
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

/** Step by which a pier is shortened when its head is not clear, m. */
const HEAD_SHORTEN_STEP = 1;

/**
 * True when boats can turn around the pier head: the water beyond the head is navigable
 * for one fairway width, across the pier, its rows and the fairways in front of them.
 */
function headIsClear(ctx: SearchContext, segment: PierSegment, rows: FilledRow[]): boolean {
  const { design, params, prepared } = ctx;
  const length = distance(segment.start, segment.end);
  const along = scale(sub(segment.end, segment.start), 1 / length);
  const left = { x: -along.y, y: along.x };
  const reach = design.rowDepth + design.fairwayWidth;
  const frame = { origin: add(segment.start, scale(left, params.mainPierWidth / 2)), along, outward: left };
  const box = localRectToPolygon(
    {
      s0: length,
      s1: length + design.fairwayWidth,
      d0: -params.mainPierWidth - (rows.some((r) => r.side === 'right') ? reach : 0),
      d1: rows.some((r) => r.side === 'left') ? reach : 0,
    },
    frame,
  );
  return convexInsideRegion(box, prepared.navigableRegion);
}

/** One candidate: parallel piers at `spacing`, the first one `offset` from the edge of the site. */
function parallelCandidate(
  ctx: SearchContext,
  strategy: StrategyId,
  angle: number,
  offset: number,
  spacing: number,
): Candidate {
  const { prepared, design, params } = ctx;
  const dir = bearingToVector(angle);
  const lateral = { x: dir.y, y: -dir.x }; // to the right of the pier direction
  const { min, max } = extentAlong(prepared.site, lateral);
  const mix = newMixState(ctx.fill.classes);
  const piers: CandidatePier[] = [];
  for (let u = min + offset; u <= max; u += spacing) {
    const segments = placePiersOnLine(
      prepared,
      scale(lateral, u),
      dir,
      {
        width: params.mainPierWidth,
        maxLength: params.maxMainPierLength,
        headClearance: design.fairwayWidth,
        minLength: params.shoreOffset + design.minBayFootprint,
      },
      ctx.report,
    );
    for (const raw of segments) {
      let segment = { start: roundVec(raw.start), end: roundVec(raw.end) };
      ctx.report.piersPlaced++;
      let rows = fillPierRows({ id: '', ...segment, width: params.mainPierWidth }, ctx.fill, mix);
      if (rows.length === 0) {
        // Slanted candidates of the sweep are left out: a box square to a slanted pier
        // measures the site diagonally, which would make the diagnostic misleading.
        if (strategy !== 'C' && ctx.report.blockedPiers.length < MAX_BLOCKED_SAMPLE) ctx.report.blockedPiers.push(segment);
        ctx.report.berthlessPiers++;
        continue;
      }
      if (!headIsClear(ctx, segment, rows)) {
        // Where the water ends at an angle, the rows reach it before the pier's centreline
        // does. Shorten the pier until boats can turn around its head.
        const full = distance(segment.start, segment.end);
        const minLength = params.shoreOffset + design.minBayFootprint;
        let shortened: PierSegment | null = null;
        let length = full;
        for (let cut = HEAD_SHORTEN_STEP; full - cut >= minLength; cut += HEAD_SHORTEN_STEP) {
          length = full - cut;
          const end = roundVec(add(segment.start, scale(sub(segment.end, segment.start), length / full)));
          if (headIsClear(ctx, { start: segment.start, end }, rows)) {
            shortened = { start: segment.start, end };
            break;
          }
        }
        // Drop the bays beyond the new head (the final layout is filled afresh in toDraft).
        rows = shortened ? trimRows(rows, length, mix) : trimRows(rows, 0, mix);
        if (!shortened || rows.length === 0) continue;
        segment = shortened;
      }
      piers.push({ segment, rows, fillOptions: {} });
    }
  }
  return summarize(ctx, strategy, angle, piers);
}

/** Best offset for parallel piers at the given angle and spacing. */
function bestParallel(ctx: SearchContext, strategy: StrategyId, angle: number, spacing: number): Candidate | null {
  let best: Candidate | null = null;
  for (let offset = 0; offset < spacing; offset += OFFSET_STEP) {
    const candidate = parallelCandidate(ctx, strategy, angle, offset, spacing);
    if (better(candidate, best, ctx.objective)) best = candidate;
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
    const base = add(a, scale(toWater, width / 2));

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
      const mix = newMixState(ctx.fill.classes);
      // The whole pier lies on the shore, so there is no shore end to keep clear.
      const fillOptions: FillOptions = { sides: [side], rowStart: 0 };
      const rows = fillPierRows({ id: '', ...segment, width }, ctx.fill, mix, fillOptions);
      if (rows.length === 0) {
        if (ctx.report.blockedPiers.length < MAX_BLOCKED_SAMPLE) ctx.report.blockedPiers.push(segment);
        ctx.report.berthlessPiers++;
        continue;
      }
      const candidate = summarize(ctx, 'D', vectorToBearing(dir) % 180, [{ segment, rows, fillOptions }]);
      if (better(candidate, best, ctx.objective)) best = candidate;
    }
  }
  return best;
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
};

/**
 * Build the layout elements of a candidate. The piers are filled again, this time with
 * the runs ordered by boat length (the search skips that step because it does not change
 * the berth counts).
 */
function toDraft(candidate: Candidate, id: string, ctx: SearchContext): LayoutDraft {
  const width = ctx.params.mainPierWidth;
  const fill: FillContext = { ...ctx.fill, orderRuns: true };
  const mix = newMixState(fill.classes);
  const piers: MainPier[] = [];
  const fingers: Finger[] = [];
  const berths: Berth[] = [];
  candidate.piers.forEach((p, i) => {
    const pier: MainPier = { id: `P${i + 1}`, start: p.segment.start, end: p.segment.end, width, locked: false, origin: 'generated' };
    const elements = rowsToElements(pier.id, fillPierRows(pier, fill, mix, p.fillOptions));
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
 */
function pruneUnreachable(draft: LayoutDraft, ctx: SearchContext): LayoutDraft {
  const { prepared, params } = ctx;
  let current = draft;
  // Removing berths only frees water, so this settles quickly; the cap is a safeguard.
  for (let pass = 0; pass < 3; pass++) {
    const rows = layoutRows(current.piers, current.fingers, current.berths, ctx.fill.classes, params);
    const unreachable = new Set<string>();
    for (const cutOff of cutOffBerths(current, rows, prepared).values()) {
      for (const berth of cutOff) unreachable.add(berth.id);
    }
    if (unreachable.size === 0) break;
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
    current = { ...current, piers, fingers, berths };
  }
  return current;
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

export function generateLayouts(input: GenerateInput, pattern: BerthPattern = fingerPierPattern): GenerateResult {
  const { site, boatClasses, params, objective } = input;
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
    return fail('NO_BOAT_CLASSES', 'Add at least one boat class with a target share above 0 %.');
  }

  const prepared = prepareSite(site, params);
  const ctx: SearchContext = {
    prepared,
    design,
    params,
    objective,
    reachGrid: buildReachGrid(prepared, design.fairwayWidth),
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
  for (const angle of orientations.all) {
    if (angle === orientations.shorePerpendicular) continue;
    const c = bestParallel(ctx, 'C', angle, design.pitch);
    if (c) perOrientation.push(c);
  }
  perOrientation.sort((x, y) => (better(x, y, objective) ? -1 : better(y, x, objective) ? 1 : x.angle - y.angle));
  pool.push(...perOrientation.slice(0, C_POOL_SIZE));
  // D: a single pier along the shore.
  const d = bestShoreParallel(ctx);
  if (d) pool.push(d);

  if (pool.length === 0) return { layouts: [], diagnostics: explainEmpty(ctx) };

  const evaluated = pool
    .map((candidate, i) => pruneUnreachable(toDraft(candidate, `L${i + 1}`, ctx), ctx))
    .filter((draft) => draft.berths.length > 0)
    .map((draft) => evaluateLayout(draft, prepared, boatClasses, params));
  if (evaluated.length === 0) {
    return fail('ALL_BERTHS_BLOCKED', 'No berth can be reached from the entrance through a fairway of the required width.');
  }
  const ranked = rankLayouts(evaluated, objective);
  const kept: Layout[] = [];
  for (const layout of ranked) {
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
  const { design, params, report } = ctx;
  const diagnostics: Diagnostic[] = [];
  const moduleWidth = params.mainPierWidth + design.rowDepth + design.fairwayWidth;
  const reach = design.rowDepth + design.fairwayWidth;
  const available = Math.max(0, ...report.blockedPiers.map((p) => availableModuleWidth(ctx, p, reach + 5)));
  const tooNarrow = report.blockedPiers.length > 0 && available < moduleWidth;
  if (tooNarrow) {
    diagnostics.push({
      code: 'WATER_NARROWER_THAN_MODULE',
      message: `Water area narrower than one pier module (needs ${fmt(moduleWidth)} m, available ${fmt(available)} m).`,
    });
  }
  const needed = params.shoreOffset + design.minBayFootprint + design.fairwayWidth;
  if (report.shoreRuns === 0) {
    diagnostics.push({ code: 'NO_PIER_REACHES_SHORE', message: 'No pier can reach the shoreline.' });
  } else if (report.longestShoreRun < needed) {
    diagnostics.push({
      code: 'WATER_TOO_SHORT_FOR_PIER',
      message: `Water is too short for a pier from the shore: the longest run is ${fmt(report.longestShoreRun)} m, but ${fmt(needed)} m is needed (one bay plus ${fmt(design.fairwayWidth)} m clear water at the pier head).`,
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
