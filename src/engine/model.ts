/**
 * Data model of the marina layout engine (SPEC §4).
 *
 * Everything here is plain JSON-serialisable data: no classes, no functions, no DOM types.
 * Units: metres in a local Cartesian system, x = east, y = north. Angles stored in the
 * model are degrees clockwise from north (the UI convention); the engine converts to
 * radians internally.
 *
 * Deviations from the SPEC §4 starting point are marked "Extension" and are listed in
 * docs/DECISIONS.md.
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Closed ring, counter-clockwise, without a repeated end point. */
export type Polygon = Vec2[];
export type Polyline = Vec2[];

export interface Segment {
  a: Vec2;
  b: Vec2;
}

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

export type ObstacleKind = 'pier' | 'rock' | 'island' | 'structure' | 'other';
export type ZoneKind = 'noStructures' | 'noNavigation' | 'protected';

export interface Obstacle {
  id: string;
  kind: ObstacleKind;
  shape: Polygon;
}

export interface RestrictedZone {
  id: string;
  kind: ZoneKind;
  shape: Polygon;
}

export interface Site {
  /** Permitted planning water area. */
  water: Polygon;
  /** Where piers may connect to land. */
  shoreline: Polyline;
  /** Line segment where boats enter/leave the marina. */
  entrance: Segment;
  obstacles: Obstacle[];
  zones: RestrictedZone[];
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface BoatClass {
  id: string;
  name: string;
  /** Boat length overall, m. */
  length: number;
  /** Boat beam, m. */
  beam: number;
  color: string;
  /** Target fraction (0..1) of the berth COUNT. A target, not a hard constraint (D3). */
  share: number;
}

export interface Params {
  /** Main pier (walkway pontoon) width, m. */
  mainPierWidth: number;
  /** Finger pier width, m. */
  fingerWidth: number;
  /** Finger length = ratio × boat length (assumption, not a standard). */
  fingerLengthRatio: number;
  /** 1 = finger between every boat, 2 = two boats share a bay. */
  boatsPerBay: 1 | 2;
  /** Total extra width per boat in a berth, m. */
  beamClearance: number;
  /** Extra length per berth, m. */
  lengthClearance: number;
  /** Fairway width = factor × longest adjacent boat length. */
  fairwayFactor: number;
  /** Absolute minimum fairway width, m. */
  fairwayMin: number;
  /** Minimum distance structures/boats ↔ obstacles, m. */
  obstacleClearance: number;
  /** Maximum length of one main pier, m. */
  maxMainPierLength: number;
  /** Pier direction in degrees clockwise from north, or 'auto' to let the generator search. */
  orientation: 'auto' | number;
  /** Extension (D5): distance from the shore end of a pier to the first finger/berth, m. */
  shoreOffset: number;
}

export type ObjectiveId = 'maxCapacity' | 'spaceEfficiency' | 'minInfrastructure' | 'balanced';

export interface ObjectiveSettings {
  id: ObjectiveId;
  /** Used by 'minInfrastructure': layouts below this berth count are heavily penalised. */
  targetBerths: number;
  /** Used by 'balanced'. Need not sum to 1; they are normalised when used. */
  weights: { capacity: number; pontoon: number; fairway: number };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface MainPier {
  id: string;
  /** Shore end of the centreline. */
  start: Vec2;
  /** Head (water) end of the centreline. */
  end: Vec2;
  width: number;
  locked: boolean;
  origin: 'generated' | 'manual';
}

export interface Finger {
  id: string;
  pierId: string;
  shape: Polygon;
}

export type PierSide = 'left' | 'right';

export interface Berth {
  id: string;
  pierId: string;
  /** Side of the pier when looking from `start` towards `end`. */
  side: PierSide;
  boatClassId: string;
  /** The water rectangle reserved for the boat (incl. clearances). */
  slot: Polygon;
  /** Simplified top-view boat rectangle inside the slot. */
  boat: Polygon;
  removed: boolean;
  issues: Issue[];
}

export interface Fairway {
  id: string;
  shape: Polygon;
  requiredWidth: number;
}

export type IssueSeverity = 'error' | 'warning';

export interface Issue {
  severity: IssueSeverity;
  /** Stable machine-readable code, e.g. 'SLOT_OUTSIDE_WATER'. */
  code: string;
  message: string;
  elementId?: string;
}

/**
 * 'operationalOK' means only "meets the constraints configured by the user".
 * It is never a statement about safety or regulatory compliance.
 */
export type Feasibility = 'geometricFail' | 'geometricOK' | 'operationalOK';

export interface Stats {
  totalBerths: number;
  /** Berth count per boat class id (classes with zero berths included). */
  berthsByClass: Record<string, number>;
  /** Sum of main pier centreline lengths, m. */
  mainPierLength: number;
  /** Sum of finger lengths, m. */
  fingerLength: number;
  /** mainPierLength + fingerLength, m. */
  pontoonLength: number;
  /** Deck area of main piers and fingers, m². */
  pontoonDeckArea: number;
  /** Water occupied by the marina: berth slots + fairways, m². */
  marinaWaterArea: number;
  /** Water area not occupied by pontoons, slots or fairways, m². */
  freeWaterArea: number;
  berthsPer1000m2: number;
  /** Pontoon metres per berth; 0 when there are no berths. */
  pontoonPerBerth: number;
  /** Extension (D3): sum over classes of |actual share − target share| / 2, 0..1. */
  mixDeviation: number;
  issueCounts: Record<IssueSeverity, number>;
}

export interface Layout {
  id: string;
  name: string;
  strategy: string;
  piers: MainPier[];
  fingers: Finger[];
  berths: Berth[];
  fairways: Fairway[];
  feasibility: Feasibility;
  issues: Issue[];
  stats: Stats;
  score: number;
  /** True once the user edits it manually. */
  modified: boolean;
}

// ---------------------------------------------------------------------------
// Project document
// ---------------------------------------------------------------------------

/** Background image placement (SPEC §3.2). The image itself is stored as a data URL. */
export interface BackgroundImage {
  dataUrl: string;
  /** World position of the image's top-left corner, m. */
  origin: Vec2;
  /** Metres per image pixel, from the two-point calibration. */
  metresPerPixel: number;
  /** Rotation in degrees clockwise. */
  rotation: number;
  opacity: number;
}

export const PROJECT_SCHEMA_VERSION = 1;

/** The complete saved state of one study: what goes into the JSON project file. */
export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  name: string;
  site: Site;
  boatClasses: BoatClass[];
  params: Params;
  objective: ObjectiveSettings;
  layouts: Layout[];
  preferredLayoutId: string | null;
  background: BackgroundImage | null;
}
