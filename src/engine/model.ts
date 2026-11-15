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

import type { AnchoringParams } from './anchoring';
import type { PriceList } from './catalog';
import type { WaterLevelInfo } from './waterLevels';
import type { WaveSettings } from './waves';

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

/**
 * Extension (D21): an access pontoon — empty pontoon metres, e.g. in front of a quay wall
 * too high to step down from. It carries no berths; main piers may start from either of
 * its long edges, and it is reached from the shore by a gangway.
 */
export interface AccessPontoon {
  id: string;
  /** Centreline end points, m. */
  start: Vec2;
  end: Vec2;
  /** Width, m. */
  width: number;
  /**
   * Extension (D32): gangway positions along the centreline from `start`, m. Missing or
   * empty: one gangway at the middle.
   */
  gangways?: number[];
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
  /** Extension (D21): access pontoons; missing in older files. */
  accessPontoons?: AccessPontoon[];
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
  /**
   * Extension (D20): target number of berths of this class. Used instead of `share` when
   * `Params.berthTarget` is 'count'; the generator then places at most this many.
   */
  count: number;
  /**
   * Extension (D36): boat weight, t. Sizes the stern buoys; when missing it is estimated
   * from the length (Top Marine's table for sailing boats, I79) and flagged.
   */
  weight?: number;
}

/**
 * Extension (D34): mooring type of a berth. 'finger': finger pier (SPEC §4); 'yBoom': one
 * boat between light booms (aisapaikka), with fingers for boats too long for a boom;
 * 'sternBuoy': bow to the pier, stern to a buoy (peräpoiju); 'mixed' (D51): Y-booms for the boats
 * a standard boom fits, fingers for the longer ones, in the same row.
 */
export type BerthType = 'finger' | 'yBoom' | 'sternBuoy' | 'mixed';

/** Extension (D20): how the boat mix is given: target shares or target berth counts. */
export type BerthTarget = 'share' | 'count';

export interface Params {
  /** Main pier (walkway pontoon) width, m. */
  mainPierWidth: number;
  /** Extension (D44): pier pontoon series (a preset id of engine/modules.ts, or 'custom'). */
  pierSeries: string;
  /**
   * Extension (D44): module lengths of the pier pontoons, m. A generated pier is a sum of them,
   * as many of the longest as fit; empty = any length.
   */
  pierModuleLengths: number[];
  /** Finger pier width, m. */
  fingerWidth: number;
  /** Finger length = ratio × boat length (assumption, not a standard). */
  fingerLengthRatio: number;
  /**
   * Extension (D29): standard finger (boom) lengths, m. A finger takes the shortest standard
   * length at least ratio × boat length that still fits in the slot; empty = no rounding.
   */
  fingerLengths: number[];
  /** Extension (D34): berth type the generator uses on every pier. */
  berthType: BerthType;
  /** Extension (D34): standard boom lengths of Y-boom berths, m; longer boats get fingers. */
  boomLengths: number[];
  /** Extension (D34): boom width, m. */
  boomWidth: number;
  /**
   * Extension (D35): design water depth for stern-buoy berths, m. Not stored: set from the
   * anchoring design depth (D16) whenever the engine runs.
   */
  waterDepth?: number;
  /**
   * Extension (D35, I78): stern buoy distance from the pier = boat length + factor × water
   * depth. 1 after Suomen Laiturikauppa; Top Marine gives 3.
   */
  buoyDepthFactor: number;
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
  /**
   * Extension (D38): fairway in front of stern-buoy rows = factor × longest boat length, at least
   * `buoyFairwayMin` (and at least the general rule). Svenska Båtunionen: 2.5 × L, at least 20 m.
   */
  buoyFairwayFactor: number;
  buoyFairwayMin: number;
  /** Minimum distance structures/boats ↔ obstacles, m. */
  obstacleClearance: number;
  /** Maximum length of one main pier, m. */
  maxMainPierLength: number;
  /** Pier direction in degrees clockwise from north, or 'auto' to let the generator search. */
  orientation: 'auto' | number;
  /** Extension (D5): distance from the shore end of a pier to the first finger/berth, m. */
  shoreOffset: number;
  /** Extension (D49): water between the shoreline and a pier's shore end, bridged by a gangway, m. */
  shoreGap: number;
  /** Extension (D49): length of the gangway from the shore to a pier, m. */
  gangwayLength: number;
  /** Extension (D20): the boat mix is given as target shares or as target berth counts. */
  berthTarget: BerthTarget;
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
  /** Extension (D34): 'boom' for a light boom of Y-boom berths; missing = finger. */
  kind?: 'boom';
}

