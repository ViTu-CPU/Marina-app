/**
 * Preliminary anchoring plan (DECISIONS D23, D64): chain lines and anchors for the main piers,
 * access pontoons and breakwaters of a layout, stern buoys and finger end piles.
 *
 * Alustava mitoitus. The sizing follows the owner's specification docs/ANKKUROINTI_MITOITUS_SPEC.md
 * (engine/mooring.ts): loads after AS 3962:2020 for each pontoon in four main directions (across ±,
 * along ±), shared by the legs anchored opposite the load, a catenary at low and high water for every
 * leg, and the concrete anchor by friction of its submerged weight less the uplift (μ by seabed,
 * NAVFAC DM-7.02) or by the optional cohesive model. It does not replace the designer's calculation,
 * a geotechnical survey or the manufacturer's design; ice loads are not designed (MOORING_DISCLAIMER).
 *
 * The layout of the legs is the tool's own (D25, D28, D30, D46, D49, D58):
 *  - main piers and breakwaters: from every module joint, on each side one chain splayed by θ towards
 *    the head and one towards the shore, crossed under the pontoon; at the shore end towards the head,
 *    at the head an outward tip pair (a breakwater has outward pairs at both ends); a pier reached by
 *    a gangway from the shore has two shore chains crossed under the gangway to the wall;
 *  - access pontoons: square chains on the water side at `lineSpacing` and two shore chains at each
 *    gangway (in front of a wall), else square chains on both sides;
 *  - each pontoon is sized on its own (no load shared between pontoons: spec §4).
 *
 * Per leg the cheapest chain of the price list with MBL · ((d − c)/d)² / max(T_fair, T_anchor) ≥ the
 * chain factor of safety at both water levels, length `chainLengthFactor` × the depth at high water.
 * The anchor (D64, owner): concrete blocks of at most `maxAnchorMass` (5 t), one per line (two only as
 * the user's tandem choice), heavy enough for the required dry mass of the spec; when none is, a pile
 * anchor at the end of the chain, its length and section by geotechnical design.
 *
 * Stern buoys (D36, D37) keep their selection table for the sinker; the chain is checked with the
 * catenary of the spec. Fingers longer than `fingerPileMinLength` get an end pile (D31).
 */
import { chooseBlock, groupThousands, installParams, pileProduct, usableBlocks } from './anchorChoice';
import { unitPriceVat0, type AnchorKind, type PriceList, type Product } from './catalog';
import { breakwaterJoints, breakwaterProductOf, breakwatersOf } from './breakwater';
import { add, distance, distancePointToPolyline, dot, pointInRing, scale, segmentIntersectionParam, sub } from './geometry';
import type { BoatClass, Finger, Issue, Layout, Site, Vec2 } from './model';
import { jointPositions } from './modules';
import {
  anchorCapacityCohesive,
  anchorCapacityFriction,
  catenary,
  chainWeight,
  distributeToLegs,
  environmentalLoads,
  requiredAnchorMassFriction,
  ruleChecks,
  SEABED_FRICTION,
  submergedWeight_kN,
  vesselWindArea,
  WIND_CD,
  windPressure,
  type CohesiveParams,
  type LoadCase,
  type MooringBoat,
  type MooringLeg,
  type MooringWarning,
  type SeabedKey,
  type VesselType,
} from './mooring';
import { pierAxis } from './rows';
import { accessPontoonsOf, DEFAULT_GANGWAY_LENGTH, gangwayPositions, pierShoreLink, SHORE_TOLERANCE } from './site';

/** D64: seabed types of NAVFAC DM-7.02 (engine/mooring.ts). */
export type Seabed = SeabedKey;
/** Seabeds with a friction model (soft clay / mud has none). */
export type FrictionSeabed = Exclude<SeabedKey, 'softClayMud'>;

/**
 * How stern-buoy sinkers are sized (D36, D37): 'table' = the sinker of the selection table
 * for the boat's weight; 'factor' = `buoySinkerFactor` × boat weight.
 */
export type BuoySinkerMethod = 'table' | 'factor';

/**
 * Selection table for stern buoys (D37): 'batunionen' = Svenska Båtunionen, Hamnhandboken
 * (2016), Tabell 3; 'topMarine' = Top Marine's table for sailing boats.
 */
export type BuoyTableId = 'batunionen' | 'topMarine';

/**
 * D66: where a chain whose anchor would lie on land (beyond the shoreline or on an island) is
 * fixed instead: 'wall' = to a fixing in the shore wall where the chain meets it; 'blockAtWall' =
 * to a concrete block on the seabed right at the foot of the wall, on a chain shortened to reach it.
 */
export type LandAnchorFix = 'wall' | 'blockAtWall';

/** D64: the cohesive model of the spec (§5.3) with the dry mass of the block it describes. */
export type CohesiveBlock = CohesiveParams & { massDryKg: number };

export interface AnchoringParams {
  /** Design water depth at the anchors, m (D16). */
  depth: number;
  /** Highest water level above the design level, m. */
  highWater: number;
  /** Lowest water level below the design level, m. */
  lowWater: number;
  /** D50: normal high and low water (MHW − MW, MW − MNW), m, when known from a gauge; null = not known. */
  normalHighWater: number | null;
  normalLowWater: number | null;
  /** D52: level of the quay (gangway pivot) above the design water level, m; null = not known. */
  quayLevel: number | null;
  seabed: Seabed;
  /** D64: friction coefficient of mass concrete on each seabed (NAVFAC DM-7.02, default the lower end). */
  friction: Record<FrictionSeabed, number>;
  /** D64: slope of the seabed down in the direction of the pull, degrees (spec 2.4). */
  slopeDeg: number;
  /** D64: optional cohesive model (clay, mud): Fh = Su_z·A + (2·Su_a·z + ½·γb·z²)·B; null = not used. */
  cohesive: CohesiveBlock | null;
  /** D64: factor on the anchor capacity: 1 (default); above 1 only with a documented basis. */
  capacityFactor: number;
  /** D64: the documented basis of a capacity factor above 1 (pull test, measured embedment). */
  capacityFactorSource: string;
  /** D64: 30 s steady ULS design wind, m/s (AS 3962 4.8.3.2–3); entered by the user (spec §9). */
  windSpeed: number;
  /** Wind on the boats of the leeward row, as a fraction (AS 3962 4.8.3.3: 0.2). */
  leewardFactor: number;
  /** D64: wave line load from the user's wave analysis, kN/m; max(this, waveMin) is used. */
  waveLineLoad: number;
  /** D64: minimum wave line load, kN/m (AS 3962 4.8.2.3: 2 kN/m; less gives a warning). */
  waveMin: number;
  /** D64: current speed, m/s (AS 3962: at least 1.0 m/s in a river or estuary). */
  currentSpeed: number;
  /** D64: extra static load per pontoon, kN (e.g. the equivalent static load of berthing). */
  extraStatic: number;
  /** D64: ice line load, kN/m: reported only, not designed. */
  iceLineLoad: number;
  /** D64: the pontoons stay in the water over winter (D17): a warning. */
  winterInWater: boolean;
  /** D64: factor on the load of each leg for uneven sharing (no source; default 1). */
  unevenFactor: number;
  /** Pontoon freeboard used for its wind area when the product gives none, m (spec 2.1: 0.5). */
  pontoonFreeboard: number;
  /** D64: pontoon draught for the current, m (spec 2.1: 0.5). */
  pontoonDraft: number;
  /** Spacing of the lines of an access pontoon (and of a pier without module joints), m. */
  lineSpacing: number;
  /** Plan angle of the chains of a main pier from square to the pier, degrees (0–80, D25). */
  splayAngle: number;
  /** D64: chain factor of safety on MBL / max(T_fair, T_anchor) (spec: 3.0, a choice). */
  chainSafetyFactor: number;
  /** Loss of chain diameter over the design life (corrosion and wear), mm. */
  corrosionAllowance: number;
  /** D64: anchor factor of safety (spec: 1.5, a choice; API RP 2SK offshore 1.8 is shown too). */
  slidingSafetyFactor: number;
  /** Chain length as a multiple of the water depth at high water (at least depth + 1 m). */
  chainLengthFactor: number;
  /** Heaviest single concrete anchor, kg (D64: 5 000 kg); heavier needs take a pile anchor. */
  maxAnchorMass: number;
  /** D62: at most this many anchors on one line: 1 (default) or 2 (tandem, with a warning). */
  maxAnchorsPerLine: number;
  /** Main piers at least this long get two crossed tip chains (D30), m. */
  tipAnchorMinLength: number;
  /** D66: anchors never lie on land; how a chain that would reach land is fixed instead. */
  landAnchors: LandAnchorFix;
  /** Fingers longer than this get an end pile at the tip (D31), m. */
  fingerPileMinLength: number;
  /** Stern buoys (D36): how the sinker is sized. */
  buoySinkerMethod: BuoySinkerMethod;
  /** Stern buoys (D37): the selection table for sinker, chain size and float. */
  buoyTable: BuoyTableId;
  /** Stern buoys: exposed harbour, every table dimension one row up (Båtunionen, D37). */
  buoyExposed: boolean;
  /** Stern buoys: sinker mass as a multiple of the boat weight (method 'factor'). */
  buoySinkerFactor: number;
  /** Stern buoys: chain length as a multiple of the design depth (D37). */
  buoyChainFactor: number;
  /** Stern buoys: the chain lets the buoy's centre rise this far above high water, m (D37). */
  buoyLift: number;
  /** Water density, kg/m³ (spec: 1025, conservative; fresh water 1000). */
  waterDensity: number;
  concreteDensity: number;
  steelDensity: number;
}

/** NAVFAC DM-7.02 lower ends (spec 5.2). */
export const DEFAULT_FRICTION: Record<FrictionSeabed, number> = {
  rock: SEABED_FRICTION.rock.mu!,
  gravelCoarseSand: SEABED_FRICTION.gravelCoarseSand.mu!,
  fineMediumSand: SEABED_FRICTION.fineMediumSand.mu!,
  fineSiltySand: SEABED_FRICTION.fineSiltySand.mu!,
  silt: SEABED_FRICTION.silt.mu!,
  stiffClay: SEABED_FRICTION.stiffClay.mu!,
  mediumClay: SEABED_FRICTION.mediumClay.mu!,
};

/**
 * Defaults (D64, docs/ANKKUROINTI_MITOITUS_SPEC.md §2; earlier sources in docs/RESEARCH.md §5):
 *  - windSpeed 22 m/s: the 10-min reference wind of Finnish sea areas (YM 2007, search excerpt) kept
 *    as the starting value; the spec wants the 30 s ULS wind and leaves its conversion open (TODO,
 *    warned in the plan): enter the site's 30 s wind.
 *  - waveMin 2 kN/m (AS 3962 4.8.2.3), waveLineLoad 0, currentSpeed 0, extraStatic 0, iceLineLoad 0,
 *    unevenFactor 1, pontoonFreeboard 0.5, pontoonDraft 0.5, waterDensity 1025, chainSafetyFactor 3.0,
 *    slidingSafetyFactor 1.5 (anchor), capacityFactor 1: the spec's defaults.
 *  - winterInWater true: the owner's D17 (pontoons stay in the water over winter).
 *  - chainLengthFactor 5: the spec's rule "chain ≥ 5 × water depth" (FCG 2022; Top Marine).
 *  - maxAnchorMass 5 000 kg: the owner's limit (D64); maxAnchorsPerLine 1 (D62).
 *  - seabed mediumClay (μ 0.30), as the earlier clay default of 0.3.
 *  - splayAngle 45° (D25), tipAnchorMinLength 10 m (D30), fingerPileMinLength 12 m (D31),
 *    lineSpacing 12 m (assumption), stern buoys after Båtunionen (D37).
 */
