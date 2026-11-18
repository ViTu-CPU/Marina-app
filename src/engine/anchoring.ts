/**
 * Preliminary anchoring plan (DECISIONS D23): chain lines and concrete anchors for the
 * main piers and access pontoons of a layout, for one design water depth (D16).
 *
 * This is a QUANTITY ESTIMATE for a feasibility study, not a mooring design. The method
 * and every factor are listed in docs/RESEARCH.md §5; each factor is a parameter. Waves,
 * ice, currents, berthing loads, dynamic effects and the structural capacity of the
 * pontoons and their fixings are not calculated.
 *
 * Method, per pier (wind loads after UFC 4-152-07 Change 1, 2012, §6-3.4.1 and Fig. 6-5;
 * docs/RESEARCH.md §5, DECISIONS I54):
 *  1. Wind across the pier: q · Cd · (A_windward + leeward factor · A_leeward + A_pontoon),
 *     q = ½ ρ_air v². The boats lie square to the pier, so this wind meets them bow- or
 *     stern-on: area = beam × profile height (profile height = ratio × boat length). The
 *     pier face counts where no boat of the windward row stands in front of it (DBW 2005,
 *     commentary to C2.4.1). The larger of the two directions is used for both sides.
 *  2. Wind along the pier: the boats are hit broadside (length × profile height); per row,
 *     the first boat from the windward end in full and the others with the leeward factor,
 *     plus the pier's end area. Computed for wind from the sea and from the shore.
 *  3. Lines (DECISIONS D25, I60): pairs of chains crossed under the pier at a spacing along
 *     it, each splayed by the angle θ from square to the pier (Chalmers 2026 Fig. 4). The
 *     stations in the shore half are splayed towards the head and hold wind from the sea;
 *     those in the head half towards the shore and hold wind from the shore. Each direction
 *     is checked separately (UFC §6-3.4.1.4): across, the lines of one side share the load,
 *     H = F / pairs / cos θ; along, the lines splayed against it share it,
 *     H = F / lines / sin θ. A line takes the larger.
 *  3b. Access pontoons in front of the shore (D28, I64–I66): square lines on the water side
 *     only (they hold the wind towards the wall). The wind pushing the pontoon off the wall is
 *     shared by tributary length between two shore chains at its gangway (crossed at θ, to
 *     fixings in the wall) and the piers attached to it, which add their share to the load
 *     their shore-ward lines hold. The wind along the wall goes to the shore chains.
 *  4. Each line: chain length L = max(h + 1 m, factor × h), h = depth at high water.
 *     Catenary with a = H / w (w = submerged weight per metre). If L is at least the length
 *     that hangs when the chain touches the bottom tangentially, s = √(h² + 2 h a), the
 *     rest lies on the bottom and the anchor gets no uplift. Otherwise the chain hangs
 *     between both ends: span X = 2a · asinh(√(L² − h²) / 2a), uplift at the anchor
 *     V = H · sinh(atanh(h/L) − X/2a), at the pontoon T = √(H² + (V + wL)²).
 *  5. Chain: the cheapest chain of the price list with a published breaking load such that
 *     MBL · ((d − c)/d)² ≥ SF · T (c = corrosion allowance on the diameter).
 *  6. Anchor (D62, engine/anchorChoice.ts): a block needs the submerged weight
 *     SF_slide · (H / μ + V); mass = that / (g (1 − ρ_w/ρ_c)). Friction only: the extra holding
 *     of an anchor embedded in the seabed is not counted (it depends on penetration, which is
 *     not known at this stage; Chalmers 2026 §7.5). Per line the cheapest anchor of the price
 *     list that suits the seabed and holds it with at most `maxAnchorsPerLine` pieces (default
 *     1): a block no heavier than the largest piece to be handled, or another kind by its
 *     published capacity. When none does, the line is INFEASIBLE (not priced; anchor point by
 *     geotechnical and mooring design); the mass is never split over more anchors.
 *  7. Stern buoys (D36, D37, I79–I85): one line per stern-buoy berth, from the buoy straight
 *     down to its sinker. Sinker, chain size and float from a selection table by boat weight
 *     (default Svenska Båtunionen's Hamnhandboken 2016, Tabell 3; or Top Marine's), one row up
 *     in an exposed harbour; or sinker = factor × boat weight. Chain length = factor × design
 *     depth (1.41: slope 1:1), at least the depth at high water + the lift of the buoy (0.8 m);
 *     the chain is at least the table's size and strong enough for the boat's stern-on wind.
 *     The friction method of step 6 is shown for comparison.
 */
import { chooseLineAnchor, installParams } from './anchorChoice';
import { unitPriceVat0, type AnchorKind as ProductAnchorKind, type PriceList, type Product, type SeabedType } from './catalog';
import { breakwaterJoints, breakwaterProductOf, breakwatersOf } from './breakwater';
import { add, distance, distancePointToPolyline, dot, pointInRing, scale, sub } from './geometry';
import type { BoatClass, Finger, Issue, Layout, MainPier, Site, Vec2 } from './model';
import { jointPositions } from './modules';
import { pierAxis } from './rows';
import { accessPontoonsOf, DEFAULT_GANGWAY_LENGTH, gangwayPositions, pierShoreLink, SHORE_TOLERANCE } from './site';

export type Seabed = SeabedType;

/**
 * 'block': plain concrete block holding by friction. 'wedge': Pearl Harbor type concrete
 * wedge that digs into soft seabeds, sized from Sound & Sea Technology 2009 Tables 35–36
 * (DECISIONS I59).
 */
export type AnchorType = 'block' | 'wedge';

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

export interface AnchoringParams {
  /** Design water depth at the anchors, m (D16). */
  depth: number;
  /** Highest water level above the design level, m. */
  highWater: number;
  /** Lowest water level below the design level, m. */
  lowWater: number;
  /**
   * D50: normal high and low water (MHW − MW, MW − MNW), m, when known from a gauge; null = the
   * extremes above stand for them. Used for the stern-buoy range check (Båtunionen's "normal
   * högvattenyta").
   */
  normalHighWater: number | null;
  normalLowWater: number | null;
  /** D52: level of the quay (gangway pivot) above the design water level, m; null = not known (no slope check). */
  quayLevel: number | null;
  seabed: Seabed;
  /** Design (steady) wind speed, m/s. */
  windSpeed: number;
  airDensity: number;
  dragCoefficient: number;
  /** Wind on the boats of the leeward row (and on shielded boats), as a fraction. */
  leewardFactor: number;
  /** Boat profile height above water = ratio × boat (berth) length. */
  profileHeightRatio: number;
  /** Pontoon height above water used for its wind area when the product gives none, m. */
  pontoonFreeboard: number;
  /** Spacing of crossed line pairs along a pier, m. */
  lineSpacing: number;
  /**
   * D45: horizontal wave load on the pontoons from directions with open water, kN/m (AS 3962-2001
   * 4.8.2.3: "a minimum horizontal force of 2 kN/m"); 0 turns it off.
   */
  waveLoad: number;
  /**
   * D57, I104: the wave load grows with the 50-year significant wave height Hm0 of each direction:
   * none up to `waveLoadMinHs` (UFC 4-152-07 6-3.4.7.2: above 1 ft the waves "could be a
   * significant factor in design"), the full `waveLoad` from `waveLoadFullHs` (the largest
   * criterion of AS 3962 Table 4.2, for which 4.8.2.3 gives 2 kN/m), in proportion to Hm0²
   * between (Assumption: wave drift forces grow with the square of the wave height). A direction
   * whose height is not known takes the full load. `waveLoadFullHs` 0 gives the full load always.
   */
  waveLoadMinHs: number;
  waveLoadFullHs: number;
  /**
   * Plan angle of the chains of a main pier from square to the pier, degrees (0–80). The
   * splayed chains also hold the wind along the pier (D25); 0 leaves that load unheld.
   */
  splayAngle: number;
  chainSafetyFactor: number;
  /** Loss of chain diameter over the design life (corrosion and wear), mm. */
  corrosionAllowance: number;
  slidingSafetyFactor: number;
  /** Friction coefficient between concrete anchor and seabed. */
  friction: Record<Seabed, number>;
  /** Chain length as a multiple of the water depth at high water (at least depth + 1 m). */
  chainLengthFactor: number;
  /** Heaviest single concrete anchor to be handled, kg; heavier products are not chosen (D62). */
  maxAnchorMass: number;
  /**
   * D62: at most this many anchors on one line: 1 (default) or 2 (tandem, the user's choice, with a
   * warning). A line that no anchor of the price list holds within it is INFEASIBLE; the mass is
   * never split over more anchors.
   */
  maxAnchorsPerLine: number;
  /**
   * D62: factor of safety on the published capacities of anchors other than blocks:
   * factor × H ≤ pieces × capacity_horizontal_kn (and the same for uplift). 1 = the published
   * figures are working loads that already include the supplier's factor (Assumption).
   */
  capacitySafetyFactor: number;
  /**
   * Main piers at least this long get two crossed tip chains (D30), m. A value longer than
   * every pier turns them off.
   */
  tipAnchorMinLength: number;
  /** Fingers longer than this get an end pile at the tip (D31), m. */
  fingerPileMinLength: number;
  anchorType: AnchorType;
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
  waterDensity: number;
  concreteDensity: number;
  steelDensity: number;
}