export type PierSide = 'left' | 'right';

export interface Berth {
  id: string;
  pierId: string;
  /** Side of the pier when looking from `start` towards `end`. */
  side: PierSide;
  boatClassId: string;
  /** Extension (D34): mooring type; missing = finger berth. */
  type?: BerthType;
  /** The water rectangle reserved for the boat (incl. clearances). */
  slot: Polygon;
  /** Simplified top-view boat rectangle inside the slot. */
  boat: Polygon;
  /** Extension (D35): position of the stern buoy of a stern-buoy berth. */
  buoy?: Vec2;
  removed: boolean;
  issues: Issue[];
}

export interface Fairway {
  id: string;
  /** Outer ring. */
  shape: Polygon;
  /** Extension: clockwise rings of water inside `shape` that is not fairway (e.g. around a rock). */
  holes: Polygon[];
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
  /** Extension (D21): centreline length of the site's access pontoons, m. */
  accessPontoonLength: number;
  /** mainPierLength + fingerLength + accessPontoonLength, m. */
  pontoonLength: number;
  /** Deck area of main piers, fingers and access pontoons, m². */
  pontoonDeckArea: number;
  /** Extension: area of the fairway polygons, m². */
  fairwayArea: number;
  /** Water occupied by the marina: berth slots + fairways, m². */
  marinaWaterArea: number;
  /** Water (less obstacles) not occupied by pontoons, slots or fairways, m². */
  freeWaterArea: number;
  berthsPer1000m2: number;
  /** Pontoon metres per berth; 0 when there are no berths. */
  pontoonPerBerth: number;
  /** Extension (D3): sum over classes of |actual share − target share| / 2, 0..1. */
  mixDeviation: number;
  /**
   * Extension: berths the generator left out because they could not be reached from the
   * entrance. They are not part of the layout and are not counted anywhere else.
   */
  unreachableRemoved: number;
  /**
   * Extension (D20): with target counts, the number of berths short of the targets
   * (summed over the classes); 0 when the mix is given as shares.
   */
  targetShortfall: number;
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
  /**
   * Extension: number of berths the generator left out of this layout because they could
   * not be reached from the entrance through a fairway of the required width.
   */
  unreachableRemoved: number;
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

/**
 * Extension: an online map shown under the drawing. `lat`/`lon` (degrees, WGS 84) is the
 * position of the local origin (0, 0). It is used only to place map tiles; all geometry
 * and every calculation stay in local metres.
 */
export interface MapBackground {
  provider: 'osm';
  lat: number;
  lon: number;
  opacity: number;
}

/**
 * Extension (D24): product choices and the price list for the bill of materials and the
 * cost estimate. A series is a group of size alternatives in the price list (I48).
 */
export interface CostSettings {
  /** Imported price list, or null for the built-in data/hinnasto.xlsx. */
  priceList: PriceList | null;
  /** Series used for the main piers and access pontoons; '' = chosen automatically. */
  pontoonSeries: string;
  /** Series used for the fingers; '' = chosen automatically. */
  fingerSeries: string;
  /** Extension (D34): series used for the booms of Y-boom berths; '' = chosen automatically. */
  boomSeries: string;
  /** Series used for the gangways from the shore; '' = chosen automatically. */
  gangwaySeries: string;
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
  /** Extension: online map under the drawing, or null. */
  map: MapBackground | null;
  /** Extension (D23): parameters of the preliminary anchoring plan. */
  anchoring: AnchoringParams;
  /** Extension (D24): product choices and price list. */
  cost: CostSettings;
  /** Extension (D40): inputs of the wind-wave screening. */
  waves: WaveSettings;
  /** Extension (D50): characteristic water levels of a gauge near the site, or null. */
  waterLevels: WaterLevelInfo | null;
  /**
   * Fingerprint of the inputs (site, boat classes, parameters) the layouts were generated
   * from, or null when there are no generated layouts. Used for the "Regenerate" hint.
   */
  generatedFrom: string | null;
}