export const DEFAULT_ANCHORING: AnchoringParams = {
  depth: 4,
  highWater: 1.5,
  lowWater: 0.9,
  normalHighWater: null,
  normalLowWater: null,
  quayLevel: null,
  seabed: 'mediumClay',
  friction: { ...DEFAULT_FRICTION },
  slopeDeg: 0,
  cohesive: null,
  capacityFactor: 1,
  capacityFactorSource: '',
  windSpeed: 22,
  leewardFactor: 0.2,
  waveLineLoad: 0,
  waveMin: 2,
  currentSpeed: 0,
  extraStatic: 0,
  iceLineLoad: 0,
  winterInWater: true,
  unevenFactor: 1,
  pontoonFreeboard: 0.5,
  pontoonDraft: 0.5,
  lineSpacing: 12,
  splayAngle: 45,
  chainSafetyFactor: 3,
  corrosionAllowance: 0,
  slidingSafetyFactor: 1.5,
  chainLengthFactor: 5,
  maxAnchorMass: 5000,
  maxAnchorsPerLine: 1,
  tipAnchorMinLength: 10,
  landAnchors: 'wall',
  fingerPileMinLength: 12,
  buoySinkerMethod: 'table',
  buoyTable: 'batunionen',
  buoyExposed: false,
  buoySinkerFactor: 3,
  buoyChainFactor: 1.41,
  buoyLift: 0.8,
  waterDensity: 1025,
  concreteDensity: 2400,
  steelDensity: 7850,
};

/**
 * The method's defaults with the site values of `p` kept (depth, water levels, seabed, slope,
 * cohesive soil, design wind, wave line load, current, ice, winter use) and the stern-buoy choices:
 * "Reset factors to defaults" (U19).
 */
export const resetAnchoringFactors = (p: AnchoringParams): AnchoringParams => ({
  ...structuredClone(DEFAULT_ANCHORING),
  depth: p.depth,
  highWater: p.highWater,
  lowWater: p.lowWater,
  normalHighWater: p.normalHighWater,
  normalLowWater: p.normalLowWater,
  quayLevel: p.quayLevel,
  seabed: p.seabed,
  slopeDeg: p.slopeDeg,
  cohesive: p.cohesive ? { ...p.cohesive } : null,
  windSpeed: p.windSpeed,
  waveLineLoad: p.waveLineLoad,
  currentSpeed: p.currentSpeed,
  iceLineLoad: p.iceLineLoad,
  winterInWater: p.winterInWater,
  buoySinkerMethod: p.buoySinkerMethod,
  buoyTable: p.buoyTable,
  buoyExposed: p.buoyExposed,
  landAnchors: p.landAnchors,
});

/** Largest splay angle accepted, degrees. */
export const MAX_SPLAY_ANGLE = 80;

/** D64: the text the spec requires in the result view (in English; the Finnish in the UI translation). */
export const MOORING_DISCLAIMER =
  "Preliminary sizing. Does not replace the designer's calculation, a geotechnical survey or the manufacturer's (e.g. Seaflex/JFlex) design. Ice loads are not designed.";

/** D64: the notes of the spec (§5.5 required texts, §3.7, §6, §7, §9 and Appendix B), shown with the results. */
export const MOORING_NOTES: readonly { code: string; text: string }[] = [
  {
    code: 'FRICTION_LOWER_BOUND',
    text: '"The friction model is a lower-bound estimate: embedment and suction add capacity, but embedment is not usually measured." Chalmers 2026: SF Marina estimates the embedment at about 1/3 of the anchor height; in its example the factor of safety of a 3 t anchor rose from 1.00 to 2.00 when the embedment grew from 0.17 m to 0.40 m.',
  },
  { code: 'CAPACITY_MAY_BE_HIGHER', text: '"The calculated holding may be larger than the real one." In US Navy pull tests the real holding of concrete anchors was 20–30 % of the prediction (OTC 6033).' },
  { code: 'SEVERAL_SMALL_ANCHORS', text: 'Chalmers: several small anchors on one chain do not necessarily equal one large anchor of the same total mass.' },
  { code: 'TEN_TONNE_NOTE', text: 'With 10 t anchors the anchor factor of safety stays below 1 by friction alone with the AS 3962 minimum wave load (2 kN/m). Real projects (e.g. Parainen) use 10 t anchors relying on embedment and local experience. The tool does not hide this difference: a capacity factor above 1 needs a documented basis.' },
  { code: 'WIND_30S_TODO', text: 'V is the 30 s steady ULS design wind of AS 3962 4.8.3.2–3. Converting the Eurocode (SFS-EN 1991-1-4 and its national annex) or FMI wind to a 30 s mean is not implemented (TODO): enter V yourself.' },
  { code: 'ROW_SHIELDING', text: 'Along the pontoon the boats in a row are shielded 100 / 50 / 30 % (Tobiasson & Kollmeyer); AS 3962 gives no rule for this case.' },
  {
    code: 'NOT_IMPLEMENTED',
    text: 'Not implemented (TODO): berthing impact energy (AS 3962 4.9, at least 0.3 m/s; give an equivalent static load instead), oblique winds (about 15–25° off beam may give the largest force, Tobiasson & Kollmeyer, so the main directions can underestimate the load), dynamics, fatigue and corrosion (quasi-static model), moment balance and stiffness sharing between the legs.',
  },
  { code: 'CHAIN_VS_ELASTIC', text: 'A chain mooring holds by the weight of its hanging chain, so shallow water and a large water-level range weaken it; an elastic mooring keeps an even pull (Marine Construction Magazine). Seaflex and other elastic moorings are not sized here: the manufacturer sizes them (JFlex); export the data package for the manufacturer.' },
  { code: 'FCG_INSTALLATION', text: 'Installation (FCG 2022): weights and chains below the dredging level, weights dug into the seabed where needed, chains tensioned so that the weights do not move.' },
  {
    code: 'REFERENCE_PROJECTS',
    text: 'For comparison, not rules: Parainen, A-Laiturit 2021: 10 000 kg concrete anchors, DIN 763 22 mm / 30 m Grade 40, shore chains about 13 m, rubber dampers. Chalmers / SF Marina ferry pier: 200 kN berthing load, 30 mm R3 chain, 3 t anchor, largest tension 108.7 kN, chain factor of safety about 7.7.',
  },
  { code: 'RIL_NOT_USED', text: 'RIL 201-3-2013 (Vesirakenteet) was not available and is not used; ice and wave loads are to be checked against it when it is.' },
];

/** The case a line is sized by (spec §8): smallest anchor factor of safety (wall lines: largest tension). */
export interface GoverningCase {
  case: LoadCase['id'] | 'stern';
  waterLevel: 'LW' | 'HW';
  /** Horizontal tension, kN. */
  Th: number;
  Tfair: number;
  Tanchor: number;
  /** Uplift at the anchor, kN. */
  Fv: number;
  upliftDeg: number;
  chainFoS: number;
  /** Capacity of the line's anchor (for a pile line: of the heaviest blocks allowed), kN; null for wall lines. */
  anchorCapacity: number | null;
  anchorFoS: number | null;
}

/** One load case of a leg at one water level (kN). */
export interface LegLoadCase {
  case: LoadCase['id'] | 'stern';
  waterLevel: 'LW' | 'HW';
  Th: number;
  Tfair: number;
  Tanchor: number;
  Fv: number;
}

export interface AnchorLine {
  id: string;
  /** Pier, access pontoon or breakwater the line holds (a berth for a stern buoy). */
  holdsId: string;
  /** Which end of the pontoon the anchor lies towards ('none' for square and buoy lines). */
  splay: 'head' | 'shore' | 'none';
  /** Whether the governing case is across or along the pontoon. */
  governs: 'across' | 'along';
  /** 'seabed': chain to an anchor. 'wall': shore chain to a fixing in the quay wall (D28). */
  fixing: 'seabed' | 'wall';
  role: 'side' | 'tip' | 'shore' | 'buoy';
  /**
   * D66: the anchor would have lain on land, so the line was fixed to the shore wall ('wall') or to
   * a concrete block at the foot of the wall ('blockAtWall') instead.
   */
  landed?: LandAnchorFix;
  /** Where the chain is fixed to the pontoon. */
  fix: Vec2;
  /** Position of the anchor on the seabed, or of the wall fixing (plan view). */
  anchor: Vec2;
  /** D64: direction of the leg towards its anchor in the pontoon's frame, degrees (0 = towards its end, 90 = its left side). */
  dirDeg: number;
  /** Largest horizontal tension of the leg, kN. */
  horizontalKn: number;
  /** Largest chain tension, kN. */
  topTensionKn: number;
  /** Chain length to order (before margin), m. */
  chainLength: number;
  chainId: string | null;
  /** D64: smallest chain factor of safety over the cases; null without a chain. */
  chainFoS: number | null;
  /** D64: the chain's kg/m was estimated as 0.0219·d² (no manufacturer value). */
  chainWeightEstimated: boolean;
  /** Uplift at the anchor in the governing case, kN. */
  upliftKn: number;
  upliftAngleDeg: number;
  /** Required dry mass of a concrete anchor (spec 5.4), kg; NaN where the friction model does not apply. */
  requiredAnchorKg: number;
  anchorId: string | null;
  /** Kind of the anchor: 'block' or 'pile' (D64); null for wall lines. */
  anchorKind: AnchorKind | null;
  /** Number of anchors: at most `maxAnchorsPerLine` blocks, or one pile; 0 for wall lines. */
  anchorCount: number;
  /** 'OK': concrete anchors hold the line; 'PILE': no block of at most `maxAnchorMass` does, a pile anchor (D64). */
  status: 'OK' | 'PILE';
  /** Why the line takes a pile anchor, e.g. "block: needs 32 604 kg, max product 5 000 kg"; null otherwise. */
  pileReason: string | null;
  governing: GoverningCase | null;
  /** Every case with a load on the leg, at both water levels. */
  loadCases: LegLoadCase[];
  /** Stern buoys only (D36). */
  buoy?: BuoyDetails;
}

export interface BuoyDetails {
  /** Boat weight used, t. */
  boatWeightT: number;
  /** Whether the weight was estimated from the boat length (I79). */
  weightEstimated: boolean;
  /** Buoyancy the float needs at least, kg. */
  floatCapacityKg: number;
  /** Chain size of the selection table, mm. */
  tableChainMm: number;
  /** Sinker mass the friction sizing of the spec would need for the stern-on wind, kg; NaN on soft clay / mud. */
  windAnchorKg: number;
}

