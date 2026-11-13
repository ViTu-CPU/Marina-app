import type { BoatClass, ObjectiveSettings, Params } from './model';

/**
 * Default dock and fairway parameters (SPEC §4).
 *
 * These are ASSUMPTIONS for a feasibility-level study, not values taken from any
 * standard or guideline. They must be reviewed by a qualified marina engineer.
 */
export const DEFAULT_PARAMS: Params = {
  mainPierWidth: 3.0,
  fingerWidth: 0.8,
  fingerLengthRatio: 0.8,
  boatsPerBay: 2,
  beamClearance: 0.5,
  lengthClearance: 0.5,
  fairwayFactor: 1.5,
  fairwayMin: 8.0,
  obstacleClearance: 2.0,
  maxMainPierLength: 150,
  orientation: 'auto',
  shoreOffset: 0,
};

/** Default boat mix (SPEC §9). */
export const DEFAULT_BOAT_CLASSES: BoatClass[] = [
  { id: 'c5', name: '5 m', length: 5.0, beam: 2.0, color: '#38bdf8', share: 0.3 },
  { id: 'c7', name: '7 m', length: 7.0, beam: 2.5, color: '#34d399', share: 0.35 },
  { id: 'c9', name: '9 m', length: 9.0, beam: 3.0, color: '#fbbf24', share: 0.25 },
  { id: 'c12', name: '12 m', length: 12.0, beam: 3.5, color: '#f87171', share: 0.1 },
];

export const DEFAULT_OBJECTIVE: ObjectiveSettings = {
  id: 'maxCapacity',
  targetBerths: 0,
  weights: { capacity: 1, pontoon: 1, fairway: 1 },
};

/** Number of alternatives returned by the generator (SPEC §5.8). */
export const DEFAULT_TOP_N = 5;
