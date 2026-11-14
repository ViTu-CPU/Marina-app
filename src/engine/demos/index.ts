import { DEFAULT_ANCHORING } from '../anchoring';
import { DEFAULT_BOAT_CLASSES, DEFAULT_COST, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { circumscribedCirclePolygon } from '../geometry';
import { PROJECT_SCHEMA_VERSION, type Project, type Site } from '../model';

/**
 * Built-in demo projects (SPEC §9). They are fictional sites, not real places.
 */

/** Demo 1: rectangular basin 220 m × 140 m, shore along the south edge. */
export const RECT_BASIN_SITE: Site = {
  water: [
    { x: 0, y: 0 },
    { x: 220, y: 0 },
    { x: 220, y: 140 },
    { x: 0, y: 140 },
  ],
  shoreline: [
    { x: 0, y: 0 },
    { x: 220, y: 0 },
  ],
  // North-east corner: the northernmost 30 m of the east edge.
  entrance: { a: { x: 220, y: 110 }, b: { x: 220, y: 140 } },
  obstacles: [
    {
      id: 'rock-1',
      kind: 'rock',
      // Rock Ø 12 m as a 16-gon that contains the circle.
      shape: circumscribedCirclePolygon({ x: 150, y: 70 }, 6, 16),
    },
  ],
  zones: [],
};

/**
 * Demo 2: L-shaped bay. Area = 260 × 90 + 120 × 110 = 36 600 m².
 * Shore along the west and south edges, an existing pier from the west shore and a
 * no-navigation zone (e.g. a swimming area) in the north-west corner.
 */
export const IRREGULAR_BAY_SITE: Site = {
  water: [
    { x: 0, y: 0 },
    { x: 260, y: 0 },
    { x: 260, y: 90 },
    { x: 120, y: 90 },
    { x: 120, y: 200 },
    { x: 0, y: 200 },
  ],
  shoreline: [
    { x: 0, y: 200 },
    { x: 0, y: 0 },
    { x: 260, y: 0 },
  ],
  // East end of the east arm.
  entrance: { a: { x: 260, y: 20 }, b: { x: 260, y: 90 } },
  obstacles: [
    {
      id: 'old-pier-1',
      kind: 'pier',
      shape: [
        { x: 0, y: 118 },
        { x: 40, y: 118 },
        { x: 40, y: 122 },
        { x: 0, y: 122 },
      ],
    },
  ],
  zones: [
    {
      id: 'swim-1',
      kind: 'noNavigation',
      shape: [
        { x: 0, y: 165 },
        { x: 45, y: 165 },
        { x: 45, y: 200 },
        { x: 0, y: 200 },
      ],
    },
  ],
};

function demoProject(name: string, site: Site): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name,
    site,
    boatClasses: DEFAULT_BOAT_CLASSES,
    params: DEFAULT_PARAMS,
    objective: DEFAULT_OBJECTIVE,
    layouts: [],
    preferredLayoutId: null,
    background: null,
    map: null,
    anchoring: DEFAULT_ANCHORING,
    cost: DEFAULT_COST,
    generatedFrom: null,
  };
}

export interface DemoEntry {
  id: 'rectBasin' | 'irregularBay';
  /** Returns a fresh deep copy so callers can never mutate the built-in data. */
  create: () => Project;
}

export const DEMO_PROJECTS: DemoEntry[] = [
  { id: 'rectBasin', create: () => structuredClone(demoProject('Rectangular basin', RECT_BASIN_SITE)) },
  { id: 'irregularBay', create: () => structuredClone(demoProject('Irregular bay', IRREGULAR_BAY_SITE)) },
];