/**
 * Defaults. Sources (docs/RESEARCH.md §5, DECISIONS I47, I54–I57):
 *  - windSpeed 22 m/s: Finnish sea areas v_b,0 (YM 2007, search excerpt), used as the steady
 *    design wind like the 10-minute reference wind in Chalmers 2026 §2.6. To be verified.
 *  - dragCoefficient 1.6: UFC 4-152-07 C1 Fig. 6-4 gives p = V²/240 psf (V in mph), i.e.
 *    1.0 Pa per (m/s)², = ½ · 1.25 · v² · 1.6.
 *  - profileHeightRatio 0.15 and leewardFactor 0.2: UFC 4-152-07 C1 §6-3.4.1.3–4.
 *  - chainLengthFactor 4: "approximately four times the HAT water depth", SF Marina's initial
 *    design assumption (Chalmers 2026 §3.3).
 *  - chainSafetyFactor 3.0 on the new chain's breaking load: UFC 4-159-03 (2020) Table 3-7;
 *    hence no corrosion allowance by default.
 *  - maxAnchorMass 3000 kg: SF Marina prefers anchors of about 3 t or less for smaller
 *    installations (Chalmers 2026 §3.8).
 *  - maxAnchorsPerLine 1 (D62): one anchor per line; Chalmers 2026 notes that several anchors on
 *    one line do not necessarily hold as much as one anchor of the same mass.
 *  - capacitySafetyFactor 1 (D62, Assumption): published capacities taken as working loads.
 *  - concreteDensity 2400 kg/m³: "about 150 pounds per cubic foot" (DBW 2005, App. A p. 90).
 *  - friction sand 0.6: smooth concrete on quartz sand (Sound & Sea Technology 2009, Table 33).
 *  - anchorType 'block': the concrete anchors of the price list are plain blocks; kept as the
 *    default by the owner (D26).
 *  - splayAngle 45°: owner's choice (D25). Splayed corner chains are SF Marina's typical layout
 *    (Chalmers 2026 Fig. 4; 12° in its reference case); 45° is from Savorak's instructions for
 *    a cottage-dock kit, "ristiin pohjapainoihin, 45 asteen kulmassa" (savorak.fi, read
 *    2026-11-14) — a light dock, so a weak source for a marina pier.
 *  - tipAnchorMinLength 10 m: owner's choice (D30).
 *  - fingerPileMinLength 12 m: "Longer than 12 m Super Yacht and Concrete Fingers are moored with
 *    end piles" (Marinetek catalogue 2012, p. 27; owner's choice D31).
 *  - Stern buoys (D37, docs/RESEARCH.md §9.14): buoyTable 'batunionen', method 'table' and
 *    buoyExposed false after Svenska Båtunionen, Hamnhandboken (2016) §2.33 Tabell 3 ("Vid utsatt
 *    läge ökas angivna dimensioner ett steg"); buoyChainFactor 1.41 = √2, the chain slope 1:1 of
 *    §2.32 ("kan bojkättingen ges en lutning av 1:1 (= 45°)"), and buoyLift 0.8 m ("bojen kan
 *    lyftas med centrum ca 0,8 meter över normal högvattenyta"). buoySinkerFactor 3 is Top
 *    Marine's "3–5 × veneen paino" (topmarinelaiturit.fi, read 2026-11-15), the owner's first
 *    choice (D36), now an alternative.
 *  - Assumptions without a source: depth and water levels (site data), pontoonFreeboard,
 *    lineSpacing, slidingSafetyFactor, friction for clay and rock.
 */
export const DEFAULT_ANCHORING: AnchoringParams = {
  depth: 4,
  highWater: 1.5,
  lowWater: 0.9,
  normalHighWater: null,
  normalLowWater: null,
  quayLevel: null,
  seabed: 'clay',
  windSpeed: 22,
  airDensity: 1.25,
  dragCoefficient: 1.6,
  leewardFactor: 0.2,
  profileHeightRatio: 0.15,
  pontoonFreeboard: 0.5,
  lineSpacing: 12,
  waveLoad: 2,
  waveLoadMinHs: 0.3,
  waveLoadFullHs: 0.6,
  splayAngle: 45,
  chainSafetyFactor: 3,
  corrosionAllowance: 0,
  slidingSafetyFactor: 1.5,
  friction: { sand: 0.6, clay: 0.3, rock: 0.5 },
  chainLengthFactor: 4,
  maxAnchorMass: 3000,
  maxAnchorsPerLine: 1,
  capacitySafetyFactor: 1,
  tipAnchorMinLength: 10,
  fingerPileMinLength: 12,
  anchorType: 'block',
  buoySinkerMethod: 'table',
  buoyTable: 'batunionen',
  buoyExposed: false,
  buoySinkerFactor: 3,
  buoyChainFactor: 1.41,
  buoyLift: 0.8,
  waterDensity: 1000,
  concreteDensity: 2400,
  steelDensity: 7850,
};

/**
 * The method's defaults with the site values and the anchor type of `p` kept (depth, water
 * levels, seabed, design wind), and the stern-buoy sinker method (D36): "Reset factors to
 * defaults" (DECISIONS U19). The stern-buoy table and exposure are kept too (site choices).
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
  windSpeed: p.windSpeed,
  anchorType: p.anchorType,
  buoySinkerMethod: p.buoySinkerMethod,
  buoyTable: p.buoyTable,
  buoyExposed: p.buoyExposed,
});

const G = 9.81;
/**
 * I102: blocks needing more than this many times the wedges' anchor mass under the wave load get
 * the WAVE_LOAD_PLAIN_BLOCKS note (Assumption: twice is where the choice of anchor type matters more
 * than the other uncertain factors).
 */
export const WAVE_BLOCK_RATIO = 2;
/** Largest splay angle accepted, degrees. */
export const MAX_SPLAY_ANGLE = 80;

export interface AnchorLine {
  id: string;
  /** Pier or access pontoon the line holds. */
  holdsId: string;
  /**
   * Which end of the pier the anchor lies towards: 'head' lines hold wind from the sea,
   * 'shore' lines wind from the shore; 'none' for square lines (access pontoons, θ = 0).
   */
  splay: 'head' | 'shore' | 'none';
  /** Which wind direction sizes the line: across or along the pier. */
  governs: 'across' | 'along';
  /**
   * 'seabed': chain to a concrete anchor. 'wall': shore chain from an access pontoon to a
   * fixing in the quay wall at its gangway (D28); no anchor.
   */
  fixing: 'seabed' | 'wall';
  /**
   * 'side': a chain of the stations along a pier or access pontoon; 'tip': one of the two
   * crossed chains at a pier head (D30); 'shore': a shore chain (D28); 'buoy': the chain from
   * a stern buoy to its sinker (D36; `holdsId` is the berth, fix and anchor the buoy).
   */
  role: 'side' | 'tip' | 'shore' | 'buoy';
  /** Where the chain is fixed to the pontoon. */
  fix: Vec2;
  /** Position of the anchor on the seabed, or of the wall fixing (plan view). */
  anchor: Vec2;
  /** Design horizontal load of the line, kN. */
  horizontalKn: number;
  /** Tension at the pontoon at high water, kN. */
  topTensionKn: number;
  /** Chain length to order (before margin), m. */
  chainLength: number;
  chainId: string | null;
  /** Uplift at the anchor at the design load, kN (0 when chain lies on the bottom). */
  upliftKn: number;
  /** Angle of the chain at the anchor above the horizontal, degrees. */
  upliftAngleDeg: number;
  /** How the anchor was sized: 'wedge' only where the wedge tables apply (not on rock); null for wall lines. */
  anchorType: AnchorType | null;
  /** Required mass in air of a concrete block anchor for this line, kg. */
  requiredAnchorKg: number;
  anchorId: string | null;
  /** D62: price-list kind of the chosen anchor; null for wall lines and INFEASIBLE lines. */
  anchorKind: ProductAnchorKind | null;
  /** Number of anchors: at most `maxAnchorsPerLine` (D62); 0 for wall lines and INFEASIBLE lines. */
  anchorCount: number;
  /**
   * D62: 'OK' when an anchor of the price list holds the line within `maxAnchorsPerLine` (wall
   * lines: always, their fixing is not checked); 'INFEASIBLE' when none does: the anchor point is
   * not priced and needs a geotechnical and mooring design.
   */
  status: 'OK' | 'INFEASIBLE';
  /** D62: why the line is INFEASIBLE, e.g. "block: needs 33 922 kg, max product 3 000 kg"; null when OK. */
  infeasibleReason: string | null;
  /** Stern buoys only (D36). */
  buoy?: BuoyDetails;
}

/** What sized a stern buoy (D36, D37). */
export interface BuoyDetails {
  /** Boat weight used, t. */
  boatWeightT: number;
  /** Whether the weight was estimated from the boat length (I79). */
  weightEstimated: boolean;
  /** Buoyancy the float needs at least, kg. */
  floatCapacityKg: number;
  /** Chain size of the selection table, mm. */
  tableChainMm: number;
  /** Sinker mass the friction method of the piers would need for the stern-on wind, kg. */
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

/**
 * I102: the seabed anchors of a plan in one figure: required mass in air of the anchors of piers
 * and access pontoons (stern-buoy sinkers excluded; they do not depend on the anchor type).
 */
export interface AnchorTotals {
  anchorType: AnchorType;
  /** Sum of the required anchor masses, kg. */
  totalKg: number;
  /** Largest required anchor mass of one line, kg. */
  maxKg: number;
  /** Longest chain of those lines, m. */
  longestChainM: number;
}

export function anchorTotals(lines: readonly AnchorLine[], anchorType: AnchorType): AnchorTotals {
  const own = lines.filter((l) => l.fixing === 'seabed' && l.role !== 'buoy');
  return {
    anchorType,
    totalKg: own.reduce((s, l) => s + l.requiredAnchorKg, 0),
    maxKg: own.reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0),
    longestChainM: own.reduce((m, l) => Math.max(m, l.chainLength), 0),
  };
}

/** D62: friction coefficients of the sensitivity table. */
export const SENSITIVITY_FRICTION = [0.2, 0.3, 0.5] as const;

/** D62: the note under the sensitivity table. */
export const SOFT_CLAY_NOTE = 'Gravity block capacity in soft clay is highly uncertain; requires geotechnical data.';

export interface FrictionSensitivityRow {
  /** Friction coefficient of the project's seabed for this row. */
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
  /** Heaviest block of the price list allowed per line, kg (0 = none). */
  heaviestBlockKg: number;
  maxPerLine: number;
  rows: FrictionSensitivityRow[];
}

/**
 * D62: the mass plain concrete blocks would need on the seabed lines of a plan for friction
 * coefficients 0.2 / 0.3 / 0.5 (and the one in use), from each line's H and V. The friction
 * coefficient is the least certain input; in soft clay the holding of a block depends in practice
 * on its embedment and the shear strength of the clay.
 */
