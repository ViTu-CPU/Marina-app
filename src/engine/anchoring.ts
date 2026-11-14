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
 *     H = F / lines / sin θ. A line takes the larger. Access pontoons keep square lines; the
 *     load along them is left to the wall.
 *  4. Each line: chain length L = max(h + 1 m, factor × h), h = depth at high water.
 *     Catenary with a = H / w (w = submerged weight per metre). If L is at least the length
 *     that hangs when the chain touches the bottom tangentially, s = √(h² + 2 h a), the
 *     rest lies on the bottom and the anchor gets no uplift. Otherwise the chain hangs
 *     between both ends: span X = 2a · asinh(√(L² − h²) / 2a), uplift at the anchor
 *     V = H · sinh(atanh(h/L) − X/2a), at the pontoon T = √(H² + (V + wL)²).
 *  5. Chain: the cheapest chain of the price list with a published breaking load such that
 *     MBL · ((d − c)/d)² ≥ SF · T (c = corrosion allowance on the diameter).
 *  6. Anchor: submerged weight ≥ SF_slide · (H / μ + V); mass = that / (g (1 − ρ_w/ρ_c)).
 *     The cheapest concrete anchor of the price list at least that heavy and not heavier
 *     than the largest piece to be handled; otherwise several of the heaviest such piece.
 *     Friction only: the extra holding of an anchor embedded in the seabed is not counted
 *     (it depends on penetration, which is not known at this stage; Chalmers 2026 §7.5).
 */
import { unitPriceVat0, type PriceList, type Product } from './catalog';
import { add, distance, pointInRing, scale } from './geometry';
import type { BoatClass, Issue, Layout, MainPier, Site, Vec2 } from './model';
import { pierAxis } from './rows';
import { accessPontoonsOf } from './site';

export type Seabed = 'clay' | 'sand' | 'rock';

/**
 * 'block': plain concrete block holding by friction. 'wedge': Pearl Harbor type concrete
 * wedge that digs into soft seabeds, sized from Sound & Sea Technology 2009 Tables 35–36
 * (DECISIONS I59).
 */
export type AnchorType = 'block' | 'wedge';

export interface AnchoringParams {
  /** Design water depth at the anchors, m (D16). */
  depth: number;
  /** Highest water level above the design level, m. */
  highWater: number;
  /** Lowest water level below the design level, m. */
  lowWater: number;
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
  /** Heaviest single concrete anchor to be handled, kg; heavier needs give several anchors. */
  maxAnchorMass: number;
  anchorType: AnchorType;
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
 *  - concreteDensity 2400 kg/m³: "about 150 pounds per cubic foot" (DBW 2005, App. A p. 90).
 *  - friction sand 0.6: smooth concrete on quartz sand (Sound & Sea Technology 2009, Table 33).
 *  - anchorType 'block': the concrete anchors of the price list are plain blocks; kept as the
 *    default by the owner (D26).
 *  - splayAngle 45°: owner's choice (D25). Splayed corner chains are SF Marina's typical layout
 *    (Chalmers 2026 Fig. 4; 12° in its reference case); 45° is from a dock anchoring kit's
 *    description, "ristiin noin 45 asteen kulmassa" (K-Rauta, Savorak painoankkurointipaketti,
 *    search excerpt 2026-11-14) — a weak source.
 *  - Assumptions without a source: depth and water levels (site data), pontoonFreeboard,
 *    lineSpacing, slidingSafetyFactor, friction for clay and rock.
 */
export const DEFAULT_ANCHORING: AnchoringParams = {
  depth: 4,
  highWater: 1.5,
  lowWater: 0.9,
  seabed: 'clay',
  windSpeed: 22,
  airDensity: 1.25,
  dragCoefficient: 1.6,
  leewardFactor: 0.2,
  profileHeightRatio: 0.15,
  pontoonFreeboard: 0.5,
  lineSpacing: 12,
  splayAngle: 45,
  chainSafetyFactor: 3,
  corrosionAllowance: 0,
  slidingSafetyFactor: 1.5,
  friction: { sand: 0.6, clay: 0.3, rock: 0.5 },
  chainLengthFactor: 4,
  maxAnchorMass: 3000,
  anchorType: 'block',
  waterDensity: 1000,
  concreteDensity: 2400,
  steelDensity: 7850,
};

/**
 * The method's defaults with the site values and the anchor type of `p` kept (depth, water
 * levels, seabed, design wind): "Reset factors to defaults" (DECISIONS U19).
 */
export const resetAnchoringFactors = (p: AnchoringParams): AnchoringParams => ({
  ...structuredClone(DEFAULT_ANCHORING),
  depth: p.depth,
  highWater: p.highWater,
  lowWater: p.lowWater,
  seabed: p.seabed,
  windSpeed: p.windSpeed,
  anchorType: p.anchorType,
});

const G = 9.81;
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
  /** Where the chain is fixed to the pontoon. */
  fix: Vec2;
  /** Position of the anchor on the seabed (plan view). */
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
  /** How the anchor was sized: 'wedge' only where the wedge tables apply (not on rock). */
  anchorType: AnchorType;
  /** Required anchor mass in air, kg. */
  requiredAnchorKg: number;
  anchorId: string | null;
  /** Number of anchors (more than 1 only when no single anchor is heavy enough). */
  anchorCount: number;
}