/**
 * Top Marine's selection table for stern buoys ("Millainen venepoiju valita veneelle?",
 * https://topmarinelaiturit.fi/laituritarvikkeet/poijut/, read 2026-11-15): sailing boat
 * length (m), beam (m), weight (t) → buoy (l), anchor (kg in air), chain / shackle (mm). The
 * float buoyancy is Top Marine's "Kantavuus" of that buoy (40 l: 31 kg, 60 l: 48 kg, 120 l:
 * 104 kg). Its lengths and weights also estimate missing boat weights (I79).
 */
export const BUOY_TABLE = [
  { lengthM: 4.6, beamM: 2.0, weightT: 1.0, buoyL: 40, floatCapacityKg: 31, anchorKg: 500, chainMm: 10, shackleMm: 13 },
  { lengthM: 6.1, beamM: 2.4, weightT: 2.0, buoyL: 40, floatCapacityKg: 31, anchorKg: 500, chainMm: 13, shackleMm: 16 },
  { lengthM: 7.6, beamM: 2.8, weightT: 3.3, buoyL: 60, floatCapacityKg: 48, anchorKg: 500, chainMm: 13, shackleMm: 16 },
  { lengthM: 9.1, beamM: 3.2, weightT: 4.8, buoyL: 60, floatCapacityKg: 48, anchorKg: 1000, chainMm: 16, shackleMm: 20 },
  { lengthM: 10.7, beamM: 3.6, weightT: 6.5, buoyL: 120, floatCapacityKg: 104, anchorKg: 1000, chainMm: 16, shackleMm: 20 },
  { lengthM: 12.2, beamM: 4.0, weightT: 8.5, buoyL: 120, floatCapacityKg: 104, anchorKg: 1000, chainMm: 16, shackleMm: 20 },
  { lengthM: 13.7, beamM: 4.4, weightT: 10.8, buoyL: 120, floatCapacityKg: 104, anchorKg: 2000, chainMm: 20, shackleMm: 22 },
] as const;

/**
 * Svenska Båtunionen, Hamnhandboken version 1 (2016), §2.33 "Dimensionering av boj,
 * bojkätting och bojtyngd", Tabell 3 (https://batunionen.se/wp-content/uploads/2020/01/
 * hamnhandboken-version-1-2016.compressed.pdf, read 2026-11-15): "Båtens deplacement, ton"
 * 2,0 / 5,0 / 8,0 / 10,0 → "Boj, bärförmåga" 45 / 70 / 100 / 120 kp, "Bojkätting,
 * godsdiameter mm" 10 / 13 / 16 / 16, "Bojtyngdens vikt i vatten, kg" 300 / 700 / 1000 / 1200.
 */
export const BATUNIONEN_BUOY_TABLE = [
  { weightT: 2.0, floatCapacityKg: 45, sinkerInWaterKg: 300, chainMm: 10 },
  { weightT: 5.0, floatCapacityKg: 70, sinkerInWaterKg: 700, chainMm: 13 },
  { weightT: 8.0, floatCapacityKg: 100, sinkerInWaterKg: 1000, chainMm: 16 },
  { weightT: 10.0, floatCapacityKg: 120, sinkerInWaterKg: 1200, chainMm: 16 },
] as const;

/** One row of a selection table, with the sinker as concrete mass in air, kg. */
export interface BuoySize {
  weightT: number;
  floatCapacityKg: number;
  sinkerKg: number;
  chainMm: number;
}

/** The rows of a selection table; Båtunionen's weights in water become concrete in air. */
export function buoyTable(id: BuoyTableId, p: Pick<AnchoringParams, 'waterDensity' | 'concreteDensity'>): BuoySize[] {
  if (id === 'topMarine') return BUOY_TABLE.map((r) => ({ weightT: r.weightT, floatCapacityKg: r.floatCapacityKg, sinkerKg: r.anchorKg, chainMm: r.chainMm }));
  return BATUNIONEN_BUOY_TABLE.map((r) => ({
    weightT: r.weightT,
    floatCapacityKg: r.floatCapacityKg,
    sinkerKg: r.sinkerInWaterKg / (1 - p.waterDensity / p.concreteDensity),
    chainMm: r.chainMm,
  }));
}

/**
 * Boat weight estimated from its length, t (I79): linear between the rows of Top Marine's
 * table for sailing boats, in proportion below the first row, and continuing the last
 * segment above the last. An ESTIMATE: real boats vary a lot.
 */
export function estimateBoatWeight(length: number): number {
  const rows = BUOY_TABLE;
  const first = rows[0];
  if (length <= first.lengthM) return (first.weightT * Math.max(0, length)) / first.lengthM;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    if (length <= b.lengthM) return a.weightT + ((b.weightT - a.weightT) * (length - a.lengthM)) / (b.lengthM - a.lengthM);
  }
  const a = rows[rows.length - 2]!;
  const b = rows[rows.length - 1]!;
  return b.weightT + ((b.weightT - a.weightT) * (length - b.lengthM)) / (b.lengthM - a.lengthM);
}

/**
 * The row for a boat of `weightT` t: the first row at least that heavy, one row further in an
 * exposed harbour; the last row when that runs past the table (`beyond`).
 */
export function buoyTableRow(rows: readonly BuoySize[], weightT: number, exposed = false): { row: BuoySize; beyond: boolean } {
  const first = rows.findIndex((r) => r.weightT >= weightT - 1e-9);
  const i = (first < 0 ? rows.length : first) + (exposed ? 1 : 0);
  return i < rows.length ? { row: rows[i]!, beyond: false } : { row: rows[rows.length - 1]!, beyond: true };
}

/**
 * Chain length of a stern buoy, m (D37): factor × design depth `h` (1.41 = slope 1:1), at least
 * the depth at high water `hHigh` + the lift of the buoy.
 */
export const buoyChainLength = (h: number, hHigh: number, p: AnchoringParams): number => Math.max(p.buoyChainFactor * h, hHigh + p.buoyLift);

/**
 * Marinetek's standard pile guides: design pile load and pile diameter (Pile Guides brochure,
 * docs/RESEARCH.md §9.12).
 */
export const PILE_GUIDES = [
  { id: 'G200', loadKn: 20, pile: '305–356 mm' },
  { id: 'G400', loadKn: 40, pile: '406–508 mm' },
  { id: 'G700', loadKn: 70, pile: '762–920 mm' },
] as const;
export type PileGuideId = (typeof PILE_GUIDES)[number]['id'];

/** The smallest standard guide whose design pile load is at least `loadKn`; null above all. */
export const choosePileGuide = (loadKn: number): PileGuideId | null => PILE_GUIDES.find((g) => g.loadKn >= loadKn - 1e-9)?.id ?? null;

/** An end pile at the tip of a long finger (D31). */
export interface FingerPile {
  id: string;
  /** The finger it holds. */
  holdsId: string;
  /** Pile position: the middle of the finger's tip (plan view). */
  at: Vec2;
  /** Horizontal design load from wind, kN. */
  loadKn: number;
  guide: PileGuideId | null;
}


/** D64: loads on one pontoon, per main direction (spec §3, kN). */
export interface PontoonLoads {
  id: string;
  kind: 'pier' | 'access' | 'breakwater';
  /** Wind pressure, kPa. */
  q: number;
  cases: LoadCase[];
  /** Ice load reported only (kN), when an ice line load is given. */
  ice: { F_perp: number; F_par: number } | null;
  /**
   * D28, I122: an access pontoon's load passed to the piers attached to it (by tributary length);
   * its own legs hold the rest. Each entry: its case, the pier and the pier's case that carries it.
   */
  transfers: { case: LoadCase['id']; to: string; toCase: LoadCase['id']; kN: number }[];
}

/** I122: what each pontoon carries for an access pontoon in each of its cases, kN. */
export function carriedForAccess(loads: readonly PontoonLoads[]): Map<string, Map<LoadCase['id'], number>> {
  const out = new Map<string, Map<LoadCase['id'], number>>();
  for (const l of loads) {
    for (const t of l.transfers) {
      const m = out.get(t.to) ?? new Map<LoadCase['id'], number>();
      m.set(t.toCase, (m.get(t.toCase) ?? 0) + t.kN);
      out.set(t.to, m);
    }
  }
  return out;
}

/**
 * I122: tributary length of each restraint at `positions` (m along a member of length `length`):
 * from half-way to its neighbours, the ends to the member's ends; restraints at the same position
 * share theirs equally.
 */
export function tributaryLengths(positions: readonly number[], length: number): number[] {
  const unique = [...new Set(positions.map((t) => Math.min(length, Math.max(0, t))))].sort((a, b) => a - b);
  const share = new Map<number, number>();
  unique.forEach((t, i) => {
    const lo = i === 0 ? 0 : (unique[i - 1]! + t) / 2;
    const hi = i === unique.length - 1 ? length : (t + unique[i + 1]!) / 2;
    share.set(t, hi - lo);
  });
  const clamped = positions.map((t) => Math.min(length, Math.max(0, t)));
  return clamped.map((t) => share.get(t)! / clamped.filter((x) => x === t).length);
}

export interface AnchoringResult {
  lines: AnchorLine[];
  /** End piles of fingers longer than `fingerPileMinLength` (D31); not priced. */
  piles: FingerPile[];
  /** D64: the load table of every pontoon. */
  loads: PontoonLoads[];
  issues: Issue[];
}

export interface AnchoringInput {
  layout: Pick<Layout, 'piers' | 'berths'> & { fingers?: Finger[] };
  site: Site;
  classes: BoatClass[];
  params: AnchoringParams;
  priceList: PriceList;
  vatPct: number;
  /** Freeboard of the main pier product, m, when known. */
  pierFreeboard?: number | null;
  /** Stern buoys: distance factor of the layout (`Params.buoyDepthFactor`), for the 1.4 L check. */
  buoyDepthFactor?: number;
  /** D46: module lengths of the piers; empty or missing = joints every `lineSpacing`. */
  moduleLengths?: readonly number[];
  /** D49: longest gap a pier's shore gangway spans (`Params.gangwayLength`), m. */
  gangwayReach?: number;
  /** D45: the sectors of the wave screening whose waves exceed its criteria (names, e.g. 'E'). */
  waves?: { exceeding: readonly string[] };
}

/** D64: seabed anchor lines (stern buoys included) by anchor: concrete anchors that hold, pile anchors. */
export function anchoringStatus(lines: readonly AnchorLine[]): { ok: number; piles: number } {
  const seabed = lines.filter((l) => l.fixing === 'seabed');
  const piles = seabed.filter((l) => l.status === 'PILE').length;
  return { ok: seabed.length - piles, piles };
}

/** D64: "12 lines with concrete anchors, 140 lines with pile anchors". */
export const anchoringStatusText = (s: { ok: number; piles: number }): string => `${s.ok} lines with concrete anchors, ${s.piles} lines with pile anchors`;

/** D62: friction coefficients of the sensitivity table. */
export const SENSITIVITY_FRICTION = [0.2, 0.3, 0.5] as const;

/** D62: the note under the sensitivity table (spec item 6 of D62). */
export const SOFT_CLAY_NOTE = 'Gravity block capacity in soft clay is highly uncertain; requires geotechnical data.';