export function frictionSensitivity(lines: readonly AnchorLine[], p: AnchoringParams, priceList: PriceList): FrictionSensitivity {
  const own = lines.filter((l) => l.fixing === 'seabed' && l.role !== 'buoy');
  const maxPerLine = Math.min(2, Math.max(1, Math.round(p.maxAnchorsPerLine)));
  const heaviestBlockKg = priceList.products
    .filter(
      (x) =>
        x.category === 'anchor' &&
        (x.anchorKind ?? 'block') === 'block' &&
        x.anchorMassKg !== null &&
        x.anchorMassKg <= p.maxAnchorMass + 1e-9 &&
        unitPriceVat0(x, 0) !== null &&
        (x.seabeds.length === 0 || x.seabeds.includes(p.seabed)),
    )
    .reduce((m, x) => Math.max(m, x.anchorMassKg!), 0);
  const inUse = p.friction[p.seabed];
  const values = [...new Set([...SENSITIVITY_FRICTION, inUse])].sort((a, b) => a - b);
  const rows = values.map((mu) => {
    const q = { ...p, friction: { ...p.friction, [p.seabed]: mu } };
    const masses = own.map((l) => requiredAnchorMass(l.horizontalKn * 1000, l.upliftKn * 1000, q));
    return {
      friction: mu,
      current: Math.abs(mu - inUse) < 1e-9,
      maxKg: masses.reduce((m, x) => Math.max(m, x), 0),
      totalKg: masses.reduce((t, x) => t + x, 0),
      feasible: masses.filter((x) => heaviestBlockKg > 0 && x <= maxPerLine * heaviestBlockKg + 1e-9).length,
    };
  });
  return { seabed: p.seabed, lines: own.length, heaviestBlockKg, maxPerLine, rows };
}

/** D62: seabed anchor lines (stern buoys included) by status. */
export function anchoringStatus(lines: readonly AnchorLine[]): { ok: number; infeasible: number } {
  const seabed = lines.filter((l) => l.fixing === 'seabed');
  const infeasible = seabed.filter((l) => l.status === 'INFEASIBLE').length;
  return { ok: seabed.length - infeasible, infeasible };
}

/** D62: "12 lines OK, 140 lines INFEASIBLE". */
export const anchoringStatusText = (s: { ok: number; infeasible: number }): string => `${s.ok} lines OK, ${s.infeasible} lines INFEASIBLE`;

export interface AnchoringResult {
  lines: AnchorLine[];
  /** End piles of fingers longer than `fingerPileMinLength` (D31); not priced. */
  piles: FingerPile[];
  /** Per pier / access pontoon: design wind loads across (larger side) and along the pier, kN. */
  loads: { id: string; lateralKn: number; axialFromSeaKn: number; axialFromShoreKn: number }[];
  issues: Issue[];
  /**
   * I102: the same plan's anchors with the other anchor type (block ↔ wedge), for comparison;
   * missing on rock (no wedge tables), without seabed anchors, or when not asked for.
   */
  comparison?: { current: AnchorTotals; other: AnchorTotals };
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
  /** D46: module lengths of the piers (`Params.pierModuleLengths`); empty or missing = joints every `lineSpacing`. */
  moduleLengths?: readonly number[];
  /** D49: longest gap a pier's shore gangway spans (`Params.gangwayLength`), m. */
  gangwayReach?: number;
  /**
   * D45: the wave screening: bearings the waves come from (sectors with a fetch) and the sectors
   * whose waves exceed the criteria. Missing = no waves.
   */
  waves?: {
    from: readonly number[];
    exceeding: readonly string[];
    /** I104: 50-year Hm0 of each direction of `from` (same order), m; null or missing = not known. */
    hs50?: readonly (number | null)[];
    /** D63, I121: whether that height was estimated with the design wind (engine/anchorWaves.ts). */
    estimated?: readonly boolean[];
    /** D63, I122: per pontoon and direction, the share behind a breakwater and the Hm0 there. */
    shelter?: Readonly<Record<string, readonly { share: number; breakwaterId: string | null; hs: number | null }[]>>;
  };
  /** I102: also size the anchors with the other anchor type for comparison (default true). */
  compareAnchorTypes?: boolean;
}

/**
 * I104: share of the full wave load for waves of 50-year height `hs` (m): 0 up to `waveLoadMinHs`,
 * 1 from `waveLoadFullHs`, in proportion to Hm0² between; 1 when the height is not known or
 * `waveLoadFullHs` is 0.
 */
export function waveLoadFactor(hs: number | null | undefined, p: Pick<AnchoringParams, 'waveLoadMinHs' | 'waveLoadFullHs'>): number {
  if (hs === null || hs === undefined || !Number.isFinite(hs) || !(p.waveLoadFullHs > 0)) return 1;
  const lo = Math.max(0, Math.min(p.waveLoadMinHs, p.waveLoadFullHs));
  if (hs >= p.waveLoadFullHs - 1e-12) return 1;
  if (hs <= lo + 1e-12) return 0;
  return (hs * hs - lo * lo) / (p.waveLoadFullHs ** 2 - lo * lo);
}

/** Compass bearing of a direction in plan (x east, y north), degrees. */
const bearingOfVec = (v: Vec2): number => ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;

/**
 * D45, I99: which way waves from `fromBearing` load a pontoon whose axis (start → end) has bearing
 * `axisBearing`: 'across' when they travel within 45° of square to it (the wave front within 45° of
 * the axis, AS 3962 4.8.2.4), else along it — 'fromSea' when they travel from the head towards the
 * start (pushing the pier shorewards), 'fromShore' the other way.
 */
export function waveAction(axisBearing: number, fromBearing: number): 'across' | 'fromSea' | 'fromShore' {
  const travel = (fromBearing + 180) % 360;
  const delta = Math.abs((((travel - axisBearing) % 360) + 540) % 360 - 180); // 0–180°
  if (delta > 45 + 1e-9 && delta < 135 - 1e-9) return 'across';
  return delta <= 45 + 1e-9 ? 'fromShore' : 'fromSea';
}

export interface ChainLine {
  /** Horizontal distance from the fixing point to the anchor at the design load, m. */
  span: number;
  /** Tension at the pontoon, N. */
  topTension: number;
  /** Upward pull at the anchor, N. */
  uplift: number;
  /** Whether part of the chain lies on the bottom. */
  touchesBottom: boolean;
}

/**
 * Chain of length L (m) from a fixing point h (m) above the bottom, horizontal load H (N),
 * submerged weight w (N/m). See step 4 of the module comment.
 */
export function chainLine(h: number, L: number, H: number, w: number): ChainLine {
  if (H <= 0) return { span: Math.max(0, L - h), topTension: w * h, uplift: 0, touchesBottom: true };
  const a = H / w;
  const touching = Math.sqrt(h * h + 2 * h * a);
  if (L >= touching) {
    return { span: a * Math.acosh(1 + h / a) + (L - touching), topTension: H + w * h, uplift: 0, touchesBottom: true };
  }
  const span = 2 * a * Math.asinh(Math.sqrt(L * L - h * h) / (2 * a));
  const uplift = H * Math.sinh(Math.atanh(h / L) - span / (2 * a));
  return { span, topTension: Math.hypot(H, uplift + w * L), uplift, touchesBottom: false };
}

/** Chain length for water `h` deep (m). */
export const chainLengthFor = (h: number, p: AnchoringParams): number => Math.max(h + 1, p.chainLengthFactor * h);

/** Submerged weight per metre of a chain of the given mass per metre, N/m. */
const submergedWeight = (kgPerM: number, p: AnchoringParams): number => kgPerM * G * (1 - p.waterDensity / p.steelDensity);

interface ChainChoice extends ChainLine {
  product: Product;
  length: number;
}

/** Angle of the chain at the anchor above the horizontal, degrees. */
export const upliftAngle = (H: number, V: number): number => (H > 0 ? (Math.atan2(Math.max(0, V), H) * 180) / Math.PI : 0);

// ---------------------------------------------------------------------------
// Wedge (Pearl Harbor type) anchors: Sound & Sea Technology, Advanced Anchoring and Mooring
// Study (2009), Appendix A-1, Tables 35 and 36, "Enhanced Pearl Harbor Anchor". Working
// capacities include FS = 1.5. docs/RESEARCH.md §9.5, DECISIONS I59.
// ---------------------------------------------------------------------------

const US_TON_KG = 907.18474;
const KIP_N = 4448.2216;
/** Table 35, soft clay/mud: working horizontal capacity 2.0 kips per US ton in air, every size. */
const WEDGE_CLAY_KIPS_PER_TON = 2.0;
/** Table 36, sand: [in-air weight US tons, working holding kips at 0° up angle, at 6°]. */
const WEDGE_SAND: readonly (readonly [number, number, number])[] = [
  [1, 3.87, 2.65],
  [2, 9.35, 6.3],
  [5, 23.8, 15.8],
  [7.5, 33.3, 22.0],
  [10, 49.5, 32.5],
  [12.5, 59.3, 38.9],
  [15, 77.1, 50.4],
  [20, 102, 66],
  [30, 163, 106],
  [45, 236, 151],
  [60, 331, 211],
];
/** The working capacity of the tables includes this factor of safety. */
const WEDGE_TABLE_FS = 1.5;
/**
 * Largest chain angle at the anchor for which the tables apply, degrees: Table 35 "Keep chain
 * angle less than 5 to 6 degrees" (the lower value is used); Table 36 gives 0° and 6°.
 */
export const WEDGE_ANGLE_LIMIT: Record<'clay' | 'sand', number> = { clay: 5, sand: 6 };

/** Table points (mass in kg, working capacity in N) of a wedge anchor at an up angle. */
function wedgePoints(seabed: 'clay' | 'sand', angleDeg: number): [number, number][] {
  if (seabed === 'clay') return [[US_TON_KG, WEDGE_CLAY_KIPS_PER_TON * KIP_N]];
  const t = Math.min(1, Math.max(0, angleDeg / 6));
  return WEDGE_SAND.map(([tons, at0, at6]) => [tons * US_TON_KG, (at0 + (at6 - at0) * t) * KIP_N]);
}

/**
 * Working horizontal capacity (FS 1.5 included) of a wedge anchor of `massKg` in air, N;
 * null on rock or above the angle limit. Between table rows linear; below the first and
 * above the last row in proportion to the mass of that row.
 */
