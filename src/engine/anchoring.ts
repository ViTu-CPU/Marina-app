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
 *     the first boat in full and the others with the leeward factor, plus the pier's end
 *     area.
 *  3. Lateral lines: pairs of chains crossed under the pier at a spacing along it; the
 *     lines of one side carry the load from that side. Axial lines: two at the head,
 *     anchored seawards at ±30°; loads towards the sea are assumed taken by the shore
 *     abutment.
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
  chainSafetyFactor: 3,
  corrosionAllowance: 0,
  slidingSafetyFactor: 1.5,
  friction: { sand: 0.6, clay: 0.3, rock: 0.5 },
  chainLengthFactor: 4,
  maxAnchorMass: 3000,
  waterDensity: 1000,
  concreteDensity: 2400,
  steelDensity: 7850,
};

/**
 * The method's defaults with the site values of `p` kept (depth, water levels, seabed and
 * design wind): "Reset factors to defaults" (DECISIONS U19).
 */
export const resetAnchoringFactors = (p: AnchoringParams): AnchoringParams => ({
  ...structuredClone(DEFAULT_ANCHORING),
  depth: p.depth,
  highWater: p.highWater,
  lowWater: p.lowWater,
  seabed: p.seabed,
  windSpeed: p.windSpeed,
});

const G = 9.81;
/** Angle of the two axial lines at a pier head from the pier axis, degrees. */
const AXIAL_ANGLE = 30;

export interface AnchorLine {
  id: string;
  /** Pier or access pontoon the line holds. */
  holdsId: string;
  kind: 'lateral' | 'axial';
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
  /** Required anchor mass in air, kg. */
  requiredAnchorKg: number;
  anchorId: string | null;
  /** Number of anchors (more than 1 only when no single anchor is heavy enough). */
  anchorCount: number;
}

