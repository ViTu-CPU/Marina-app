import type { BoatClass, CostSettings, ObjectiveSettings, Params } from './model';

/**
 * Default dock and fairway parameters (SPEC §4).
 *
 * These are ASSUMPTIONS for a feasibility-level study, not values taken from any
 * standard. They must be reviewed by a qualified marina engineer. Only `fairwayFactor`
 * follows a published guideline: 1.75 L_b, the minimum fairway width without side-ties in
 * California DBW, Layout and Design Guidelines for Marina Berthing Facilities (2005),
 * Table B-2 (DECISIONS D27). SPEC §4 had 1.5.
 */
export const DEFAULT_PARAMS: Params = {
  mainPierWidth: 3.0,
  fingerWidth: 0.8,
  fingerLengthRatio: 0.8,
  boatsPerBay: 2,
  beamClearance: 0.5,
  lengthClearance: 0.5,
  fairwayFactor: 1.75,
  fairwayMin: 8.0,
  obstacleClearance: 2.0,
  maxMainPierLength: 150,
  orientation: 'auto',
  shoreOffset: 0,
  berthTarget: 'share',
};

/** Default boat mix (SPEC §9). */
export const DEFAULT_BOAT_CLASSES: BoatClass[] = [
  { id: 'c5', name: '5 m', length: 5.0, beam: 2.0, color: '#38bdf8', share: 0.3, count: 30 },
  { id: 'c7', name: '7 m', length: 7.0, beam: 2.5, color: '#34d399', share: 0.35, count: 35 },
  { id: 'c9', name: '9 m', length: 9.0, beam: 3.0, color: '#fbbf24', share: 0.25, count: 25 },
  { id: 'c12', name: '12 m', length: 12.0, beam: 3.5, color: '#f87171', share: 0.1, count: 10 },
];

export const DEFAULT_OBJECTIVE: ObjectiveSettings = {
  id: 'maxCapacity',
  targetBerths: 0,
  weights: { capacity: 1, pontoon: 1, fairway: 1 },
};

/** Number of alternatives returned by the generator (SPEC §5.8). */
export const DEFAULT_TOP_N = 5;

/** Default product choices (D24): everything chosen automatically from the built-in price list. */
export const DEFAULT_COST: CostSettings = { priceList: null, pontoonSeries: '', fingerSeries: '', gangwaySeries: '' };