export interface FrictionSensitivityRow {
  friction: number;
  /** Whether this is the coefficient in use. */
  current: boolean;
  /** Largest block mass one line needs, kg. */
  maxKg: number;
  /** Block mass of all the lines, kg. */
  totalKg: number;
  /** Lines that `maxAnchorsPerLine` blocks of the price list (no heavier than `maxAnchorMass`) hold. */
  feasible: number;
}

export interface FrictionSensitivity {
  seabed: Seabed;
  /** Seabed lines of piers, access pontoons and breakwaters (stern buoys are sized by their table). */
  lines: number;
  heaviestBlockKg: number;
  maxPerLine: number;
  rows: FrictionSensitivityRow[];
}

/**
 * D62, D64: the dry mass concrete blocks would need on the seabed lines for friction 0.2 / 0.3 / 0.5
 * (and the value in use), with the spec's formula (5.4) over every load case of each line.
 */
export function frictionSensitivity(lines: readonly AnchorLine[], p: AnchoringParams, priceList: PriceList): FrictionSensitivity {
  const own = lines.filter((l) => l.fixing === 'seabed' && l.role !== 'buoy');
  const maxPerLine = Math.min(2, Math.max(1, Math.round(p.maxAnchorsPerLine)));
  const heaviestBlockKg = usableBlocks(priceList, p.maxAnchorMass, p.seabed)
    .filter((x) => unitPriceVat0(x, 0) !== null || x.installedPrice !== null)
    .reduce((m, x) => Math.max(m, x.anchorMassKg!), 0);
  const inUse = p.seabed === 'softClayMud' ? null : p.friction[p.seabed];
  const values = [...new Set([...SENSITIVITY_FRICTION, ...(inUse === null ? [] : [inUse])])].sort((a, b) => a - b);
  const cf = p.capacityFactor > 0 ? p.capacityFactor : 1;
  const rows = values.map((mu) => {
    const masses = own.map((l) => l.loadCases.reduce((m, c) => Math.max(m, requiredAnchorMassFriction(c.Th, c.Fv, mu, p.slidingSafetyFactor / cf, p.concreteDensity, p.waterDensity, p.slopeDeg)), 0));
    return {
      friction: mu,
      current: inUse !== null && Math.abs(mu - inUse) < 1e-9,
      maxKg: masses.reduce((m, x) => Math.max(m, x), 0),
      totalKg: masses.reduce((t, x) => t + x, 0),
      feasible: masses.filter((x) => heaviestBlockKg > 0 && x <= maxPerLine * heaviestBlockKg + 1e-9).length,
    };
  });
  return { seabed: p.seabed, lines: own.length, heaviestBlockKg, maxPerLine, rows };
}

/** Chain length for water `h` deep at high water (m): factor × h, at least h + 1 m. */
export const chainLengthFor = (h: number, p: AnchoringParams): number => Math.max(h + 1, p.chainLengthFactor * h);

/** Stations at the ends of a pontoon lie this far in from them, m. */
const STATION_INSET = 0.5;

/**
 * Joints of a pier of any length (no modules, I96): every `spacing` m from the shore end, short of
 * the head by more than 1 m.
 */
export function evenJoints(length: number, spacing: number): number[] {
  const out: number[] = [];
  if (!(spacing > 0)) return out;
  for (let t = spacing; t < length - 1; t += spacing) out.push(t);
  return out;
}

/** A straight floating pontoon to be held: a main pier, an access pontoon or a breakwater. */
interface Held {
  id: string;
  kind: PontoonLoads['kind'];
  start: Vec2;
  end: Vec2;
  width: number;
  freeboard: number;
  draft: number;
  /** Boats on its left (+y, spec side A) and right (side B), in order from its start. */
  sideA: MooringBoat[];
  sideB: MooringBoat[];
  /** Main piers and breakwaters are splayed; access pontoons keep square lines. */
  splayed: boolean;
  /** Access pontoon in front of the shore: the side facing it (chains on the water side only, D28). */
  wallSide?: 'left' | 'right';
  /** D28, I122: access pontoon: its gangways and the piers starting from its water-side edge (m along it). */
  restraints?: { gangways: number[]; piers: { id: string; t: number }[] };
  /** D58: a breakwater: outward chains at both ends and joints from its own modules. */
  free?: { joints: readonly number[] };
}

/** A leg before sizing: geometry only. */
interface LegSpec {
  id: string;
  holdsId: string;
  role: AnchorLine['role'];
  splay: AnchorLine['splay'];
  fixing: AnchorLine['fixing'];
  fix: Vec2;
  /** Unit vector from the fixing towards the anchor. */
  direction: Vec2;
  /** Seabed legs: shortest plan distance to the anchor (beyond the pontoon), m. */
  minSpan: number;
  /** Wall legs: plan distance to the wall fixing, m. */
  plan?: number;
  /** D66: the leg was moved off land (see `AnchorLine.landed`). */
  landed?: LandAnchorFix;
  /** D66 'blockAtWall': the block's plan distance from the fixing and the shortened chain, m. */
  atWall?: { span: number; chainLength: number };
}

/** D66: centre of a block at the foot of the wall from the wall line, m (Assumption: half of a 1.2 m block + 0.4 m). */
export const WALL_BLOCK_OFFSET = 1;
/** D66: a block closer to the fixing than this is not used; the chain goes to the wall instead, m (Assumption). */
const MIN_WALL_BLOCK_SPAN = 1;

/**
 * D66: plan distance from `from` along the unit vector `dir`, within `span`, to the first point
 * where the chain would reach land: the shoreline or the edge of an island. Null when it stays
 * in water over the whole span.
 */
export function landDistance(site: Pick<Site, 'shoreline' | 'obstacles'>, from: Vec2, dir: Vec2, span: number): number | null {
  if (!(span > 0)) return null;
  const to = add(from, scale(dir, span));
  let best: number | null = null;
  const test = (c: Vec2, d: Vec2) => {
    const t = segmentIntersectionParam(from, to, c, d);
    if (t === null) return;
    const s = t * span;
    if (s > 1e-6 && (best === null || s < best)) best = s;
  };
  for (let i = 0; i + 1 < site.shoreline.length; i++) test(site.shoreline[i]!, site.shoreline[i + 1]!);
  for (const o of site.obstacles) {
    if (o.kind !== 'island') continue;
    for (let i = 0; i < o.shape.length; i++) test(o.shape[i]!, o.shape[(i + 1) % o.shape.length]!);
  }
  return best;
}