export function wedgeWorkingCapacity(massKg: number, seabed: Seabed, angleDeg: number): number | null {
  if (seabed === 'rock' || angleDeg > WEDGE_ANGLE_LIMIT[seabed] + 1e-9) return null;
  const pts = wedgePoints(seabed, angleDeg);
  const [m0, c0] = pts[0]!;
  if (massKg <= m0) return (c0 * massKg) / m0;
  for (let i = 1; i < pts.length; i++) {
    const [m1, c1] = pts[i]!;
    const [ma, ca] = pts[i - 1]!;
    if (massKg <= m1) return ca + ((c1 - ca) * (massKg - ma)) / (m1 - ma);
  }
  const [mn, cn] = pts[pts.length - 1]!;
  return (cn * massKg) / mn;
}

/**
 * In-air mass of a wedge anchor that holds H (N) with the anchor safety factor, kg; null on
 * rock or above the angle limit. SF_slide · H ≤ working capacity · 1.5 (the tables' FS).
 */
export function requiredWedgeMass(H: number, angleDeg: number, p: AnchoringParams): number | null {
  if (p.seabed === 'rock' || angleDeg > WEDGE_ANGLE_LIMIT[p.seabed] + 1e-9) return null;
  const needed = (p.slidingSafetyFactor * H) / WEDGE_TABLE_FS;
  const pts = wedgePoints(p.seabed, angleDeg);
  const [m0, c0] = pts[0]!;
  if (needed <= c0) return (needed / c0) * m0;
  for (let i = 1; i < pts.length; i++) {
    const [m1, c1] = pts[i]!;
    const [ma, ca] = pts[i - 1]!;
    if (needed <= c1) return ma + ((m1 - ma) * (needed - ca)) / (c1 - ca);
  }
  const [mn, cn] = pts[pts.length - 1]!;
  return (needed / cn) * mn;
}

/** Whether the anchors of this plan are sized as wedges (not on rock: no table). */
const usesWedge = (p: AnchoringParams): p is AnchoringParams & { seabed: 'clay' | 'sand' } =>
  p.anchorType === 'wedge' && p.seabed !== 'rock';

/**
 * Chain length for a wedge anchor: the rule length, or longer until the angle at the anchor
 * is within the tables' limit (0.1 m steps; at the touching length the angle is 0).
 */
function wedgeChainLength(h: number, H: number, w: number, base: number, limitDeg: number): number {
  const angleAt = (L: number) => {
    const line = chainLine(h, L, H, w);
    return upliftAngle(H, line.uplift);
  };
  if (angleAt(base) <= limitDeg) return base;
  let lo = base;
  let hi = Math.sqrt(h * h + (2 * h * H) / w);
  for (let i = 0; i < 60 && hi - lo > 0.01; i++) {
    const mid = (lo + hi) / 2;
    if (angleAt(mid) <= limitDeg) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 10 - 1e-9) / 10;
}

/**
 * The cheapest chain of the list that holds `H` (N) in water `h` deep (m), or null. With wedge
 * anchors each chain is made long enough for the wedge tables' angle limit. `fixed` gives a
 * set length (no wedge sizing) and a smallest diameter, for stern buoys (D36).
 */
export function chooseChain(
  H: number,
  h: number,
  p: AnchoringParams,
  list: PriceList,
  vatPct: number,
  fixed?: { length: number; minDiameterMm: number },
): ChainChoice | null {
  let best: { choice: ChainChoice; cost: number } | null = null;
  for (const product of list.products) {
    if (product.category !== 'chain' || product.breakingLoadKn === null || product.massKgPerM === null) continue;
    const price = unitPriceVat0(product, vatPct);
    const d = product.chainDiameterMm;
    if (price === null || d === null || d <= p.corrosionAllowance) continue;
    if (fixed && d < fixed.minDiameterMm - 1e-9) continue;
    const w = submergedWeight(product.massKgPerM, p);
    const length = fixed
      ? fixed.length
      : usesWedge(p)
        ? wedgeChainLength(h, H, w, chainLengthFor(h, p), WEDGE_ANGLE_LIMIT[p.seabed])
        : chainLengthFor(h, p);
    const line = chainLine(h, length, H, w);
    const remaining = ((d - p.corrosionAllowance) / d) ** 2;
    if (product.breakingLoadKn * 1000 * remaining < p.chainSafetyFactor * line.topTension) continue;
    const cost = price * length;
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && d < (best.choice.product.chainDiameterMm ?? Infinity))) {
      best = { choice: { ...line, product, length }, cost };
    }
  }
  return best?.choice ?? null;
}

/** Required anchor mass in air for horizontal load H and uplift V (N), kg. */
export function requiredAnchorMass(H: number, V: number, p: AnchoringParams): number {
  const submerged = p.slidingSafetyFactor * (H / p.friction[p.seabed] + Math.max(0, V));
  return submerged / (G * (1 - p.waterDensity / p.concreteDensity));
}

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

/** A straight floating pontoon to be held: a main pier or an access pontoon. */
interface Held {
  id: string;
  start: Vec2;
  end: Vec2;
  width: number;
  /** Lateral wind load (larger of the two sides), N. */
  lateral: number;
  /** Wind load along the axis from the sea (towards the shore) and from the shore, N. */
  axialFromSea: number;
  axialFromShore: number;
  /** Main piers are splayed; access pontoons keep square lines (load along them: the wall). */
  splayed: boolean;
  /**
   * Access pontoon in front of the shore: the side facing it. Its lines are only those
   * anchored on the water side; shore chains and attached piers hold it off the wall (D28).
   */
  wallSide?: 'left' | 'right';
  /**
   * D58: a floating breakwater: no shore end (outward chains at both ends, no shore chains) and
   * joints from its own product's modules.
   */
  free?: { joints: readonly number[] };
}

/** Where an access pontoon is held off the wall: its gangway or a pier attached to it. */
interface Restraint {
  /** 'gangway' or the id of the attached pier. */
  id: string;
  /** Position along the access pontoon's axis, m. */
  t: number;
}

/**
 * Tributary length of each restraint along a pontoon `length` m long: from half-way to the
 * previous one to half-way to the next (the ends of the pontoon at the ends), m. Same order
 * as `points`.
 */
export function tributaryLengths(points: readonly number[], length: number): number[] {
  const order = points.map((t, i) => ({ t: Math.min(length, Math.max(0, t)), i })).sort((a, b) => a.t - b.t || a.i - b.i);
  const result = new Array<number>(points.length).fill(0);
  order.forEach((o, k) => {
    const lo = k === 0 ? 0 : (order[k - 1]!.t + o.t) / 2;
    const hi = k === order.length - 1 ? length : (o.t + order[k + 1]!.t) / 2;
    result[o.i] = hi - lo;
  });
  return result;
}

/**
 * A shore chain (D28): from the access pontoon to a fixing in the wall at the design water
 * level, `plan` m apart in plan. Its length leaves slack for the water-level range
 * (`plan` + high water + low water, assumption). Under load it straightens; at the extreme
 * water level the slope gives the tension T = H · L / √(L² − Δz²), Δz = the larger of high
 * and low water. The cheapest chain of the list with MBL · ((d − c)/d)² ≥ SF · T.
 */
export function chooseShoreChain(H: number, plan: number, p: AnchoringParams, list: PriceList, vatPct: number): { product: Product | null; length: number; tension: number } {
  const length = plan + p.highWater + p.lowWater;
  const dz = Math.max(p.highWater, p.lowWater);
  const tension = length > dz ? (H * length) / Math.sqrt(length * length - dz * dz) : H;
  let best: { product: Product; cost: number } | null = null;
  for (const product of list.products) {
    if (product.category !== 'chain' || product.breakingLoadKn === null) continue;
    const price = unitPriceVat0(product, vatPct);
    const d = product.chainDiameterMm;
    if (price === null || d === null || d <= p.corrosionAllowance) continue;
    if (product.breakingLoadKn * 1000 * ((d - p.corrosionAllowance) / d) ** 2 < p.chainSafetyFactor * tension) continue;
    const cost = price * length;
    if (!best || cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && d < (best.product.chainDiameterMm ?? Infinity))) best = { product, cost };
  }
  return { product: best?.product ?? null, length, tension };
}

/**
 * Wind loads on a main pier and its boats, N (UFC 4-152-07 C1 §6-3.4.1.4 and Fig. 6-5).
 * The boats lie square to the pier: wind across the pier meets them bow-on (beam ×
 * profile height), wind along the pier broadside (length × profile height). Along the pier,
 * per row the first boat from the windward end takes the full load and the others the
 * leeward factor; computed for wind from the sea (first boat at the head) and from the shore.
 */
function pierLoads(pier: MainPier, layout: AnchoringInput['layout'], classes: BoatClass[], p: AnchoringParams, freeboard: number) {
  const q = 0.5 * p.airDensity * p.windSpeed ** 2;
  const byId = new Map(classes.map((c) => [c.id, c]));
  const { length, along } = pierAxis(pier);
  /** Per side: bow areas and sum of beams (the pier face they hide). */
  const bow = { left: 0, right: 0 };
  const beams = { left: 0, right: 0 };
  const endArea = pier.width * freeboard;
  let fromSea = endArea;
  let fromShore = endArea;
  for (const side of ['left', 'right'] as const) {
    const boats = layout.berths
      .filter((b) => b.pierId === pier.id && b.side === side && !b.removed)
      .map((b) => ({ b, c: byId.get(b.boatClassId) }))
      .filter((x): x is { b: (typeof x)['b']; c: BoatClass } => x.c !== undefined)
      .map(({ b, c }) => ({ c, s: (b.slot[0]!.x - pier.start.x) * along.x + (b.slot[0]!.y - pier.start.y) * along.y }))
      // Ordered from the head towards the shore (ties by class id, for determinism).
      .sort((x, y) => y.s - x.s || (x.c.id < y.c.id ? -1 : x.c.id > y.c.id ? 1 : 0));
    const broadside = boats.map(({ c }) => c.length * p.profileHeightRatio * c.length);
    boats.forEach(({ c }) => {
      bow[side] += c.beam * p.profileHeightRatio * c.length;
      beams[side] += c.beam;
    });
    broadside.forEach((a, i) => {
      fromSea += (i === 0 ? 1 : p.leewardFactor) * a;
      fromShore += (i === broadside.length - 1 ? 1 : p.leewardFactor) * a;
    });
  }
  const across = (windward: 'left' | 'right', leeward: 'left' | 'right') =>
    bow[windward] + p.leewardFactor * bow[leeward] + Math.max(0, length - beams[windward]) * freeboard;
  const lateralArea = Math.max(across('left', 'right'), across('right', 'left'));
  const k = q * p.dragCoefficient;
  return { lateral: k * lateralArea, axialFromSea: k * fromSea, axialFromShore: k * fromShore };
}

