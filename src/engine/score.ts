/**
 * Statistics and objectives (SPEC §7).
 */
import { polygonArea } from './geometry';
import type {
  Berth,
  BoatClass,
  Fairway,
  Finger,
  Issue,
  Layout,
  MainPier,
  ObjectiveId,
  ObjectiveSettings,
  Params,
  Stats,
} from './model';
import { pierAxis, rowFrame, toLocalRect } from './rows';
import type { PreparedSite } from './site';
import { mixClasses, targetShortfall } from './targets';

export interface StatsInput {
  piers: MainPier[];
  fingers: Finger[];
  berths: Berth[];
  fairways: Fairway[];
  issues: Issue[];
  unreachableRemoved?: number;
}

export function computeStats(
  layout: StatsInput,
  prepared: PreparedSite,
  projectClasses: BoatClass[],
  params: Pick<Params, 'berthTarget'> = { berthTarget: 'share' },
): Stats {
  // With target counts the target mix is the one implied by the counts (D20).
  const classes = mixClasses(projectClasses, params);
  const active = layout.berths.filter((b) => !b.removed);
  const totalBerths = active.length;

  const berthsByClass: Record<string, number> = Object.fromEntries(classes.map((c) => [c.id, 0]));
  for (const b of active) berthsByClass[b.boatClassId] = (berthsByClass[b.boatClassId] ?? 0) + 1;

  let mainPierLength = 0;
  let pontoonDeckArea = 0;
  const pierById = new Map<string, MainPier>();
  for (const p of layout.piers) {
    const { length } = pierAxis(p);
    mainPierLength += length;
    pontoonDeckArea += length * p.width;
    pierById.set(p.id, p);
  }

  let fingerLength = 0;
  for (const f of layout.fingers) {
    pontoonDeckArea += polygonArea(f.shape);
    const pier = pierById.get(f.pierId);
    if (!pier) continue;
    // A finger's length is its extent perpendicular to its pier.
    const r = toLocalRect(f.shape, rowFrame(pier, 'left'));
    fingerLength += r.d1 - r.d0;
  }

  const slotArea = active.reduce((sum, b) => sum + polygonArea(b.slot), 0);
  const fairwayArea = layout.fairways.reduce(
    (sum, f) => sum + polygonArea(f.shape) - f.holes.reduce((h, ring) => h + polygonArea(ring), 0),
    0,
  );
  const marinaWaterArea = slotArea + fairwayArea;
  const pontoonLength = mainPierLength + fingerLength;

  // Target shares over the classes that take part in the mix.
  const shareSum = classes.reduce((sum, c) => sum + Math.max(0, c.share), 0);
  let mixDeviation = 0;
  if (totalBerths > 0 && shareSum > 0) {
    for (const c of classes) {
      mixDeviation += Math.abs((berthsByClass[c.id] ?? 0) / totalBerths - Math.max(0, c.share) / shareSum);
    }
    mixDeviation /= 2;
  }

  return {
    totalBerths,
    berthsByClass,
    mainPierLength,
    fingerLength,
    pontoonLength,
    pontoonDeckArea,
    fairwayArea,
    marinaWaterArea,
    freeWaterArea: Math.max(0, prepared.openWaterArea - pontoonDeckArea - marinaWaterArea),
    berthsPer1000m2: prepared.waterArea > 0 ? totalBerths / (prepared.waterArea / 1000) : 0,
    pontoonPerBerth: totalBerths > 0 ? pontoonLength / totalBerths : 0,
    mixDeviation,
    unreachableRemoved: layout.unreachableRemoved ?? 0,
    targetShortfall: targetShortfall(classes, params, berthsByClass),
    issueCounts: {
      error: layout.issues.filter((i) => i.severity === 'error').length,
      warning: layout.issues.filter((i) => i.severity === 'warning').length,
    },
  };
}

/**
 * Reference values for the 'balanced' objective, taken over the set of alternatives
 * being compared, so that its three terms are each scaled to 0..1.
 */