/** Anchoring plan of a layout. Deterministic; positions in plan view. */
export function anchoringPlan(input: AnchoringInput): AnchoringResult {
  const { layout, site, classes, params: p, priceList, vatPct } = input;
  const moduleLengths = input.moduleLengths ?? [];
  const reach = input.gangwayReach ?? DEFAULT_GANGWAY_LENGTH;
  const freeboard = input.pierFreeboard ?? p.pontoonFreeboard;
  const issues: Issue[] = [];
  const warn = (code: string, message: string, elementId?: string, severity: Issue['severity'] = 'warning') =>
    issues.push({ severity, code, message, ...(elementId ? { elementId } : {}) });
  const seen = new Set<string>();
  /** Warnings of the mooring module, each text once. */
  const warnOnce = (w: MooringWarning, elementId?: string) => {
    const key = `${w.code}|${w.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    warn(w.code, w.message, elementId);
  };

  const hHigh = p.depth + p.highWater;
  const hLow = Math.max(0.1, p.depth - p.lowWater);
  const theta = (Math.min(MAX_SPLAY_ANGLE, Math.max(0, p.splayAngle)) * Math.PI) / 180;
  const maxPerLine = Math.min(2, Math.max(1, Math.round(p.maxAnchorsPerLine)));
  const mu = p.seabed === 'softClayMud' ? null : p.friction[p.seabed];
  const cf = p.capacityFactor > 0 ? p.capacityFactor : 1;
  const cohesiveCap = p.cohesive ? anchorCapacityCohesive(p.cohesive) * cf : null;
  const install = installParams(priceList);
  const pile = pileProduct(priceList, vatPct);
  const env = {
    windSpeed: p.windSpeed,
    waveLineLoad: p.waveLineLoad,
    currentSpeed: p.currentSpeed,
    waterDensity: p.waterDensity,
    iceLineLoad: p.iceLineLoad,
    extraStatic_kN: p.extraStatic,
    winterInWater: p.winterInWater,
  };
  const loadOpts = { leewardFactor: p.leewardFactor, waveMin: p.waveMin };
  const q = windPressure(p.windSpeed);
  const lines: AnchorLine[] = [];
  const loads: PontoonLoads[] = [];
  let chainEstimated = false;

  // --- Pontoons -------------------------------------------------------------------------
  const classById = new Map(classes.map((c) => [c.id, c]));
  const vesselType = (c: BoatClass): VesselType => c.vesselType ?? 'motor';
  const sides = (pierId: string, start: Vec2, along: Vec2) => {
    const boats = (side: 'left' | 'right') =>
      layout.berths
        .filter((b) => b.pierId === pierId && b.side === side && !b.removed && classById.has(b.boatClassId))
        .map((b) => ({ c: classById.get(b.boatClassId)!, s: dot(sub(b.slot[0]!, start), along), id: b.id }))
        .sort((x, y) => x.s - y.s || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
        .map((x) => ({ loa: x.c.length, type: vesselType(x.c) }));
    return { sideA: boats('left'), sideB: boats('right') };
  };
  const held: Held[] = layout.piers.map((pier) => {
    const { along } = pierAxis(pier);
    return { id: pier.id, kind: 'pier' as const, start: pier.start, end: pier.end, width: pier.width, freeboard, draft: p.pontoonDraft, splayed: true, ...sides(pier.id, pier.start, along) };
  });
  const accessItems: Held[] = accessPontoonsOf(site).map((a) => ({ id: a.id, kind: 'access' as const, start: a.start, end: a.end, width: a.width, freeboard, draft: p.pontoonDraft, splayed: false, sideA: [], sideB: [] }));
  const breakwaterItems: Held[] = breakwatersOf(site).map((b) => {
    const product = breakwaterProductOf(b);
    return {
      id: b.id,
      kind: 'breakwater' as const,
      start: b.start,
      end: b.end,
      width: product.width,
      freeboard: product.freeboard,
      draft: Math.max(0, product.height - product.freeboard),
      splayed: true,
      sideA: [],
      sideB: [],
      free: { joints: breakwaterJoints(distance(b.start, b.end), product) },
    };
  });
  if (breakwaterItems.length > 0) {
    warn(
      'BREAKWATER_ANCHORING',
      `Breakwaters ${breakwaterItems.map((b) => b.id).join(', ')}: anchored like piers from their module joints, sized as wave attenuators with the FCG 2022 minimum rules. A breakwater reflects and dissipates waves, so its real wave loads can be well above the minimum; its length, layout and mooring need the supplier's design (AS 3962-2001 5.1.1).`,
    );
  }

  // --- Legs of each pontoon (geometry) ---------------------------------------------------
  const legsOf = new Map<string, LegSpec[]>();
  for (const item of [...held, ...accessItems, ...breakwaterItems]) {
    const { length, along, left } = pierAxis({ id: item.id, start: item.start, end: item.end, width: item.width, locked: false, origin: 'manual' });
    if (!(length > 0)) continue;
    const legs: LegSpec[] = [];
    const minSpan = (angle: number) => (item.width + 1) / Math.cos(angle);
    const at = (t: number, lateral: number) => add(add(item.start, scale(along, t)), scale(left, lateral));
    if (item.splayed) {
      // D46: chains from every module joint: on each side one splayed towards the head and one towards
      // the shore (X pattern); at the shore end towards the head; at the head the tip pair (D30).
      const joints = item.free ? [...item.free.joints] : moduleLengths.length > 0 ? jointPositions(length, moduleLengths) : evenJoints(length, p.lineSpacing);
      const specs: { t: number; splay: 'head' | 'shore'; anchoredOn: 'left' | 'right'; role: 'side' | 'tip' }[] = [];
      const both = (t: number, splay: 'head' | 'shore', role: 'side' | 'tip') => specs.push({ t, splay, anchoredOn: 'right', role }, { t, splay, anchoredOn: 'left', role });
      both(Math.min(STATION_INSET, length / 2), 'head', 'side');
      if (item.free) both(0, 'shore', 'tip');
      for (const j of joints) {
        both(j, 'head', 'side');
        if (theta > 0) both(j, 'shore', 'side');
      }
      if (item.free !== undefined || length >= p.tipAnchorMinLength - 1e-9) both(length, 'head', 'tip');
      let n = 0;
      let k = 0;
      for (const x of specs) {
        const towards = scale(along, x.splay === 'shore' ? -Math.sin(theta) : Math.sin(theta));
        const fixSign = x.anchoredOn === 'right' ? 1 : -1;
        legs.push({
          id: x.role === 'tip' ? `${item.id}-T${++k}` : `${item.id}-A${++n}`,
          holdsId: item.id,
          role: x.role,
          splay: theta === 0 ? 'none' : x.splay,
          fixing: 'seabed',
          fix: at(x.t, (fixSign * item.width) / 2),
          direction: add(scale(left, -fixSign * Math.cos(theta)), towards),
          minSpan: minSpan(theta),
        });
      }
      // D49: a pier reached by a gangway from the shore: two shore chains crossed under the gangway.
      const link = item.free || item.kind !== 'pier' ? null : pierShoreLink(item, site, reach);
      if (link?.kind === 'gangway') {
        const plan = Math.max(link.gap, 0.5) / Math.cos(theta);
        [1, -1].forEach((sign, i) => {
          legs.push({
            id: `${item.id}-S${i + 1}`,
            holdsId: item.id,
            role: 'shore',
            splay: 'none',
            fixing: 'wall',
            fix: at(0, (sign * item.width) / 2),
            direction: add(scale(along, -Math.cos(theta)), scale(left, -sign * Math.sin(theta))),
            minSpan: 0,
            plan,
          });
        });
      }
    } else {
      // Access pontoons (I64): square lines at `lineSpacing`; in front of a wall on the water side only
      // (D28) and two shore chains at each gangway, crossed at θ to fixings in the wall.
      let wallSide: 'left' | 'right' | undefined;
      if (site.shoreline.length >= 2) {
        const mid = add(item.start, scale(along, length / 2));
        const toLeft = distancePointToPolyline(add(mid, scale(left, item.width / 2)), site.shoreline);
        const toRight = distancePointToPolyline(add(mid, scale(left, -item.width / 2)), site.shoreline);
        wallSide = toLeft <= toRight ? 'left' : 'right';
        item.wallSide = wallSide;
      }
      const a = accessPontoonsOf(site).find((x) => x.id === item.id);
      // D28, I122: the piers starting from the water-side edge hold the pontoon with their own chains.
      const attached: { id: string; t: number }[] = [];
      if (wallSide && a) {
        const waterSign = wallSide === 'left' ? -1 : 1;
        const edge: [Vec2, Vec2] = [at(0, (waterSign * item.width) / 2), at(length, (waterSign * item.width) / 2)];
        for (const pier of layout.piers) {
          const { left: pl } = pierAxis(pier);
          const corners = [0, pier.width / 2, -pier.width / 2].map((l) => add(pier.start, scale(pl, l)));
          if (corners.some((c) => distancePointToPolyline(c, edge) <= SHORE_TOLERANCE)) attached.push({ id: pier.id, t: Math.min(length, Math.max(0, dot(sub(pier.start, item.start), along))) });
        }
        item.restraints = { gangways: gangwayPositions(a), piers: attached };
      }
      const pairs = attached.length > 0 ? 0 : Math.max(2, Math.ceil(length / p.lineSpacing) + 1);
      let n = 0;
      for (let i = 0; i < pairs; i++) {
        const t = Math.min(length - STATION_INSET, Math.max(STATION_INSET, (i * length) / (pairs - 1)));
        for (const fixSign of [1, -1] as const) {
          if ((fixSign === 1 && wallSide === 'right') || (fixSign === -1 && wallSide === 'left')) continue;
          legs.push({ id: `${item.id}-A${++n}`, holdsId: item.id, role: 'side', splay: 'none', fixing: 'seabed', fix: at(t, (fixSign * item.width) / 2), direction: scale(left, -fixSign), minSpan: minSpan(0) });
        }
      }
      if (wallSide && a) {
        const wallSign = wallSide === 'left' ? 1 : -1;
        gangwayPositions(a).forEach((tg, g) => {
          const gap = distancePointToPolyline(add(add(item.start, scale(along, tg)), scale(left, (wallSign * item.width) / 2)), site.shoreline);
          const plan = Math.max(gap, 0.5) / Math.cos(theta);
          const half = (plan * Math.sin(theta)) / 2;
          for (const sign of [-1, 1]) {
            legs.push({
              id: `${item.id}-S${2 * g + (sign < 0 ? 1 : 2)}`,
              holdsId: item.id,
              role: 'shore',
              splay: 'none',
              fixing: 'wall',
              fix: at(tg + sign * half, (wallSign * item.width) / 2),
              direction: add(scale(left, wallSign * Math.cos(theta)), scale(along, -sign * Math.sin(theta))),
              minSpan: 0,
              plan,
            });
          }
        });
        const gangwayText = `two shore chains at each gangway${(a.gangways ?? []).length > 0 ? '' : ' (assumed at its middle)'}`;
        const piersText = attached.map((x) => x.id).join(', ');
        warn(
          'ACCESS_PONTOON_SHORE_CHAINS',
          attached.length > 0
            ? `Access pontoon ${item.id} (D28): off the wall it is held by ${gangwayText} and by the piers attached to it (${piersText}), towards the wall by those piers, each by its tributary length; along the wall by the shore chains. It has no chains of its own to the seabed. The piers' chains carry its load with their own (see the load table). The fixings in the wall and the joints between the pontoons are not checked; equal sharing by tributary length is an assumption.`
            : `Access pontoon ${item.id} (D28): no pier starts from it, so it has square chains of its own on the water side (towards the wall); off the wall and along it ${gangwayText} hold it. The fixings in the wall are not checked.`,
          item.id,
        );
      } else if (!wallSide) {
        warn('ACCESS_PONTOON_NO_SHORE', `Access pontoon ${item.id}: the site has no shoreline, so it has no shore chains and is anchored on both sides.`, item.id);
      }
    }
    legsOf.set(item.id, legs);
  }

  // --- Loads and sizing of each pontoon's legs --------------------------------------------
  const strongest = priceList.products
    .filter((x) => x.category === 'chain' && x.breakingLoadKn !== null && x.chainDiameterMm !== null)
    .reduce<Product | null>((a, b) => (!a || b.breakingLoadKn! > a.breakingLoadKn! ? b : a), null);
  /** The cheapest chain holding every case at both levels (MBL·((d−c)/d)² / max T ≥ SF), with its catenaries. */
  const sizeChain = (cases: { case: LegLoadCase['case']; Th: number }[], levels: readonly (readonly ['LW' | 'HW', number])[], length: number) => {
    const evaluate = (product: Product) => {
      const cw = chainWeight({ d_mm: product.chainDiameterMm!, kgPerM: product.massKgPerM }, p.waterDensity);
      const d = product.chainDiameterMm!;
      const mbl = product.breakingLoadKn! * ((d - p.corrosionAllowance) / d) ** 2;
      const results: (LegLoadCase & { upliftDeg: number; X: number; chainFoS: number })[] = [];
      for (const c of cases) {
        for (const [level, h] of levels) {
          const cat = catenary(c.Th, cw.w_kNperM, h, length);
          if (!cat.ok) return null;
          results.push({ case: c.case, waterLevel: level, Th: c.Th, Tfair: cat.Tfair, Tanchor: cat.Tanchor, Fv: cat.Vanchor, upliftDeg: cat.upliftDeg, X: cat.X, chainFoS: mbl / Math.max(cat.Tfair, cat.Tanchor, 1e-9) });
        }
      }
      return { product, estimated: cw.estimated, results, minFoS: results.reduce((m, r) => Math.min(m, r.chainFoS), Infinity), w: cw.w_kNperM };
    };
    let best: { choice: NonNullable<ReturnType<typeof evaluate>>; cost: number } | null = null;
    for (const product of priceList.products) {
      if (product.category !== 'chain' || product.breakingLoadKn === null || product.chainDiameterMm === null || product.chainDiameterMm <= p.corrosionAllowance) continue;
      const price = unitPriceVat0(product, vatPct);
      if (price === null) continue;
      const e = evaluate(product);
      if (!e || e.minFoS < p.chainSafetyFactor - 1e-9) continue;
      const cost = price * length;
      if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && product.chainDiameterMm < best.choice.product.chainDiameterMm!)) best = { choice: e, cost };
    }
    if (best) return { ...best.choice, holds: true };
    const fallback = strongest ? evaluate(strongest) : null;
    return fallback ? { ...fallback, holds: false } : null;
  };

  const pileLines = new Map<string, AnchorLine[]>();
  const alongGovernsBy = new Map<string, number>();
  const items = [...held, ...accessItems, ...breakwaterItems];
  const axisOf = (item: Held) => pierAxis({ id: item.id, start: item.start, end: item.end, width: item.width, locked: false, origin: 'manual' });
  const loadsOf = new Map(
    items.map((item) => {
      const pontoon = { length: axisOf(item).length, width: item.width, freeboard: item.freeboard, draft: item.draft, type: item.kind === 'breakwater' ? ('wave_attenuator' as const) : ('walkway' as const) };
      return [item.id, environmentalLoads(pontoon, { sideA: item.sideA, sideB: item.sideB }, env, loadOpts)] as const;
    }),
  );
  // D28, I122: an access pontoon passes its load across to the piers attached to it, by tributary
  // length: off the wall shared with its gangways' shore chains, towards the wall to the piers alone.
  // A pier carries it in its own case of the same direction.
  const ownShare = new Map<string, Map<LoadCase['id'], number>>();
  const received = new Map<string, Map<LoadCase['id'], number>>();
  const transfersOf = new Map<string, PontoonLoads['transfers']>();
  for (const item of accessItems) {
    const r = item.restraints;
    const el = loadsOf.get(item.id);
    if (!r || r.piers.length === 0 || !el || !item.wallSide) continue;
    const { length, along, left } = axisOf(item);
    const toWall = scale(left, item.wallSide === 'left' ? 1 : -1);
    const shares = new Map<LoadCase['id'], number>();
    const transfers: PontoonLoads['transfers'] = [];
    for (const c of el.cases) {
      const g = add(scale(along, c.dir[0]), scale(left, c.dir[1]));
      const towards = dot(g, toWall);
      if (Math.abs(towards) < 0.5) continue;
      // Off the wall: the gangways and the piers; towards it: the piers only.
      const restraints = [...(towards < 0 ? r.gangways.map((t) => ({ id: null as string | null, t })) : []), ...r.piers.map((x) => ({ id: x.id as string | null, t: x.t }))];
      const trib = tributaryLengths(restraints.map((x) => x.t), length);
      let own = 0;
      restraints.forEach((x, i) => {
        const part = trib[i]! / length;
        if (x.id === null) {
          own += part;
          return;
        }
        const pier = layout.piers.find((q) => q.id === x.id)!;
        const pa = pierAxis(pier);
        const comps: [LoadCase['id'], number][] = [
          [dot(g, pa.along) >= 0 ? 'par+' : 'par-', Math.abs(dot(g, pa.along))],
          [dot(g, pa.left) >= 0 ? 'perp+' : 'perp-', Math.abs(dot(g, pa.left))],
        ];
        for (const [toCase, k] of comps) {
          if (k < 1e-6) continue;
          const kN = c.F_uls * part * k;
          const m = received.get(pier.id) ?? new Map<LoadCase['id'], number>();
          m.set(toCase, (m.get(toCase) ?? 0) + kN);
          received.set(pier.id, m);
          transfers.push({ case: c.id, to: pier.id, toCase, kN });
        }
      });
      shares.set(c.id, own);
    }
    ownShare.set(item.id, shares);
    transfersOf.set(item.id, transfers);
  }
  for (const item of items) {
    const legs = legsOf.get(item.id);
    if (!legs) continue;
    const { along: axis, left } = axisOf(item);
    const el = loadsOf.get(item.id)!;
    loads.push({ id: item.id, kind: item.kind, q: el.q, cases: el.cases, ice: el.ice, transfers: transfersOf.get(item.id) ?? [] });
    for (const w of el.warnings) warnOnce(w);
    const dirDeg = (l: LegSpec) => (Math.atan2(dot(l.direction, left), dot(l.direction, axis)) * 180) / Math.PI;
    const legDirs = legs.map((l) => ({ dirDeg: dirDeg(l) }));
    const perLeg = legs.map(() => [] as { case: LoadCase['id']; Th: number }[]);
    for (const c of el.cases) {
      // The load the pontoon's own legs hold: less what it passes to attached piers, plus what it carries for an access pontoon.
      const F = c.F_uls * (ownShare.get(item.id)?.get(c.id) ?? 1) + (received.get(item.id)?.get(c.id) ?? 0);
      if (F <= 1e-9) continue;
      const dist = distributeToLegs(F, c.dir, legDirs, p.unevenFactor);
      if (!dist.ok) {
        warn('NO_LEG_FOR_DIRECTION', `${item.id} ${c.id}: ${dist.error} The pontoon is not anchored in this direction (e.g. splay angle 0°): add legs.`, item.id, 'error');
        continue;
      }
      dist.Th.forEach((Th, i) => {
        if (Th > 0) perLeg[i]!.push({ case: c.id, Th });
      });
    }
    let alongGoverns = 0;
    const sizeLeg = (leg: LegSpec, i: number): void => {
      const cases = perLeg[i]!;
      const wall = leg.fixing === 'wall';
      const length = wall ? leg.plan! + p.highWater + p.lowWater : (leg.atWall?.chainLength ?? chainLengthFor(hHigh, p));
      const levels = wall
        ? ([
            ['LW', p.lowWater],
            ['HW', p.highWater],
          ] as const)
        : ([
            ['LW', hLow],
            ['HW', hHigh],
          ] as const);
      const chain = sizeChain(cases, levels, length);
      if (chain && !chain.holds) {
        const hint = wall && item.kind === 'access' ? ' More gangways (each with two shore chains, D32) or more piers attached to the access pontoon share its load.' : '';
        warn('NO_CHAIN_STRONG_ENOUGH', `No chain in the price list holds leg ${leg.id} with the factor of safety ${p.chainSafetyFactor.toFixed(1)}; it has no chain.${hint}`, item.id);
      }
      if (chain?.estimated && chain.holds) chainEstimated = true;
      const results = chain?.results ?? [];
      const maxTh = cases.reduce((m, c) => Math.max(m, c.Th), 0);
      const topT = results.reduce((m, r) => Math.max(m, r.Tfair, r.Tanchor), 0);
      const loadCases: LegLoadCase[] = results.map((r) => ({ case: r.case, waterLevel: r.waterLevel, Th: r.Th, Tfair: r.Tfair, Tanchor: r.Tanchor, Fv: r.Fv }));
      // The anchor lies `X` from the fixing at the largest load at high water, on the far side.
      const atHw = results.filter((r) => r.waterLevel === 'HW').reduce<(typeof results)[number] | null>((a, r) => (!a || r.Th > a.Th ? r : a), null);
      const span = wall ? leg.plan! : (leg.atWall?.span ?? Math.max(atHw?.X ?? Math.sqrt(Math.max(0, length * length - hHigh * hHigh)), leg.minSpan));
      // D66: an anchor never lies on land. A chain that would reach the shoreline or an island is
      // fixed to the wall where it meets it, or to a block at the foot of the wall on a shorter chain.
      if (!wall && !leg.landed) {
        const hit = landDistance(site, leg.fix, leg.direction, span);
        if (hit !== null) {
          const blockSpan = hit - WALL_BLOCK_OFFSET;
          if (p.landAnchors === 'blockAtWall' && blockSpan >= MIN_WALL_BLOCK_SPAN && chain) {
            // The chain that puts the anchor at the block under the largest load at high water.
            const Th = atHw?.Th ?? 0;
            const xOf = (L: number) => {
              const c = catenary(Th, chain.w, hHigh, L);
              return c.ok ? c.X : 0;
            };
            let lo = hHigh + 1e-3;
            let hi = length;
            for (let k = 0; k < 40; k++) {
              const mid = (lo + hi) / 2;
              if (xOf(mid) <= blockSpan) lo = mid;
              else hi = mid;
            }
            const moved: LegSpec = { ...leg, landed: 'blockAtWall', atWall: { span: blockSpan, chainLength: Math.round(lo * 10) / 10 } };
            legs[i] = moved;
            sizeLeg(moved, i);
            return;
          }
          const moved: LegSpec = { ...leg, fixing: 'wall', landed: 'wall', plan: Math.max(hit, 0.5) };
          legs[i] = moved;
          sizeLeg(moved, i);
          return;
        }
      }
      const base = {
        id: leg.id,
        holdsId: leg.holdsId,
        splay: leg.splay,
        fixing: leg.fixing,
        role: leg.role,
        ...(leg.landed ? { landed: leg.landed } : {}),
        fix: leg.fix,
        anchor: add(leg.fix, scale(leg.direction, span)),
        dirDeg: legDirs[i]!.dirDeg,
        horizontalKn: maxTh,
        topTensionKn: topT,
        chainLength: length,
        chainId: chain?.holds ? chain.product.id : null,
        chainFoS: chain?.holds ? chain.minFoS : null,
        chainWeightEstimated: chain?.estimated ?? false,
        loadCases,
      };
      if (wall) {
        const g = results.reduce<(typeof results)[number] | null>((a, r) => (!a || Math.max(r.Tfair, r.Tanchor) > Math.max(a.Tfair, a.Tanchor) ? r : a), null);
        lines.push({
          ...base,
          governs: g && g.case.startsWith('par') ? 'along' : 'across',
          upliftKn: 0,
          upliftAngleDeg: 0,
          requiredAnchorKg: 0,
          anchorId: null,
          anchorKind: null,
          anchorCount: 0,
          status: 'OK',
          pileReason: null,
          governing: g ? { case: g.case, waterLevel: g.waterLevel, Th: g.Th, Tfair: g.Tfair, Tanchor: g.Tanchor, Fv: 0, upliftDeg: 0, chainFoS: g.chainFoS, anchorCapacity: null, anchorFoS: null } : null,
        });
        return;
      }
      // Anchor (spec 5.2–5.4): the required dry mass over every case at both levels.
      const massReq = cohesiveCap !== null ? NaN : mu === null ? NaN : results.reduce((m, r) => Math.max(m, requiredAnchorMassFriction(r.Th, r.Fv, mu, p.slidingSafetyFactor / cf, p.concreteDensity, p.waterDensity, p.slopeDeg)), 0);
      let pick: ReturnType<typeof chooseBlock>['pick'] = null;
      let pileReason: string | null = null;
      let heaviest = 0;
      if (cohesiveCap !== null) {
        const holds = results.every((r) => cohesiveCap / r.Th >= p.slidingSafetyFactor - 1e-9);
        const choice = chooseBlock(p.cohesive!.massDryKg, { maxPerLine: 1, maxBlockMassKg: p.maxAnchorMass, seabed: p.seabed }, priceList, vatPct, install);
        heaviest = choice.heaviestKg;
        if (holds && choice.pick) pick = choice.pick;
        else pileReason = holds ? (choice.reason ?? 'block: none') : `block (cohesive model): capacity ${cohesiveCap.toFixed(1)} kN < ${p.slidingSafetyFactor.toFixed(1)} × ${maxTh.toFixed(1)} kN`;
      } else if (mu === null) {
        pileReason = 'soft clay / mud: no friction model (NAVFAC); give the cohesive parameters or have an expert size the anchor';
        heaviest = usableBlocks(priceList, p.maxAnchorMass, p.seabed).reduce((m, x) => Math.max(m, x.anchorMassKg!), 0);
      } else {
        const choice = chooseBlock(massReq, { maxPerLine, maxBlockMassKg: p.maxAnchorMass, seabed: p.seabed }, priceList, vatPct, install);
        heaviest = choice.heaviestKg;
        pick = choice.pick;
        pileReason = choice.reason;
      }
      // Capacity and factor of safety per case: of the chosen blocks, or of the heaviest allowed for a pile line.
      const blockMass = pick ? pick.product.anchorMassKg! * pick.count : heaviest * maxPerLine;
      const capacity = (r: (typeof results)[number]) =>
        cohesiveCap !== null ? (pick ? cohesiveCap : 0) : mu === null ? 0 : anchorCapacityFriction(submergedWeight_kN(blockMass, p.concreteDensity, p.waterDensity), r.Fv, mu, p.slopeDeg) * cf;
      const g = results.reduce<{ r: (typeof results)[number]; cap: number; fos: number } | null>((a, r) => {
        const cap = capacity(r);
        const fos = cap / r.Th;
        return !a || fos < a.fos ? { r, cap, fos } : a;
      }, null);
      if (g && g.r.case.startsWith('par')) alongGoverns++;
      const line: AnchorLine = {
        ...base,
        governs: g && g.r.case.startsWith('par') ? 'along' : 'across',
        upliftKn: g?.r.Fv ?? 0,
        upliftAngleDeg: g?.r.upliftDeg ?? 0,
        requiredAnchorKg: massReq,
        anchorId: pick ? pick.product.id : (pile?.id ?? null),
        anchorKind: pick ? 'block' : 'pile',
        anchorCount: pick ? pick.count : 1,
        status: pick ? 'OK' : 'PILE',
        pileReason: pick ? null : pileReason,
        governing: g ? { case: g.r.case, waterLevel: g.r.waterLevel, Th: g.r.Th, Tfair: g.r.Tfair, Tanchor: g.r.Tanchor, Fv: g.r.Fv, upliftDeg: g.r.upliftDeg, chainFoS: g.r.chainFoS, anchorCapacity: g.cap, anchorFoS: g.fos } : null,
      };
      lines.push(line);
      if (!pick) pileLines.set(item.id, [...(pileLines.get(item.id) ?? []), line]);
    };
    legs.forEach((leg, i) => sizeLeg(leg, i));
    // D66: say which chains were moved off land.
    const toWall = legs.filter((l) => l.landed === 'wall').map((l) => l.id);
    const toBlock = legs.filter((l) => l.landed === 'blockAtWall').map((l) => l.id);
    if (toWall.length > 0) {
      warn('ANCHOR_ON_LAND_TO_WALL', `${item.id}: the anchors of ${toWall.join(', ')} would lie on land, so these chains are fixed to the shore wall where they meet it (D66). The wall and its fixings are not checked: they need a structural check of the wall.`, item.id);
    }
    if (toBlock.length > 0) {
      warn('ANCHOR_ON_LAND_TO_BLOCK', `${item.id}: the anchors of ${toBlock.join(', ')} would lie on land, so these chains go to concrete blocks at the foot of the shore wall on shortened chains (D66). A short chain lifts the block; check the wall foot (scour, slope, existing structures).`, item.id);
    }
    // D66: only the shoreline and islands are known to be land; an anchor beyond another edge of
    // the water area may be on land that has no shoreline drawn.
    if (site.water.length >= 3) {
      const outside = lines.filter((l) => l.holdsId === item.id && l.fixing === 'seabed' && !pointInRing(l.anchor, site.water)).map((l) => l.id);
      if (outside.length > 0) {
        warn('ANCHOR_OUTSIDE_WATER_AREA', `${item.id}: the anchors of ${outside.join(', ')} lie outside the drawn water area. If the water area ends at land there, draw the shoreline along it: anchors are then kept off the land (D66).`, item.id);
      }
    }
    alongGovernsBy.set(item.id, alongGoverns);
    // Practical rules of the spec (§6), per pontoon.
    const mooringLegs: MooringLeg[] = legs.map((leg) => {
      const l = lines.find((x) => x.id === leg.id)!;
      const product = priceList.products.find((x) => x.id === l.chainId);
      return {
        id: leg.id,
        dirDeg: l.dirDeg,
        chain: { d_mm: product?.chainDiameterMm ?? 0, kgPerM: product?.massKgPerM ?? null, MBL_kN: product?.breakingLoadKn ?? 0, length_m: l.chainLength },
        anchor: { massDryKg: l.anchorKind === 'block' ? (priceList.products.find((x) => x.id === l.anchorId)?.anchorMassKg ?? 0) * l.anchorCount : 0, seabed: p.seabed },
        h_LW: leg.fixing === 'wall' ? p.lowWater : hLow,
        h_HW: leg.fixing === 'wall' ? Math.max(p.highWater, 0.1) : hHigh,
      };
    });
    // The chain-length rules concern chains to the seabed; every leg (shore chains too) counts as an anchor point.
    const seabedLegs = mooringLegs.filter((_, i) => legs[i]!.fixing === 'seabed');
    const pontoon = { length: axisOf(item).length, width: item.width, freeboard: item.freeboard, draft: item.draft, type: item.kind === 'breakwater' ? ('wave_attenuator' as const) : ('walkway' as const) };
    const attachedPiers = item.restraints?.piers.map((x) => x.id) ?? [];
    const rules = ruleChecks({ legs: seabedLegs, pontoon, env, ...(item.kind === 'breakwater' ? { opts: { preset: 'FCG_wave_attenuator' as const } } : {}) }).filter(
      (w) => w.code !== 'FEWER_THAN_4_ANCHOR_POINTS' || mooringLegs.length < 4,
    );
    for (const w of rules) {
      if (w.code === 'CHAIN_BELOW_4_DEPTHS' || w.code === 'CHAIN_BELOW_5_DEPTHS') warnOnce({ code: w.code, message: `${item.id}: ${w.message.replace(/^[^:]+: /, 'chains ')}` }, item.id);
      else if (w.code === 'FCG_CHAIN') warnOnce({ code: w.code, message: `${item.id}: ${w.message.replace(/^[^:]+: /, '')}` }, item.id);
      else if (w.code === 'WINTER_IN_WATER') warnOnce(w);
      else if (w.code === 'FEWER_THAN_4_ANCHOR_POINTS')
        warnOnce({ code: w.code, message: `${item.id}: ${mooringLegs.length} anchor points < 4 per pontoon (FCG 2022)${attachedPiers.length > 0 ? `; it is also held by the piers attached to it (${attachedPiers.join(', ')})` : ''}.` }, item.id);
      else warnOnce({ code: w.code, message: `${item.id}: ${w.message}` }, item.id);
    }
  }

  // D64: lines that no block of at most maxAnchorMass holds take a pile anchor.
  for (const [id, ls] of pileLines) {
    const total = lines.filter((l) => l.holdsId === id && l.fixing === 'seabed').length;
    const worst = ls.reduce((a, l) => ((l.requiredAnchorKg || 0) > (a.requiredAnchorKg || 0) ? l : a));
    warn(
      'PILE_ANCHORS',
      `${id}: ${ls.length} of ${total} anchor lines take a pile anchor at the end of the chain: no concrete anchor of at most ${groupThousands(p.maxAnchorMass)} kg holds them (worst ${worst.id}: ${worst.pileReason}). Pile length and section by geotechnical design.`,
      id,
    );
  }
  for (const [id, n] of alongGovernsBy) {
    if (n > 0) {
      warn('ALONG_LOAD_GOVERNS', `${id}: the load along the pontoon governs ${n} legs: consider longitudinal legs or cross-chaining (spec §4).`, id);
    }
  }
  const tandem = lines.filter((l) => l.anchorKind === 'block' && l.anchorCount > 1);
  if (tandem.length > 0) {
    warn(
      'TANDEM_ANCHORS',
      `${tandem.length} lines have 2 anchors in tandem (maxAnchorsPerLine = 2, the user's choice; ${tandem
        .slice(0, 5)
        .map((l) => l.id)
        .join(', ')}${tandem.length > 5 ? ', …' : ''}). Several anchors on one chain do not necessarily equal one anchor of the same total mass (Chalmers 2026); the arrangement needs the mooring designer's approval.`,
    );
  }
  if (chainEstimated) warn('CHAIN_WEIGHT_ESTIMATED', 'A chain without the manufacturer’s kg/m is weighed as 0.0219·d² kg/m (studless link chain, approximate); long-link chain (DIN 763) weighs differently.');
  if (mu === null && cohesiveCap === null) warn('NO_FRICTION_MODEL', 'Soft clay / mud: no friction model (NAVFAC DM-7.02). Give the cohesive parameters (spec 5.3) or have an expert size the anchors; until then the lines take pile anchors.');
  if (p.capacityFactor !== 1 && !p.capacityFactorSource.trim()) warn('CAPACITY_FACTOR_WITHOUT_SOURCE', `Capacity factor ${p.capacityFactor} without a documented basis (pull test, measured embedment).`);
  if (classes.some((c) => c.length > 25)) warn('VESSEL_OVER_25M_TODO', 'AS 3962 advises a calculation height z > 3 m for boats over 25 m: not implemented (TODO).');
  if ((input.waves?.exceeding ?? []).length > 0) {
    warn(
      'WAVE_LOAD_ABOVE_CRITERIA',
      `The waves from ${input.waves!.exceeding.join(', ')} exceed the wave climate criteria of the screening; AS 3962's 2 kN/m is a minimum "for the wave criteria given in Table 4.2". Larger waves need a wave analysis: enter its wave line load.`,
    );
  }

  // --- Stern buoys (D36, D37): one line per berth from the buoy straight down to its sinker -----
  const table = buoyTable(p.buoyTable, p);
  const tableName = p.buoyTable === 'topMarine' ? 'Top Marine’s table' : 'Båtunionen’s table (Hamnhandboken 2016)';
  const buoyLines: AnchorLine[] = [];
  const estimated = new Map<string, number>();
  let beyondTable = 0;
  const farClasses = new Set<string>();
  const cdHead = Math.max(WIND_CD.vesselBow, WIND_CD.vesselStern);
  for (const b of layout.berths) {
    const c = classById.get(b.boatClassId);
    if (!b.buoy || b.removed || !c) continue;
    const weightEstimated = !(c.weight !== undefined && c.weight > 0);
    const weight = weightEstimated ? estimateBoatWeight(c.length) : c.weight!;
    if (weightEstimated) estimated.set(c.id, weight);
    const { row, beyond } = buoyTableRow(table, weight, p.buoyExposed);
    if (beyond) beyondTable++;
    if (input.buoyDepthFactor !== undefined && input.buoyDepthFactor * p.depth > 1.4 * c.length + 1e-9) farClasses.add(c.name);
    // The buoy holds the boat stern-on against the wind (AS 3962 Table 4.4 head area, Table 4.3).
    const H = q * cdHead * vesselWindArea(vesselType(c), c.length).head;
    const length = buoyChainLength(p.depth, hHigh, p);
    const levels = [
      ['LW', hLow],
      ['HW', hHigh],
    ] as const;
    // The table's chain size at least; then the cheapest that holds.
    const evaluateBuoyChain = () => {
      let best: { product: Product; results: { r: LegLoadCase; upliftDeg: number; chainFoS: number }[]; cost: number } | null = null;
      for (const product of priceList.products) {
        const d = product.chainDiameterMm;
        if (product.category !== 'chain' || product.breakingLoadKn === null || d === null || d < row.chainMm - 1e-9 || d <= p.corrosionAllowance) continue;
        const price = unitPriceVat0(product, vatPct);
        if (price === null) continue;
        const cw = chainWeight({ d_mm: d, kgPerM: product.massKgPerM }, p.waterDensity);
        const mbl = product.breakingLoadKn * ((d - p.corrosionAllowance) / d) ** 2;
        const results: { r: LegLoadCase; upliftDeg: number; chainFoS: number }[] = [];
        let ok = true;
        for (const [level, h] of levels) {
          const cat = catenary(H, cw.w_kNperM, h, length);
          if (!cat.ok) {
            ok = false;
            break;
          }
          results.push({ r: { case: 'stern', waterLevel: level, Th: H, Tfair: cat.Tfair, Tanchor: cat.Tanchor, Fv: cat.Vanchor }, upliftDeg: cat.upliftDeg, chainFoS: mbl / Math.max(cat.Tfair, cat.Tanchor) });
        }
        if (!ok || results.some((x) => x.chainFoS < p.chainSafetyFactor - 1e-9)) continue;
        const cost = price * length;
        if (!best || cost < best.cost - 1e-9) best = { product, results, cost };
      }
      return best;
    };
    const chain = evaluateBuoyChain();
    const mass = p.buoySinkerMethod === 'table' ? row.sinkerKg : p.buoySinkerFactor * weight * 1000;
    const choice = chooseBlock(mass, { maxPerLine, maxBlockMassKg: p.maxAnchorMass, seabed: p.seabed }, priceList, vatPct, install);
    const worst = chain?.results.reduce((a, x) => (x.r.Fv > a.r.Fv ? x : a)) ?? null;
    const chainMass = chain ? (chain.product.massKgPerM ?? 0.0219 * chain.product.chainDiameterMm! ** 2) * length * (1 - p.waterDensity / p.steelDensity) : 0;
    const line: AnchorLine = {
      id: `${b.id}-B`,
      holdsId: b.id,
      splay: 'none',
      governs: 'across',
      fixing: 'seabed',
      role: 'buoy',
      fix: b.buoy,
      anchor: b.buoy,
      dirDeg: 0,
      horizontalKn: H,
      topTensionKn: chain ? chain.results.reduce((m, x) => Math.max(m, x.r.Tfair, x.r.Tanchor), 0) : H,
      chainLength: length,
      chainId: chain?.product.id ?? null,
      chainFoS: chain ? chain.results.reduce((m, x) => Math.min(m, x.chainFoS), Infinity) : null,
      chainWeightEstimated: chain ? chain.product.massKgPerM === null : false,
      upliftKn: worst?.r.Fv ?? 0,
      upliftAngleDeg: worst?.upliftDeg ?? 0,
      requiredAnchorKg: mass,
      anchorId: choice.pick ? choice.pick.product.id : (pile?.id ?? null),
      anchorKind: choice.pick ? 'block' : 'pile',
      anchorCount: choice.pick ? choice.pick.count : 1,
      status: choice.pick ? 'OK' : 'PILE',
      pileReason: choice.pick ? null : choice.reason,
      governing: worst ? { case: 'stern', waterLevel: worst.r.waterLevel, Th: H, Tfair: worst.r.Tfair, Tanchor: worst.r.Tanchor, Fv: worst.r.Fv, upliftDeg: worst.upliftDeg, chainFoS: worst.chainFoS, anchorCapacity: null, anchorFoS: null } : null,
      loadCases: chain ? chain.results.map((x) => x.r) : [],
      buoy: {
        boatWeightT: weight,
        weightEstimated,
        // Båtunionen: the buoy "skall gott och väl bära kättingtyngden".
        floatCapacityKg: Math.max(row.floatCapacityKg, chainMass),
        tableChainMm: row.chainMm,
        windAnchorKg: mu === null || !worst ? NaN : requiredAnchorMassFriction(H, worst.r.Fv, mu, p.slidingSafetyFactor / cf, p.concreteDensity, p.waterDensity, p.slopeDeg),
      },
    };
    buoyLines.push(line);
    if (!chain) warn('NO_CHAIN_STRONG_ENOUGH', `No chain of at least ${row.chainMm} mm in the price list holds ${H.toFixed(1)} kN with the factor of safety; stern buoy ${line.id} has no chain.`, b.id);
  }
  lines.push(...buoyLines);
  if (buoyLines.length > 0) {
    const heaviestSinker = buoyLines.reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0);
    const sinker =
      p.buoySinkerMethod === 'table'
        ? `the sinker of ${tableName}${p.buoyTable === 'batunionen' ? ' (its weight in water as concrete in air)' : ''}`
        : `${p.buoySinkerFactor.toFixed(1)} × the boat’s weight (Top Marine’s rule of thumb, 3–5 × in sheltered waters; no other source found supports it)`;
    warn(
      'STERN_BUOYS',
      `${buoyLines.length} stern buoys, each on its own sinker: ${sinker}${p.buoyExposed ? ', one row up for an exposed harbour' : ''}, heaviest ${Math.round(heaviestSinker)} kg. Chain ${buoyLines[0]!.chainLength.toFixed(1)} m = the larger of ${p.buoyChainFactor.toFixed(2)} × the design depth and the depth at high water + ${p.buoyLift.toFixed(1)} m, at least the size of ${tableName} and strong enough for the boat’s stern-on wind (AS 3962) at both water levels; float of at least the table’s buoyancy and the chain’s weight in water. The wind on the boats broadside is left to the piers.`,
    );
    const piled = buoyLines.filter((l) => l.status === 'PILE');
    if (piled.length > 0) warn('PILE_ANCHORS', `stern buoys: ${piled.length} of ${buoyLines.length} sinkers take a pile anchor: ${piled[0]!.pileReason}.`);
    const light = buoyLines.filter((l) => Number.isFinite(l.buoy!.windAnchorKg) && l.buoy!.windAnchorKg > l.requiredAnchorKg + 1e-6);
    if (light.length > 0) {
      const worst = light.reduce((a, l) => (l.buoy!.windAnchorKg - l.requiredAnchorKg > a.buoy!.windAnchorKg - a.requiredAnchorKg ? l : a));
      warn(
        'BUOY_SINKER_BELOW_WIND_METHOD',
        `${light.length} stern-buoy sinkers are lighter than the friction sizing of the spec needs for the boat’s stern-on wind (e.g. ${worst.id}: ${Math.round(worst.requiredAnchorKg)} kg, the sizing gives ${Math.round(worst.buoy!.windAnchorKg)} kg). The friction model is a lower bound: a sinker embedded in the seabed holds more.`,
      );
    }
    if (estimated.size > 0) {
      warn(
        'BOAT_WEIGHT_ESTIMATED',
        `No weight given for ${[...estimated.entries()]
          .map(([id, w]) => `${classById.get(id)!.name} (estimated ${w.toFixed(1)} t)`)
          .join(', ')}: estimated from the length with Top Marine’s table for sailing boats. Enter the boat weights for the stern buoys.`,
      );
    }
    if (beyondTable > 0) {
      warn('BOAT_ABOVE_BUOY_TABLE', `${beyondTable} stern buoys run past the end of ${tableName} (boats heavier than ${table[table.length - 1]!.weightT.toFixed(1)} t${p.buoyExposed ? ', or one row up for exposure' : ''}); its largest row is used.`);
    }
    if (p.depth > 5 + 1e-9) {
      warn('BUOY_DEEP_WATER', `Design depth ${p.depth.toFixed(1)} m: mooring between pier and buoy "bör undvikas om vattendjupet är större än 5-6 meter" (Båtunionen): the long buoy chains let the boats swing sideways; at larger depths each buoy is anchored to two sinkers.`);
    }
    const normal = p.normalHighWater !== null && p.normalLowWater !== null;
    const range = normal ? p.normalHighWater! + p.normalLowWater! : p.highWater + p.lowWater;
    if (range > 1.3 + 1e-9) {
      warn(
        'BUOY_WATER_LEVEL_RANGE',
        normal
          ? `Normal high + low water ${range.toFixed(1)} m (MHW − MNW of the gauge): the buoy chain slope 1:1 holds where normal high and low water differ by at most about 1.3 m (Båtunionen); with a larger range the slope "beräknas från fall till fall".`
          : `High + low water ${range.toFixed(1)} m: the buoy chain slope 1:1 holds where normal high and low water differ by at most about 1.3 m (Båtunionen); with a larger range the slope "beräknas från fall till fall". These are extreme levels: look up the normal range from a gauge (anchoring parameters, "Find water-level gauges").`,
      );
    }
    if (farClasses.size > 0) {
      warn('BUOY_FAR_FROM_BOAT', `Boat–buoy distance (${(input.buoyDepthFactor! * p.depth).toFixed(1)} m) above 1.4 × the boat length for ${[...farClasses].join(', ')}: "Avståndet mellan båt och boj bör dock inte överstiga 1,4 gånger båtlängden" (Båtunionen).`);
    }
  }

  // --- D31: fingers longer than fingerPileMinLength get an end pile ------------------------------
  // The finger carries the full broadside wind of the boats beside it (AS 3962 Table 4.4 beam area,
  // no shielding); as a beam held at the pier and at the pile, the pile takes half (assumption).
  const piles: FingerPile[] = [];
  for (const finger of layout.fingers ?? []) {
    const pier = layout.piers.find((x) => x.id === finger.pierId);
    if (!pier || finger.shape.length < 3) continue;
    const { along: ax, left } = pierAxis(pier);
    const local = finger.shape.map((v) => ({ s: dot(sub(v, pier.start), ax), d: dot(sub(v, pier.start), left) }));
    const sign = local.reduce((a, v) => a + v.d, 0) >= 0 ? 1 : -1;
    const side: 'left' | 'right' = sign > 0 ? 'left' : 'right';
    const s0 = Math.min(...local.map((v) => v.s));
    const s1 = Math.max(...local.map((v) => v.s));
    const dIn = Math.min(...local.map((v) => sign * v.d));
    const dOut = Math.max(...local.map((v) => sign * v.d));
    if (dOut - dIn <= p.fingerPileMinLength + 1e-9) continue;
    let F = 0;
    for (const b of layout.berths) {
      if (b.pierId !== pier.id || b.side !== side || b.removed) continue;
      const c = classById.get(b.boatClassId);
      if (!c) continue;
      const bs = b.slot.map((v) => dot(sub(v, pier.start), ax));
      if (Math.abs(Math.max(...bs) - s0) < 0.05 || Math.abs(Math.min(...bs) - s1) < 0.05) F += q * WIND_CD.vesselBeam * vesselWindArea(vesselType(c), c.length).beam;
    }
    const loadKn = F / 2;
    piles.push({ id: `${finger.id}-pile`, holdsId: finger.id, at: add(add(pier.start, scale(ax, (s0 + s1) / 2)), scale(left, sign * dOut)), loadKn, guide: choosePileGuide(loadKn) });
  }
  if (piles.length > 0) {
    const max = piles.reduce((m, x) => Math.max(m, x.loadKn), 0);
    warn(
      'FINGER_END_PILES',
      `${piles.length} fingers longer than ${p.fingerPileMinLength.toFixed(1)} m are moored with an end pile at the tip (Marinetek: "Longer than 12 m … Fingers are moored with end piles"), each for half the full broadside wind of the boats beside it (AS 3962); largest ${max.toFixed(1)} kN${choosePileGuide(max) ? ` → pile guide ${choosePileGuide(max)}` : ''}. Piles and guides are not priced and not designed here.`,
    );
    if (piles.some((x) => x.guide === null)) warn('PILE_LOAD_ABOVE_STANDARD_GUIDES', `${piles.filter((x) => x.guide === null).length} end piles need more than the 70 kN of Marinetek's strongest standard guide (G700).`);
  }

  // Anchors must lie in the water area (and not under an obstacle).
  if (site.water.length >= 3) {
    const outside = lines.filter((l) => l.fixing === 'seabed' && (!pointInRing(l.anchor, site.water) || site.obstacles.some((o) => pointInRing(l.anchor, o.shape))));
    if (outside.length > 0) {
      warn(
        'ANCHOR_OUTSIDE_WATER',
        `${outside.length} anchors lie outside the water area or under an obstacle (${outside
          .slice(0, 5)
          .map((l) => l.id)
          .join(', ')}${outside.length > 5 ? ', …' : ''}); those lines need another fixing, e.g. to the shore or with a shorter chain.`,
      );
    }
  }
  return { lines, piles, loads, issues };
}