/** Anchoring plan of a layout. Deterministic; positions in plan view. */
export function anchoringPlan(input: AnchoringInput): AnchoringResult {
  const { layout, site, classes, params: p, priceList, vatPct } = input;
  const moduleLengths = input.moduleLengths ?? [];
  const reach = input.gangwayReach ?? DEFAULT_GANGWAY_LENGTH;
  const freeboard = input.pierFreeboard ?? p.pontoonFreeboard;
  const q = 0.5 * p.airDensity * p.windSpeed ** 2;
  const issues: Issue[] = [];
  const warn = (code: string, message: string, elementId?: string) =>
    issues.push({ severity: 'warning', code, message, ...(elementId ? { elementId } : {}) });

  const k = q * p.dragCoefficient;
  const hHigh = p.depth + p.highWater;
  const theta = (Math.min(MAX_SPLAY_ANGLE, Math.max(0, p.splayAngle)) * Math.PI) / 180;
  const lines: AnchorLine[] = [];
  const loads: AnchoringResult['loads'] = [];
  const unheld: string[] = [];
  // D62: the anchor of each line, at most `maxAnchorsPerLine` pieces.
  const install = installParams(priceList);
  const maxPerLine = Math.min(2, Math.max(1, Math.round(p.maxAnchorsPerLine)));
  const lineAnchor = (H: number, V: number, mass: number, blocksOnly: boolean, wedge: boolean) =>
    chooseLineAnchor(
      { H, V, blockMassKg: mass },
      {
        seabed: p.seabed,
        maxPerLine,
        maxBlockMassKg: p.maxAnchorMass,
        capacitySafetyFactor: p.capacitySafetyFactor,
        blocksOnly,
        blockLabel: wedge ? 'block (wedge sizing)' : 'block',
      },
      priceList,
      vatPct,
      install,
    );
  /** The anchor fields of a line from the choice. */
  const anchorFields = (choice: ReturnType<typeof lineAnchor>): Pick<AnchorLine, 'anchorId' | 'anchorKind' | 'anchorCount' | 'status' | 'infeasibleReason'> =>
    choice.pick
      ? { anchorId: choice.pick.product.id, anchorKind: choice.pick.kind, anchorCount: choice.pick.count, status: 'OK', infeasibleReason: null }
      : { anchorId: null, anchorKind: null, anchorCount: 0, status: 'INFEASIBLE', infeasibleReason: choice.reason };
  /** Wall lines (shore chains) have no seabed anchor. */
  const WALL_ANCHOR = { anchorId: null, anchorKind: null, anchorCount: 0, status: 'OK', infeasibleReason: null } as const;

  const piers: Held[] = layout.piers.map((pier) => ({
    id: pier.id,
    start: pier.start,
    end: pier.end,
    width: pier.width,
    splayed: true,
    ...pierLoads(pier, layout, classes, p, freeboard),
  }));
  // D45, I99: the AS 3962 minimum wave load from the directions that have open water: across the
  // pier on its whole length, along it on its end; added to the wind of the same direction.
  // D57, I104: each direction's load in proportion to its waves (waveLoadFactor).
  const waveFrom = (input.waves?.from ?? []).map((bearing, i) => {
    const hs = input.waves?.hs50?.[i] ?? null;
    return { bearing, hs, q: Math.max(0, p.waveLoad) * 1000 * waveLoadFactor(hs, p) };
  });
  const smallWaves = waveFrom.filter((w) => w.q <= 0 && w.hs !== null);
  const waveNotes: string[] = [];
  /** D63, I122: the part of a pontoon behind a breakwater takes the load of the transmitted wave. */
  const shelterNotes: string[] = [];
  const sectorName = (bearing: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(bearing / 45) % 8]!;
  const addWaves = (item: Held) => {
    const dirs = waveFrom.map((w, i) => {
      const s = item.free ? undefined : input.waves?.shelter?.[item.id]?.[i];
      if (!s || !(s.share > 0) || w.q <= 0) return w;
      const pct = `${Math.round(s.share * 100)} %`;
      if (s.hs === null) {
        shelterNotes.push(`${item.id} from ${sectorName(w.bearing)}: ${pct} behind ${s.breakwaterId} but the wave is beyond its brochure curve, so taken as unsheltered`);
        return w;
      }
      const behind = Math.max(0, p.waveLoad) * 1000 * waveLoadFactor(s.hs, p);
      shelterNotes.push(`${item.id} from ${sectorName(w.bearing)}: ${pct} behind ${s.breakwaterId} (Hm0 ${w.hs?.toFixed(2) ?? '?'} → ${s.hs.toFixed(2)} m)`);
      return { ...w, q: (1 - s.share) * w.q + s.share * behind };
    });
    const loading = dirs.filter((w) => w.q > 0);
    if (loading.length === 0) return;
    const { length, along } = pierAxis({ id: item.id, start: item.start, end: item.end, width: item.width, locked: false, origin: 'manual' });
    if (!(length > 0)) return;
    // The largest load of each kind (the directions do not act at the same time).
    const q = { across: 0, fromSea: 0, fromShore: 0 };
    for (const w of loading) {
      const a = waveAction(bearingOfVec(along), w.bearing);
      q[a] = Math.max(q[a], w.q);
    }
    const kn = (x: number) => `${(x / 1000).toFixed(1)}`;
    const parts: string[] = [];
    if (q.across > 0) {
      item.lateral += q.across * length;
      parts.push(`across ${kn(q.across * length)} kN (${kn(q.across)} kN/m)`);
    }
    if (q.fromSea > 0) {
      item.axialFromSea += q.fromSea * item.width;
      parts.push(`from the sea ${kn(q.fromSea * item.width)} kN`);
    }
    if (q.fromShore > 0) {
      item.axialFromShore += q.fromShore * item.width;
      parts.push(`from the shore ${kn(q.fromShore * item.width)} kN`);
    }
    if (parts.length > 0) waveNotes.push(`${item.id} ${parts.join(', ')}`);
  };
  piers.forEach(addWaves);

  // Access pontoons (D28). In front of the shore, chains only on the water side; the wind
  // pushing the pontoon off the wall is shared by tributary length between the shore chains
  // at its gangway (assumed at its middle) and the piers attached to its water-side edge,
  // whose lines splayed towards the shore take their share. The wind along the wall (the
  // pontoon's end) goes to the shore chains.
  const accessItems: Held[] = [];
  const shoreSets: { item: Held; at: number; plan: number; offshore: number; alongWall: number }[] = [];
  for (const a of accessPontoonsOf(site)) {
    const { length, along, left } = pierAxis({ id: a.id, start: a.start, end: a.end, width: a.width, locked: false, origin: 'manual' });
    const across = k * length * freeboard;
    const item: Held = { id: a.id, start: a.start, end: a.end, width: a.width, lateral: across, axialFromSea: 0, axialFromShore: 0, splayed: false };
    addWaves(item);
    accessItems.push(item);
    if (site.shoreline.length < 2) continue;
    const mid = add(a.start, scale(along, length / 2));
    const toLeft = distancePointToPolyline(add(mid, scale(left, a.width / 2)), site.shoreline);
    const toRight = distancePointToPolyline(add(mid, scale(left, -a.width / 2)), site.shoreline);
    item.wallSide = toLeft <= toRight ? 'left' : 'right';
    const waterSign = item.wallSide === 'left' ? -1 : 1;
    const edge = [add(a.start, scale(left, (waterSign * a.width) / 2)), add(a.end, scale(left, (waterSign * a.width) / 2))];
    // Gangways (D32): where the user put them, else one at the middle.
    const gangways = gangwayPositions(a);
    const placed = (a.gangways ?? []).length > 0;
    const restraints: Restraint[] = gangways.map((t, i) => ({ id: `gangway-${i + 1}`, t }));
    for (const pier of piers) {
      const t = dot(sub(pier.start, a.start), along);
      if (t >= -SHORE_TOLERANCE && t <= length + SHORE_TOLERANCE && distancePointToPolyline(pier.start, edge) <= SHORE_TOLERANCE) {
        restraints.push({ id: pier.id, t });
      }
    }
    const shares = tributaryLengths(
      restraints.map((r) => r.t),
      length,
    ).map((l) => (across * l) / length);
    restraints.forEach((r, i) => {
      const pier = piers.find((x) => x.id === r.id);
      if (pier) pier.axialFromShore += shares[i]!;
    });
    gangways.forEach((t, i) => {
      // Gap from the wall-side edge at the gangway to the shoreline.
      const gap = distancePointToPolyline(add(add(a.start, scale(along, t)), scale(left, (-waterSign * a.width) / 2)), site.shoreline);
      // The wind along the wall (the pontoon's end) is shared equally by the gangways (I73).
      shoreSets.push({ item, at: t, plan: gap / Math.cos(theta), offshore: shares[i]!, alongWall: (k * a.width * freeboard) / gangways.length });
    });
    const where = placed
      ? `2 shore chains at each of its ${gangways.length === 1 ? 'gangway' : `${gangways.length} gangways`} (at ${gangways.map((t) => `${t.toFixed(1)} m`).join(', ')} from its first point)`
      : '2 shore chains at its gangway (assumed at its middle)';
    const label = (r: Restraint) => (!r.id.startsWith('gangway-') ? r.id : placed ? `shore chains at ${r.t.toFixed(1)} m` : 'shore chains');
    warn(
      'ACCESS_PONTOON_SHORE_CHAINS',
      `Access pontoon ${a.id}: chains on the water side only. Off the wall it is held by ${where} and by the piers attached to it, each for the wind on its share of the pontoon's length: ${restraints
        .map((r, i) => ({ r, share: shares[i]! }))
        .sort((x, y) => x.r.t - y.r.t)
        .map(({ r, share }) => `${label(r)} ${(share / 1000).toFixed(1)} kN`)
        .join(', ')}. The fixings in the wall and the joints between the pontoons are not checked.`,
      a.id,
    );
  }
  // D58, I106: floating breakwaters: wind on their freeboard and the wave load of I104, chains at
  // their module joints in the X pattern and outward pairs at both ends.
  const breakwaterItems: Held[] = breakwatersOf(site).map((b) => {
    const product = breakwaterProductOf(b);
    const length = distance(b.start, b.end);
    const item: Held = {
      id: b.id,
      start: b.start,
      end: b.end,
      width: product.width,
      lateral: k * length * product.freeboard,
      axialFromSea: k * product.width * product.freeboard,
      axialFromShore: k * product.width * product.freeboard,
      splayed: true,
      free: { joints: breakwaterJoints(length, product) },
    };
    addWaves(item);
    return item;
  });
  if (breakwaterItems.length > 0) {
    warn(
      'BREAKWATER_ANCHORING',
      `Breakwaters ${breakwaterItems.map((b) => b.id).join(', ')}: anchored like piers from their module joints, for the wind on their freeboard and the wave load above. A breakwater reflects and dissipates waves, so its real wave loads can be well above this; its length, layout and mooring need the supplier's design (AS 3962-2001 5.1.1).`,
    );
  }
  const held: Held[] = [...piers, ...accessItems, ...breakwaterItems];

  /** A chain to a concrete anchor `span` from `fix` along `direction` (at least `minSpan`). */
  const seabedLine = (l: {
    id: string;
    holdsId: string;
    role: AnchorLine['role'];
    splay: AnchorLine['splay'];
    governs: AnchorLine['governs'];
    fix: Vec2;
    direction: Vec2;
    H: number;
    minSpan: number;
  }) => {
    const { H } = l;
    const chain = chooseChain(H, hHigh, p, priceList, vatPct);
    // Without a chain the uplift is not known; it is left out and the line is flagged.
    const uplift = chain?.uplift ?? 0;
    const upAngle = upliftAngle(H, uplift);
    const wedgeMass = usesWedge(p) && chain ? requiredWedgeMass(H, upAngle, p) : null;
    const mass = wedgeMass ?? requiredAnchorMass(H, uplift, p);
    const choice = lineAnchor(H, uplift, mass, false, wedgeMass !== null);
    const length = chain?.length ?? chainLengthFor(hHigh, p);
    const span = chain ? chain.span : Math.sqrt(length * length - hHigh * hHigh);
    lines.push({
      id: l.id,
      holdsId: l.holdsId,
      splay: l.splay,
      governs: l.governs,
      fixing: 'seabed',
      role: l.role,
      fix: l.fix,
      // A crossed chain passes under the pontoon: the anchor is `span` from the fixing
      // point, on the far side.
      anchor: add(l.fix, scale(l.direction, Math.max(span, l.minSpan))),
      horizontalKn: H / 1000,
      topTensionKn: (chain?.topTension ?? H) / 1000,
      upliftKn: uplift / 1000,
      upliftAngleDeg: upAngle,
      anchorType: wedgeMass === null ? 'block' : 'wedge',
      chainLength: length,
      chainId: chain?.product.id ?? null,
      requiredAnchorKg: mass,
      ...anchorFields(choice),
    });
    if (!chain) warn('NO_CHAIN_STRONG_ENOUGH', `No chain in the price list holds ${(H / 1000).toFixed(1)} kN with the safety factor; line ${l.id} has no chain.`, l.holdsId);
  };

  for (const item of held) {
    const { length, along: pierAlong, left } = pierAxis({ ...item, locked: false, origin: 'manual' });
    const along = pierAlong;
    if (!(length > 0)) continue;
    loads.push({ id: item.id, lateralKn: item.lateral / 1000, axialFromSeaKn: item.axialFromSea / 1000, axialFromShoreKn: item.axialFromShore / 1000 });
    const minSpan = (angle: number) => (item.width + 1) / Math.cos(angle);
    const at = (t: number, lateral: number) => add(add(item.start, scale(pierAlong, t)), scale(left, lateral));
    if (item.splayed) {
      // D46: chains from every module joint (and the ends), as in the owner's reference drawing:
      // at a joint, on each side one chain splayed towards the head and one towards the shore, so
      // that the chains of neighbouring joints cross; at the shore end only towards the head (the
      // shore lies behind it); at the head the tip pair (D30), outwards. Each chain is fixed on one
      // edge and anchored beyond the other (crossed under the pier).
      const angle = theta;
      const joints = item.free ? [...item.free.joints] : moduleLengths.length > 0 ? jointPositions(length, moduleLengths) : evenJoints(length, p.lineSpacing);
      interface Spec {
        t: number;
        splay: 'head' | 'shore';
        anchoredOn: 'left' | 'right';
        role: 'side' | 'tip';
      }
      const specs: Spec[] = [];
      const both = (t: number, splay: Spec['splay'], role: Spec['role']) => specs.push({ t, splay, anchoredOn: 'right', role }, { t, splay, anchoredOn: 'left', role });
      both(Math.min(STATION_INSET, length / 2), 'head', 'side');
      // D58: a breakwater has no shore behind its first end: an outward pair there too.
      if (item.free) both(0, 'shore', 'tip');
      // Square chains (θ = 0) would double up at a joint: one per side there.
      for (const j of joints) {
        both(j, 'head', 'side');
        if (angle > 0) both(j, 'shore', 'side');
      }
      const tip = item.free !== undefined || length >= p.tipAnchorMinLength - 1e-9;
      if (tip) both(length, 'head', 'tip');
      const perSide = specs.filter((x) => x.anchoredOn === 'right').length;
      // D49: a pier reached by a gangway from the shore has two shore chains under it, crossed at
      // θ from the pier's axis; they hold the pier against wind from the shore with the shore-ward
      // seabed chains (each line the same share of the force along the pier, I97).
      const link = item.free ? null : pierShoreLink(item, site, reach);
      const shoreChains = link?.kind === 'gangway' ? 2 : 0;
      const count = { head: specs.filter((x) => x.splay === 'head').length, shore: specs.filter((x) => x.splay === 'shore').length + shoreChains };
      // Across: the lines anchored on the windward side share the load. Along: the lines splayed
      // against the wind share it (wind from the sea pushes the pier shorewards: 'head' lines hold).
      const acrossH = item.lateral / perSide / Math.cos(angle);
      const alongShare = (splay: Spec['splay']): number => {
        const force = splay === 'head' ? item.axialFromSea : item.axialFromShore;
        return force > 0 && count[splay] > 0 ? force / count[splay] : 0;
      };
      const alongH = (splay: Spec['splay']): number => (angle > 0 ? alongShare(splay) / Math.sin(angle) : 0);
      if (
        Math.max(item.axialFromSea, item.axialFromShore) > 0 &&
        ((angle === 0 && !(shoreChains > 0 && item.axialFromSea === 0)) || (item.axialFromSea > 0 && count.head === 0) || (item.axialFromShore > 0 && count.shore === 0))
      ) {
        unheld.push(item.id);
      }
      if (link?.kind === 'gangway') {
        // From the pier's shore-end corners to the wall, each crossing to the other side under the
        // gangway: plan length gap / cos θ, at least 0.5 m (a pier touching the shore).
        const plan = Math.max(link.gap, 0.5) / Math.cos(angle);
        const H = alongShare('shore') / Math.cos(angle);
        const shore = chooseShoreChain(H, plan, p, priceList, vatPct);
        [1, -1].forEach((sign, i) => {
          const fix = at(0, (sign * item.width) / 2);
          const dir = add(scale(pierAlong, -Math.cos(angle)), scale(left, -sign * Math.sin(angle)));
          const id = `${item.id}-S${i + 1}`;
          lines.push({
            id,
            holdsId: item.id,
            splay: 'none',
            governs: 'along',
            fixing: 'wall',
            role: 'shore',
            fix,
            anchor: add(fix, scale(dir, plan)),
            horizontalKn: H / 1000,
            topTensionKn: shore.tension / 1000,
            upliftKn: 0,
            upliftAngleDeg: 0,
            anchorType: null,
            chainLength: shore.length,
            chainId: shore.product?.id ?? null,
            requiredAnchorKg: 0,
            ...WALL_ANCHOR,
          });
          if (!shore.product) warn('NO_CHAIN_STRONG_ENOUGH', `No chain in the price list holds ${(shore.tension / 1000).toFixed(1)} kN with the safety factor; shore chain ${id} has no chain.`, item.id);
        });
      }
      let n = 0;
      let k = 0;
      for (const x of specs) {
        const along = alongH(x.splay);
        const towards = scale(pierAlong, x.splay === 'shore' ? -Math.sin(angle) : Math.sin(angle));
        const fixSign = x.anchoredOn === 'right' ? 1 : -1;
        seabedLine({
          id: x.role === 'tip' ? `${item.id}-T${++k}` : `${item.id}-A${++n}`,
          holdsId: item.id,
          role: x.role,
          splay: angle === 0 ? 'none' : x.splay,
          governs: along > acrossH ? 'along' : 'across',
          fix: at(x.t, (fixSign * item.width) / 2),
          direction: add(scale(left, -fixSign * Math.cos(angle)), towards),
          H: Math.max(acrossH, along),
          minSpan: minSpan(angle),
        });
      }
    } else {
      // Access pontoons (I64): square lines, one per station on each side, at `lineSpacing`; in
      // front of a wall only the line anchored on the water side (D28).
      const pairs = Math.max(2, Math.ceil(length / p.lineSpacing) + 1);
      const stations = Array.from({ length: pairs }, (_, i) => Math.min(length - STATION_INSET, Math.max(STATION_INSET, (i * length) / (pairs - 1))));
      const acrossH = item.lateral / pairs;
      let n = 0;
      for (const t of stations) {
        const line = (fixSign: 1 | -1) =>
          seabedLine({ id: `${item.id}-A${++n}`, holdsId: item.id, role: 'side', splay: 'none', governs: 'across', fix: at(t, (fixSign * item.width) / 2), direction: scale(left, -fixSign), H: acrossH, minSpan: minSpan(0) });
        if (item.wallSide !== 'right') line(1);
        if (item.wallSide !== 'left') line(-1);
      }
    }

    // Shore chains at the gangway: two, crossed at the splay angle, from the wall-side edge
    // to the wall. Off the wall they share the load (÷ 2 cos θ); along the wall one holds
    // each direction (÷ sin θ).
    shoreSets
      .filter((x) => x.item === item)
      .forEach((set, g) => {
      const wallSign = item.wallSide === 'left' ? 1 : -1;
      const offshoreH = set.offshore / 2 / Math.cos(theta);
      const alongH = theta > 0 ? set.alongWall / Math.sin(theta) : 0;
      if (theta === 0 && set.alongWall > 0 && !unheld.includes(item.id)) unheld.push(item.id);
      const H = Math.max(offshoreH, alongH);
      const shore = chooseShoreChain(H, set.plan, p, priceList, vatPct);
      const half = (set.plan * Math.sin(theta)) / 2;
      for (const sign of [-1, 1]) {
        const fix = at(set.at + sign * half, (wallSign * item.width) / 2);
        const dir = add(scale(left, wallSign * Math.cos(theta)), scale(along, -sign * Math.sin(theta)));
        const id = `${item.id}-S${2 * g + (sign < 0 ? 1 : 2)}`;
        lines.push({
          id,
          holdsId: item.id,
          splay: 'none',
          governs: alongH > offshoreH ? 'along' : 'across',
          fixing: 'wall',
          role: 'shore',
          fix,
          anchor: add(fix, scale(dir, set.plan)),
          horizontalKn: H / 1000,
          topTensionKn: shore.tension / 1000,
          upliftKn: 0,
          upliftAngleDeg: 0,
          anchorType: null,
          chainLength: shore.length,
          chainId: shore.product?.id ?? null,
          requiredAnchorKg: 0,
          ...WALL_ANCHOR,
        });
        if (!shore.product) warn('NO_CHAIN_STRONG_ENOUGH', `No chain in the price list holds ${(shore.tension / 1000).toFixed(1)} kN with the safety factor; shore chain ${id} has no chain.`, item.id);
      }
      });
  }

  // D36, D37: stern buoys. One line per berth from the buoy straight down to its sinker.
  const classById = new Map(classes.map((c) => [c.id, c]));
  const table = buoyTable(p.buoyTable, p);
  const tableName = p.buoyTable === 'topMarine' ? 'Top Marine’s table' : 'Båtunionen’s table (Hamnhandboken 2016)';
  const buoyLines: AnchorLine[] = [];
  const estimated = new Map<string, number>();
  let beyondTable = 0;
  const farClasses = new Set<string>();
  for (const b of layout.berths) {
    const c = classById.get(b.boatClassId);
    if (!b.buoy || b.removed || !c) continue;
    const weightEstimated = !(c.weight !== undefined && c.weight > 0);
    const weight = weightEstimated ? estimateBoatWeight(c.length) : c.weight!;
    if (weightEstimated) estimated.set(c.id, weight);
    const { row, beyond } = buoyTableRow(table, weight, p.buoyExposed);
    if (beyond) beyondTable++;
    // Båtunionen §2.32: the boat–buoy distance should not exceed 1.4 × the boat length.
    if (input.buoyDepthFactor !== undefined && input.buoyDepthFactor * p.depth > 1.4 * c.length + 1e-9) farClasses.add(c.name);
    // The buoy holds the boat against wind from the sea, which meets it stern-on (full load).
    const H = k * c.beam * p.profileHeightRatio * c.length;
    const length = buoyChainLength(p.depth, hHigh, p);
    const chain = chooseChain(H, hHigh, p, priceList, vatPct, { length, minDiameterMm: row.chainMm });
    const uplift = chain?.uplift ?? 0;
    const mass = p.buoySinkerMethod === 'table' ? row.sinkerKg : p.buoySinkerFactor * weight * 1000;
    // D62: sinkers are concrete blocks sized by mass (the table), one per buoy unless tandem.
    const choice = lineAnchor(H, uplift, mass, true, false);
    const chainMass = chain ? chain.product.massKgPerM! * length * (1 - p.waterDensity / p.steelDensity) : 0;
    const line: AnchorLine = {
      id: `${b.id}-B`,
      holdsId: b.id,
      splay: 'none',
      governs: 'across',
      fixing: 'seabed',
      role: 'buoy',
      fix: b.buoy,
      anchor: b.buoy,
      horizontalKn: H / 1000,
      topTensionKn: (chain?.topTension ?? H) / 1000,
      chainLength: length,
      chainId: chain?.product.id ?? null,
      upliftKn: uplift / 1000,
      upliftAngleDeg: upliftAngle(H, uplift),
      anchorType: 'block',
      requiredAnchorKg: mass,
      ...anchorFields(choice),
      buoy: {
        boatWeightT: weight,
        weightEstimated,
        // Båtunionen: the buoy "skall gott och väl bära kättingtyngden".
        floatCapacityKg: Math.max(row.floatCapacityKg, chainMass),
        tableChainMm: row.chainMm,
        windAnchorKg: requiredAnchorMass(H, uplift, p),
      },
    };
    buoyLines.push(line);
    if (!chain) {
      warn('NO_CHAIN_STRONG_ENOUGH', `No chain of at least ${row.chainMm} mm in the price list holds ${(H / 1000).toFixed(1)} kN with the safety factor; stern buoy ${line.id} has no chain.`, b.id);
    }
  }
  lines.push(...buoyLines);
  if (buoyLines.length > 0) {
    const heaviest = buoyLines.reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0);
    const sinker =
      p.buoySinkerMethod === 'table'
        ? `the sinker of ${tableName}${p.buoyTable === 'batunionen' ? ' (its weight in water as concrete in air)' : ''}`
        : `${p.buoySinkerFactor.toFixed(1)} × the boat’s weight (Top Marine’s rule of thumb, 3–5 × in sheltered waters; no other source found supports it)`;
    warn(
      'STERN_BUOYS',
      `${buoyLines.length} stern buoys, each on its own sinker: ${sinker}${p.buoyExposed ? ', one row up for an exposed harbour' : ''}, heaviest ${Math.round(heaviest)} kg. Chain ${buoyLines[0]!.chainLength.toFixed(1)} m = the larger of ${p.buoyChainFactor.toFixed(2)} × the design depth and the depth at high water + ${p.buoyLift.toFixed(1)} m, at least the size of ${tableName} and strong enough for the boat’s stern-on wind; float of at least the table’s buoyancy and the chain’s weight in water. The wind on the boats broadside is left to the piers.`,
    );
    const light = buoyLines.filter((l) => l.buoy!.windAnchorKg > l.requiredAnchorKg + 1e-6);
    if (light.length > 0) {
      const worst = light.reduce((a, l) => (l.buoy!.windAnchorKg - l.requiredAnchorKg > a.buoy!.windAnchorKg - a.requiredAnchorKg ? l : a));
      warn(
        'BUOY_SINKER_BELOW_WIND_METHOD',
        `${light.length} stern-buoy sinkers are lighter than the friction method of the pier anchors needs for the boat’s stern-on wind (e.g. ${worst.id}: ${Math.round(worst.requiredAnchorKg)} kg, the method gives ${Math.round(worst.buoy!.windAnchorKg)} kg). That method counts friction only; a sinker embedded in the seabed holds much more (OCEL 2014: a 2 t block in soft silt about 34.5 kN against 2.3 kN by friction).`,
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
    // Båtunionen, Hamnhandboken 2016, §2.31–2.32.
    if (p.depth > 5 + 1e-9) {
      warn('BUOY_DEEP_WATER', `Design depth ${p.depth.toFixed(1)} m: mooring between pier and buoy "bör undvikas om vattendjupet är större än 5-6 meter" (Båtunionen): the long buoy chains let the boats swing sideways; at larger depths each buoy is anchored to two sinkers.`);
    }
    // D50: the normal range when a gauge gave it, else the extremes.
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

  // D31: fingers longer than `fingerPileMinLength` are moored with an end pile (Marinetek).
  // The finger carries the full broadside wind of the boats beside it (UFC 4-152-07 C1
  // §6-3.4.1.4: individual fingers take the full load, no shielding); as a beam held at the
  // pier and at the pile, the pile takes half (assumption).
  const piles: FingerPile[] = [];
  for (const finger of layout.fingers ?? []) {
    const pier = layout.piers.find((x) => x.id === finger.pierId);
    if (!pier || finger.shape.length < 3) continue;
    const { along, left } = pierAxis(pier);
    const local = finger.shape.map((v) => ({ s: dot(sub(v, pier.start), along), d: dot(sub(v, pier.start), left) }));
    const sign = local.reduce((a, v) => a + v.d, 0) >= 0 ? 1 : -1;
    const side: 'left' | 'right' = sign > 0 ? 'left' : 'right';
    const s0 = Math.min(...local.map((v) => v.s));
    const s1 = Math.max(...local.map((v) => v.s));
    const dIn = Math.min(...local.map((v) => sign * v.d));
    const dOut = Math.max(...local.map((v) => sign * v.d));
    if (dOut - dIn <= p.fingerPileMinLength + 1e-9) continue;
    const byId = new Map(classes.map((c) => [c.id, c]));
    let area = 0;
    for (const b of layout.berths) {
      if (b.pierId !== pier.id || b.side !== side || b.removed) continue;
      const c = byId.get(b.boatClassId);
      if (!c) continue;
      const bs = b.slot.map((v) => dot(sub(v, pier.start), along));
      if (Math.abs(Math.max(...bs) - s0) < 0.05 || Math.abs(Math.min(...bs) - s1) < 0.05) area += c.length * p.profileHeightRatio * c.length;
    }
    const F = k * area;
    loads.push({ id: finger.id, lateralKn: F / 1000, axialFromSeaKn: 0, axialFromShoreKn: 0 });
    const loadKn = F / 2 / 1000;
    piles.push({
      id: `${finger.id}-pile`,
      holdsId: finger.id,
      at: add(add(pier.start, scale(along, (s0 + s1) / 2)), scale(left, sign * dOut)),
      loadKn,
      guide: choosePileGuide(loadKn),
    });
  }
  if (piles.length > 0) {
    const max = piles.reduce((m, x) => Math.max(m, x.loadKn), 0);
    warn(
      'FINGER_END_PILES',
      `${piles.length} fingers longer than ${p.fingerPileMinLength.toFixed(1)} m are moored with an end pile at the tip (Marinetek: "Longer than 12 m … Fingers are moored with end piles"), each for half the full broadside wind of the boats beside it (UFC 4-152-07); largest ${max.toFixed(1)} kN${choosePileGuide(max) ? ` → pile guide ${choosePileGuide(max)}` : ''}. Piles and guides are not priced and not designed here.`,
    );
    if (piles.some((x) => x.guide === null)) {
      warn('PILE_LOAD_ABOVE_STANDARD_GUIDES', `${piles.filter((x) => x.guide === null).length} end piles need more than the 70 kN of Marinetek's strongest standard guide (G700).`);
    }
  }

  // D62: lines that no anchor of the price list holds within `maxAnchorsPerLine`, per pontoon (stern
  // buoys together), and lines with two anchors in tandem.
  const heaviestBlock = frictionSensitivity([], p, priceList).heaviestBlockKg;
  const infeasible = new Map<string, { lines: AnchorLine[]; total: number; elementId: string }>();
  for (const l of lines) {
    if (l.fixing !== 'seabed') continue;
    const key = l.role === 'buoy' ? 'stern buoys' : l.holdsId;
    const entry = infeasible.get(key) ?? { lines: [], total: 0, elementId: l.holdsId };
    entry.total++;
    if (l.status === 'INFEASIBLE') entry.lines.push(l);
    infeasible.set(key, entry);
  }
  for (const [what, e] of infeasible) {
    if (e.lines.length === 0) continue;
    const worst = e.lines.reduce((a, l) => (l.requiredAnchorKg > a.requiredAnchorKg ? l : a));
    const ratio = heaviestBlock > 0 ? worst.requiredAnchorKg / (maxPerLine * heaviestBlock) : 0;
    warn(
      'ANCHOR_INFEASIBLE',
      `${what}: ${e.lines.length} of ${e.total} anchor lines INFEASIBLE: no anchor of the price list holds them with at most ${maxPerLine} anchor${maxPerLine > 1 ? 's' : ''} per line (worst ${worst.id}: ${worst.infeasibleReason}). Their anchor points are not priced: type and size by geotechnical and mooring design (e.g. screw anchors, piles, rock bolts or embedded anchors; add products with published capacities to the price list).${
        ratio > 1 ? ` The load per line falls only in proportion to the line spacing: the worst line needs ${ratio.toFixed(1)} × the heaviest block allowed per line, so closer lines are not a fix.` : ''
      }${what !== 'stern buoys' && !usesWedge(p) && p.seabed !== 'rock' ? ' The comparison row shows the same plan with wedge anchors (shaped concrete anchors that dig in).' : ''}`,
      e.elementId,
    );
  }
  const tandem = lines.filter((l) => l.anchorCount > 1);
  if (tandem.length > 0) {
    warn(
      'TANDEM_ANCHORS',
      `${tandem.length} lines have 2 anchors in tandem (maxAnchorsPerLine = 2, the user's choice; ${tandem
        .slice(0, 5)
        .map((l) => l.id)
        .join(', ')}${tandem.length > 5 ? ', …' : ''}). Two anchors on one line do not necessarily hold as much as one anchor of the same total mass (Chalmers 2026); the arrangement needs the mooring designer's approval.`,
    );
  }

  if (unheld.length > 0) {
    warn(
      'ALONG_PIER_LOAD_NOT_HELD',
      `The wind along ${unheld.join(', ')} is not held by any chain (splay angle 0° or too few chain pairs); it needs other restraint.`,
    );
  }

  // Anchors must lie in the water area (and not under an obstacle).
  if (site.water.length >= 3) {
    const outside = lines.filter(
      (l) => l.fixing === 'seabed' && (!pointInRing(l.anchor, site.water) || site.obstacles.some((o) => pointInRing(l.anchor, o.shape))),
    );
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

  if (p.anchorType === 'wedge') {
    if (p.seabed === 'rock') {
      warn('WEDGE_NOT_ON_ROCK', 'The wedge anchor tables cover soft clay and sand only; on rock the anchors are sized as plain blocks.');
    } else {
      warn(
        'WEDGE_ANCHORS',
        `Wedge (Pearl Harbor type) anchors sized from published working capacities (Sound & Sea Technology 2009, Tables 35–36), with chains long enough to keep the angle at the anchor within ${WEDGE_ANGLE_LIMIT[p.seabed]}°. They hold only when placed the right way round and dug in; they are not in the price list and are priced as concrete anchors of the same mass.`,
      );
    }
  }

  for (const item of accessItems.filter((x) => x.wallSide === undefined)) {
    warn(
      'ACCESS_PONTOON_NO_SHORE',
      `Access pontoon ${item.id}: the site has no shoreline, so it has no shore chains and is anchored on both sides like a pier, by its own wind area only.`,
      item.id,
    );
  }
  // I102: the other anchor type, for comparison (not on rock: the wedge tables cover clay and sand).
  let comparison: AnchoringResult['comparison'];
  const current = anchorTotals(lines, usesWedge(p) ? 'wedge' : 'block');
  if (input.compareAnchorTypes !== false && p.seabed !== 'rock' && current.totalKg > 0) {
    const otherType: AnchorType = p.anchorType === 'wedge' ? 'block' : 'wedge';
    const alt = anchoringPlan({ ...input, params: { ...p, anchorType: otherType }, compareAnchorTypes: false });
    comparison = { current, other: anchorTotals(alt.lines, otherType) };
  }

  const estimatedWaves = (input.waves?.from ?? []).flatMap((bearing, i) => (input.waves?.estimated?.[i] ? [{ bearing, hs: input.waves?.hs50?.[i] ?? null }] : []));
  if (estimatedWaves.length > 0) {
    warn(
      'WAVE_HEIGHT_ESTIMATED',
      `No wind in the wave screening for ${estimatedWaves.map((w) => sectorName(w.bearing)).join(', ')}: the 50-year Hm0 of ${estimatedWaves.length > 1 ? 'these directions' : 'this direction'} (${estimatedWaves
        .map((w) => `${w.hs?.toFixed(2) ?? '?'} m`)
        .join(', ')}) is estimated from its fetch with the design wind ${p.windSpeed.toFixed(0)} m/s (USACE CEM). Fetch the wind climate in the Waves window for the site's winds.`,
    );
  }
  if (shelterNotes.length > 0) {
    warn(
      'WAVE_LOAD_SHELTERED',
      `Wave load behind the breakwaters from the transmitted height Hm0 × (1 − Ac) (brochure curves, I93): ${shelterNotes.join('; ')}. Diffraction round the breakwater ends, reflection and overtopping are not included.`,
    );
  }
  if (smallWaves.length > 0) {
    warn(
      'WAVE_LOAD_SMALL_WAVES',
      `No wave load from ${smallWaves.length} direction${smallWaves.length > 1 ? 's' : ''} with open water: their 50-year Hm0 (${smallWaves.map((w) => `${w.hs!.toFixed(2)} m`).join(', ')}) is at most ${p.waveLoadMinHs.toFixed(2)} m (UFC 4-152-07 6-3.4.7.2: above 1 ft the waves "could be a significant factor in design").`,
    );
  }
  if (waveNotes.length > 0) {
    warn(
      'WAVE_LOAD',
      `Wave load from the directions with open water, up to ${p.waveLoad.toFixed(1)} kN/m (AS 3962-2001 4.8.2.3, minimum without a specific analysis, for the waves of its Table 4.2): the full load for a 50-year Hm0 of ${p.waveLoadFullHs.toFixed(2)} m or more, none up to ${p.waveLoadMinHs.toFixed(2)} m, in proportion to Hm0² between (assumption); a direction without a wave estimate takes the full load. Added to the wind: ${waveNotes.join('; ')}. Across a pontoon on its whole length (the wave front along it, 4.8.2.4), along it on its end; the fingers' share is not added (not at the same time).`,
    );
    if ((input.waves?.exceeding ?? []).length > 0) {
      warn(
        'WAVE_LOAD_ABOVE_CRITERIA',
        `The waves from ${input.waves!.exceeding.join(', ')} exceed the wave climate criteria; AS 3962's 2 kN/m is a minimum "for the wave criteria given in Table 4.2". Larger waves need a specific wave load analysis (and probably wave protection).`,
      );
    }
    // I102: with the wave load, plain blocks holding by friction become several times heavier
    // than shaped anchors that dig in.
    if (comparison && comparison.current.anchorType === 'block' && comparison.current.totalKg > WAVE_BLOCK_RATIO * comparison.other.totalKg) {
      const t = (kg: number) => (kg / 1000).toFixed(1);
      warn(
        'WAVE_LOAD_PLAIN_BLOCKS',
        `With the wave load, plain concrete blocks holding by friction need ${t(comparison.current.totalKg)} t of anchors (largest ${t(comparison.current.maxKg)} t); concrete wedges (Pearl Harbor type, Sound & Sea Technology 2009 Tables 35–36) would need ${t(comparison.other.totalKg)} t (largest ${t(comparison.other.maxKg)} t) with chains up to ${comparison.other.longestChainM.toFixed(1)} m. Shaped or embedded anchors that dig into the seabed hold several times their friction; choose the anchor type with the designer and the installer.`,
      );
    }
  }
  warn(
    'ANCHORING_NOT_A_DESIGN',
    `Preliminary quantity estimate from wind${waveNotes.length > 0 ? ' and the AS 3962 minimum wave load' : ' only'}. ${waveNotes.length > 0 ? 'Wave dynamics' : 'Waves'}, ice, currents, berthing loads and the capacity of the pontoon fixings are not calculated. Requires design by a qualified engineer (e.g. RIL 201-3-2013, AS 3962).`,
  );
  return { lines, piles, loads, issues, ...(comparison ? { comparison } : {}) };
}