export interface AnchoringResult {
  lines: AnchorLine[];
  /** Per pier / access pontoon: design wind loads across (larger side) and along the pier, kN. */
  loads: { id: string; lateralKn: number; axialFromSeaKn: number; axialFromShoreKn: number }[];
  issues: Issue[];
}

export interface AnchoringInput {
  layout: Pick<Layout, 'piers' | 'berths'>;
  site: Site;
  classes: BoatClass[];
  params: AnchoringParams;
  priceList: PriceList;
  vatPct: number;
  /** Freeboard of the main pier product, m, when known. */
  pierFreeboard?: number | null;
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
 * anchors each chain is made long enough for the wedge tables' angle limit.
 */
export function chooseChain(H: number, h: number, p: AnchoringParams, list: PriceList, vatPct: number): ChainChoice | null {
  let best: { choice: ChainChoice; cost: number } | null = null;
  for (const product of list.products) {
    if (product.category !== 'chain' || product.breakingLoadKn === null || product.massKgPerM === null) continue;
    const price = unitPriceVat0(product, vatPct);
    const d = product.chainDiameterMm;
    if (price === null || d === null || d <= p.corrosionAllowance) continue;
    const w = submergedWeight(product.massKgPerM, p);
    const length = usesWedge(p) ? wedgeChainLength(h, H, w, chainLengthFor(h, p), WEDGE_ANGLE_LIMIT[p.seabed]) : chainLengthFor(h, p);
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

/**
 * The cheapest single anchor of at least `mass` kg, else the heaviest one several times.
 * Only anchors up to `maxPiece` kg are considered (all when none is that light).
 */
export function chooseAnchor(mass: number, list: PriceList, vatPct: number, maxPiece = Infinity): { product: Product; count: number } | null {
  const priced = list.products.filter(
    (x) => x.category === 'anchor' && x.anchorMassKg !== null && x.anchorMassKg > 0 && unitPriceVat0(x, vatPct) !== null,
  );
  const handleable = priced.filter((x) => x.anchorMassKg! <= maxPiece);
  const anchors = handleable.length > 0 ? handleable : priced;
  if (anchors.length === 0) return null;
  const heavyEnough = anchors.filter((x) => x.anchorMassKg! >= mass);
  if (heavyEnough.length > 0) {
    heavyEnough.sort(
      (x, y) => unitPriceVat0(x, vatPct)! - unitPriceVat0(y, vatPct)! || x.anchorMassKg! - y.anchorMassKg! || (x.id < y.id ? -1 : 1),
    );
    return { product: heavyEnough[0]!, count: 1 };
  }
  const heaviest = anchors.reduce((a, b) => (b.anchorMassKg! > a.anchorMassKg! ? b : a));
  return { product: heaviest, count: Math.ceil(mass / heaviest.anchorMassKg!) };
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
  const freeboard = input.pierFreeboard ?? p.pontoonFreeboard;
  const q = 0.5 * p.airDensity * p.windSpeed ** 2;
  const issues: Issue[] = [];
  const warn = (code: string, message: string, elementId?: string) =>
    issues.push({ severity: 'warning', code, message, ...(elementId ? { elementId } : {}) });

  const held: Held[] = [
    ...layout.piers.map((pier) => ({
      id: pier.id,
      start: pier.start,
      end: pier.end,
      width: pier.width,
      splayed: true,
      ...pierLoads(pier, layout, classes, p, freeboard),
    })),
    ...accessPontoonsOf(site).map((a) => ({
      id: a.id,
      start: a.start,
      end: a.end,
      width: a.width,
      lateral: q * p.dragCoefficient * distance(a.start, a.end) * freeboard,
      axialFromSea: 0,
      axialFromShore: 0,
      splayed: false,
    })),
  ];

  const hHigh = p.depth + p.highWater;
  const theta = (Math.min(MAX_SPLAY_ANGLE, Math.max(0, p.splayAngle)) * Math.PI) / 180;
  const lines: AnchorLine[] = [];
  const loads: AnchoringResult['loads'] = [];
  const unheld: string[] = [];
  for (const item of held) {
    const { length, along, left } = pierAxis({ ...item, locked: false, origin: 'manual' });
    if (!(length > 0)) continue;
    loads.push({ id: item.id, lateralKn: item.lateral / 1000, axialFromSeaKn: item.axialFromSea / 1000, axialFromShoreKn: item.axialFromShore / 1000 });
    const pairs = Math.max(2, Math.ceil(length / p.lineSpacing) + 1);
    const at = (t: number, lateral: number) => add(add(item.start, scale(along, t)), scale(left, lateral));
    const angle = item.splayed ? theta : 0;
    const stations = Array.from({ length: pairs }, (_, i) => Math.min(length - 0.5, Math.max(0.5, (i * length) / (pairs - 1))));
    /** Stations in the shore half (and the middle one) are splayed towards the head (I60). */
    const splayOf = (t: number): AnchorLine['splay'] => (angle === 0 ? 'none' : t <= length / 2 + 1e-9 ? 'head' : 'shore');
    const count = { head: 0, shore: 0, none: 0 };
    for (const t of stations) count[splayOf(t)] += 2;
    // Across: the `pairs` lines of one side share the load. Along: the lines splayed against
    // the wind share it (wind from the sea pushes the pier shorewards: the 'head' lines hold).
    const acrossH = item.lateral / pairs / Math.cos(angle);
    const alongH = (splay: AnchorLine['splay']): number => {
      if (splay === 'none') return 0;
      const force = splay === 'head' ? item.axialFromSea : item.axialFromShore;
      return force > 0 ? force / count[splay] / Math.sin(angle) : 0;
    };
    if (item.splayed && Math.max(item.axialFromSea, item.axialFromShore) > 0 && (angle === 0 || count.head === 0 || count.shore === 0)) {
      unheld.push(item.id);
    }

    const addLine = (fix: Vec2, direction: Vec2, splay: AnchorLine['splay'], offset: number, n: number) => {
      const alongLoad = alongH(splay);
      const H = Math.max(acrossH, alongLoad);
      const governs: AnchorLine['governs'] = alongLoad > acrossH ? 'along' : 'across';
      const chain = chooseChain(H, hHigh, p, priceList, vatPct);
      // Without a chain the uplift is not known; it is left out and the line is flagged.
      const uplift = chain?.uplift ?? 0;
      const upAngle = upliftAngle(H, uplift);
      const wedgeMass = usesWedge(p) && chain ? requiredWedgeMass(H, upAngle, p) : null;
      const mass = wedgeMass ?? requiredAnchorMass(H, uplift, p);
      const anchor = chooseAnchor(mass, priceList, vatPct, p.maxAnchorMass);
      const length = chain?.length ?? chainLengthFor(hHigh, p);
      const span = chain ? chain.span : Math.sqrt(length * length - hHigh * hHigh);
      lines.push({
        id: `${item.id}-A${n}`,
        holdsId: item.id,
        splay,
        governs,
        fix,
        // A crossed chain passes under the pontoon: the anchor is `span` from the fixing
        // point, on the far side.
        anchor: add(fix, scale(direction, Math.max(span, (offset + 1) / Math.cos(angle)))),
        horizontalKn: H / 1000,
        topTensionKn: (chain?.topTension ?? H) / 1000,
        upliftKn: uplift / 1000,
        upliftAngleDeg: upAngle,
        anchorType: wedgeMass === null ? 'block' : 'wedge',
        chainLength: length,
        chainId: chain?.product.id ?? null,
        requiredAnchorKg: mass,
        anchorId: anchor?.product.id ?? null,
        anchorCount: anchor?.count ?? 0,
      });
      if (!chain) warn('NO_CHAIN_STRONG_ENOUGH', `No chain in the price list holds ${(H / 1000).toFixed(1)} kN with the safety factor; line ${item.id}-A${n} has no chain.`, item.id);
      if (anchor && anchor.count > 1) {
        warn(
          'SEVERAL_ANCHORS',
          `Line ${item.id}-A${n} needs ${Math.round(mass)} kg: ${anchor.count} anchors of ${anchor.product.anchorMassKg} kg. Several anchors on one line do not necessarily hold as much as one anchor of the same total mass.`,
          item.id,
        );
      }
    };

    let n = 0;
    for (const t of stations) {
      const splay = splayOf(t);
      const towards = scale(along, splay === 'shore' ? -Math.sin(angle) : Math.sin(angle));
      // Fixed on the left edge, anchored on the right (holds against wind from the right) and vice versa.
      addLine(at(t, item.width / 2), add(scale(left, -Math.cos(angle)), towards), splay, item.width, ++n);
      addLine(at(t, -item.width / 2), add(scale(left, Math.cos(angle)), towards), splay, item.width, ++n);
    }
  }

  if (unheld.length > 0) {
    warn(
      'ALONG_PIER_LOAD_NOT_HELD',
      `The wind along ${unheld.length === 1 ? 'pier' : 'piers'} ${unheld.join(', ')} is not held by any chain (splay angle 0° or too few chain pairs); it needs other restraint.`,
    );
  }

  // Anchors must lie in the water area (and not under an obstacle).
  if (site.water.length >= 3) {
    const outside = lines.filter(
      (l) => !pointInRing(l.anchor, site.water) || site.obstacles.some((o) => pointInRing(l.anchor, o.shape)),
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

  if (site.accessPontoons && accessPontoonsOf(site).length > 0) {
    warn(
      'ACCESS_PONTOON_WALL_FIXING',
      'Access pontoons are anchored here like piers, loaded by their own wind area only. Next to a quay wall, wall fixings may replace the anchors on the wall side; the loads from the piers attached to them are not included.',
    );
  }
  warn(
    'ANCHORING_NOT_A_DESIGN',
    'Preliminary quantity estimate from wind only. Waves, ice, currents, berthing loads and the capacity of the pontoon fixings are not calculated. Requires design by a qualified engineer (e.g. RIL 201-3-2013, AS 3962).',
  );
  return { lines, loads, issues };
}