export interface AnchoringResult {
  lines: AnchorLine[];
  /** Per pier / access pontoon: design wind loads, kN. */
  loads: { id: string; lateralKn: number; axialKn: number }[];
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

/** The cheapest chain of the list that holds `H` (N) in water `h` deep (m), or null. */
export function chooseChain(H: number, h: number, p: AnchoringParams, list: PriceList, vatPct: number): ChainChoice | null {
  let best: { choice: ChainChoice; cost: number } | null = null;
  for (const product of list.products) {
    if (product.category !== 'chain' || product.breakingLoadKn === null || product.massKgPerM === null) continue;
    const price = unitPriceVat0(product, vatPct);
    const d = product.chainDiameterMm;
    if (price === null || d === null || d <= p.corrosionAllowance) continue;
    const length = chainLengthFor(h, p);
    const line = chainLine(h, length, H, submergedWeight(product.massKgPerM, p));
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
  /** Wind load along the axis, N; 0 for access pontoons (held by the wall). */
  axial: number;
}

/**
 * Wind loads on a main pier and its boats, N (UFC 4-152-07 C1 §6-3.4.1.4 and Fig. 6-5).
 * The boats lie square to the pier: wind across the pier meets them bow-on (beam ×
 * profile height), wind along the pier broadside (length × profile height).
 */
function pierLoads(pier: MainPier, layout: AnchoringInput['layout'], classes: BoatClass[], p: AnchoringParams, freeboard: number) {
  const q = 0.5 * p.airDensity * p.windSpeed ** 2;
  const byId = new Map(classes.map((c) => [c.id, c]));
  const { length, along } = pierAxis(pier);
  /** Per side: bow areas, sum of beams (the pier face they hide), and the broadside row area. */
  const bow = { left: 0, right: 0 };
  const beams = { left: 0, right: 0 };
  let axialArea = pier.width * freeboard;
  for (const side of ['left', 'right'] as const) {
    const boats = layout.berths
      .filter((b) => b.pierId === pier.id && b.side === side && !b.removed)
      .map((b) => ({ b, c: byId.get(b.boatClassId) }))
      .filter((x): x is { b: (typeof x)['b']; c: BoatClass } => x.c !== undefined)
      // Wind from the sea along the axis meets the boat nearest the head first; that is the
      // direction the axial lines at the head hold.
      .sort((x, y) => {
        const sx = (x.b.slot[0]!.x - pier.start.x) * along.x + (x.b.slot[0]!.y - pier.start.y) * along.y;
        const sy = (y.b.slot[0]!.x - pier.start.x) * along.x + (y.b.slot[0]!.y - pier.start.y) * along.y;
        return sy - sx;
      });
    boats.forEach(({ c }, i) => {
      const height = p.profileHeightRatio * c.length;
      bow[side] += c.beam * height;
      beams[side] += c.beam;
      axialArea += (i === 0 ? 1 : p.leewardFactor) * c.length * height;
    });
  }
  const across = (windward: 'left' | 'right', leeward: 'left' | 'right') =>
    bow[windward] + p.leewardFactor * bow[leeward] + Math.max(0, length - beams[windward]) * freeboard;
  const lateralArea = Math.max(across('left', 'right'), across('right', 'left'));
  return { lateral: q * p.dragCoefficient * lateralArea, axial: q * p.dragCoefficient * axialArea };
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
    ...layout.piers.map((pier) => ({ id: pier.id, start: pier.start, end: pier.end, width: pier.width, ...pierLoads(pier, layout, classes, p, freeboard) })),
    ...accessPontoonsOf(site).map((a) => ({
      id: a.id,
      start: a.start,
      end: a.end,
      width: a.width,
      lateral: q * p.dragCoefficient * distance(a.start, a.end) * freeboard,
      axial: 0,
    })),
  ];

  const hHigh = p.depth + p.highWater;
  const lines: AnchorLine[] = [];
  const loads: AnchoringResult['loads'] = [];
  for (const item of held) {
    const { length, along, left } = pierAxis({ ...item, locked: false, origin: 'manual' });
    if (!(length > 0)) continue;
    loads.push({ id: item.id, lateralKn: item.lateral / 1000, axialKn: item.axial / 1000 });
    const pairs = Math.max(2, Math.ceil(length / p.lineSpacing) + 1);
    const lateralH = item.lateral / pairs;
    const at = (t: number, lateral: number) => add(add(item.start, scale(along, t)), scale(left, lateral));

    const addLine = (kind: AnchorLine['kind'], fix: Vec2, direction: Vec2, H: number, offset: number, n: number) => {
      const chain = chooseChain(H, hHigh, p, priceList, vatPct);
      // Without a chain the uplift is not known; it is left out and the line is flagged.
      const uplift = chain?.uplift ?? 0;
      const mass = requiredAnchorMass(H, uplift, p);
      const anchor = chooseAnchor(mass, priceList, vatPct, p.maxAnchorMass);
      const length = chain?.length ?? chainLengthFor(hHigh, p);
      const span = chain ? chain.span : Math.sqrt(length * length - hHigh * hHigh);
      lines.push({
        id: `${item.id}-A${n}`,
        holdsId: item.id,
        kind,
        fix,
        // A crossed chain passes under the pontoon: the anchor is `span` from the fixing
        // point, on the far side.
        anchor: add(fix, scale(direction, Math.max(span, offset + 1))),
        horizontalKn: H / 1000,
        topTensionKn: (chain?.topTension ?? H) / 1000,
        upliftKn: uplift / 1000,
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
    for (let i = 0; i < pairs; i++) {
      const t = Math.min(length - 0.5, Math.max(0.5, (i * length) / (pairs - 1)));
      // Fixed on the left edge, anchored on the right (holds against wind from the right) and vice versa.
      addLine('lateral', at(t, item.width / 2), scale(left, -1), lateralH, item.width, ++n);
      addLine('lateral', at(t, -item.width / 2), left, lateralH, item.width, ++n);
    }
    if (item.axial > 0) {
      const H = item.axial / 2 / Math.cos((AXIAL_ANGLE * Math.PI) / 180);
      const rad = (AXIAL_ANGLE * Math.PI) / 180;
      for (const sign of [1, -1]) {
        const dir = add(scale(along, Math.cos(rad)), scale(left, sign * Math.sin(rad)));
        addLine('axial', at(length, (sign * item.width) / 2), dir, H, 0, ++n);
      }
    }
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