export interface ScoreReference {
  maxBerths: number;
  minPontoonLength: number;
  maxFairwayArea: number;
}

export function scoreReference(layouts: Pick<Layout, 'stats'>[]): ScoreReference {
  const withBerths = layouts.filter((l) => l.stats.totalBerths > 0);
  return {
    maxBerths: Math.max(0, ...withBerths.map((l) => l.stats.totalBerths)),
    minPontoonLength: withBerths.length > 0 ? Math.min(...withBerths.map((l) => l.stats.pontoonLength)) : 0,
    maxFairwayArea: Math.max(0, ...withBerths.map((l) => l.stats.fairwayArea)),
  };
}

/** Score given to a layout without berths: below anything a real layout can get. */
const EMPTY_SCORE = -1e9;
/** 'minInfrastructure': penalty per berth short of the target. */
const SHORTFALL_PENALTY = 1000;

type Objective = (layout: Pick<Layout, 'stats'>, settings: ObjectiveSettings, reference: ScoreReference) => number;

/** Each objective is a pure function; a higher score is better. */
export const OBJECTIVES: Record<ObjectiveId, Objective> = {
  /** Total berths. */
  maxCapacity: ({ stats }) => stats.totalBerths,

  /** Berths per 1,000 m² of water area. */
  spaceEfficiency: ({ stats }) => stats.berthsPer1000m2,

  /** Fewest pontoon metres per berth, heavily penalised below the berth target. */
  minInfrastructure: ({ stats }, settings) => {
    if (stats.totalBerths === 0) return EMPTY_SCORE;
    const shortfall = Math.max(0, settings.targetBerths - stats.totalBerths);
    return -stats.pontoonPerBerth - SHORTFALL_PENALTY * shortfall;
  },

  /** Weighted mean of capacity, inverse pontoon length and fairway area, each scaled to 0..1. */
  balanced: ({ stats }, settings, reference) => {
    if (stats.totalBerths === 0) return EMPTY_SCORE;
    const w = settings.weights;
    const weightSum = w.capacity + w.pontoon + w.fairway;
    if (weightSum <= 0) return 0;
    const capacity = reference.maxBerths > 0 ? stats.totalBerths / reference.maxBerths : 0;
    const pontoon = stats.pontoonLength > 0 ? reference.minPontoonLength / stats.pontoonLength : 0;
    const fairway = reference.maxFairwayArea > 0 ? stats.fairwayArea / reference.maxFairwayArea : 0;
    return (w.capacity * capacity + w.pontoon * pontoon + w.fairway * fairway) / weightSum;
  },
};

/**
 * Ranking order (SPEC §7): layouts with geometric errors are never ranked above valid
 * ones; then by score; then by fixed tie-breakers so the order is deterministic.
 */
export function compareLayouts(a: Layout, b: Layout): number {
  const failA = a.feasibility === 'geometricFail' ? 1 : 0;
  const failB = b.feasibility === 'geometricFail' ? 1 : 0;
  if (failA !== failB) return failA - failB;
  if (a.score !== b.score) return b.score - a.score;
  if (a.stats.totalBerths !== b.stats.totalBerths) return b.stats.totalBerths - a.stats.totalBerths;
  if (a.stats.pontoonLength !== b.stats.pontoonLength) return a.stats.pontoonLength - b.stats.pontoonLength;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Score all layouts against a common reference, keeping their order. */
export function scoreLayouts(layouts: Layout[], settings: ObjectiveSettings): Layout[] {
  const reference = scoreReference(layouts);
  return layouts.map((l) => ({ ...l, score: OBJECTIVES[settings.id](l, settings, reference) }));
}

/** Score all layouts against a common reference and return them best first. */
export function rankLayouts(layouts: Layout[], settings: ObjectiveSettings): Layout[] {
  return scoreLayouts(layouts, settings).sort(compareLayouts);
}
