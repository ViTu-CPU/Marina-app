/**
 * The anchor of one line (DECISIONS D62).
 *
 * Every line gets at most `maxAnchorsPerLine` anchors (default 1; 2 only by the user's choice,
 * "tandem"). The cheapest anchor of the price list that suits the seabed and holds the line within
 * that number is chosen:
 *  - concrete blocks (`anchor_type` block or empty) by the friction model (or the wedge tables):
 *    pieces = ⌈required mass / product mass⌉, products no heavier than the largest piece to be
 *    handled (`maxAnchorMass`);
 *  - every other kind (screw, pile, rock_bolt, drag) by its **published** capacity only:
 *    pieces = ⌈SF · H / capacity_horizontal⌉, and for a line that lifts its anchor also
 *    ⌈SF · V / capacity_uplift⌉. A product without a published capacity (or without the uplift
 *    capacity a lifting line needs, or without its seabeds) is never chosen by itself.
 * The cost compared is per line: pieces × (installed price, else supply price + the installation
 * estimated from the labour parameters of the price list).
 *
 * When nothing fits, the line is INFEASIBLE and the reason names what each kind would need, e.g.
 * "block: needs 33 922 kg, max product 3 000 kg". The required mass is never split over more
 * anchors than allowed, and the line spacing is not changed to make blocks fit: the load per line
 * only falls in proportion to the spacing.
 */
import { anchorKindOf, installedPriceVat0, parameter, unitPriceVat0, type AnchorKind, type PriceList, type Product, type SeabedType } from './catalog';

/**
 * D62: installation of the anchors, from the price list's parameters (Assumptions there). Older
 * price lists without the new keys: `diver_h_per_anchor_line` stands for `diver_h_per_anchor`
 * (one anchor per line), `boat_days_per_10_anchor_lines` for 10 / `anchors_per_boat_day`.
 */
export interface InstallParams {
  /** Diving-team hours per anchor piece. */
  diverHoursPerAnchor: number;
  /** Extra diving-team hours per tonne of anchor mass. */
  diverHoursPerTonne: number;
  /** Anchors the work boat carries and lowers in a day. */
  anchorsPerBoatDay: number;
  /** Heaviest single anchor the work boat lifts, kg. */
  workBoatMaxLiftKg: number;
  /** Keys of an older price list used as fallback (shown in a note). */
  legacyKeys: string[];
}

export const DEFAULT_INSTALL: Omit<InstallParams, 'legacyKeys'> = {
  diverHoursPerAnchor: 1,
  diverHoursPerTonne: 0,
  anchorsPerBoatDay: 10,
  workBoatMaxLiftKg: 3000,
};

const has = (list: PriceList, key: string) => list.parameters.some((p) => p.key === key);

export function installParams(list: PriceList): InstallParams {
  const legacyKeys: string[] = [];
  let diverHoursPerAnchor = parameter(list, 'diver_h_per_anchor', DEFAULT_INSTALL.diverHoursPerAnchor);
  if (!has(list, 'diver_h_per_anchor') && has(list, 'diver_h_per_anchor_line')) {
    diverHoursPerAnchor = parameter(list, 'diver_h_per_anchor_line', DEFAULT_INSTALL.diverHoursPerAnchor);
    legacyKeys.push('diver_h_per_anchor_line');
  }
  let anchorsPerBoatDay = parameter(list, 'anchors_per_boat_day', DEFAULT_INSTALL.anchorsPerBoatDay);
  if (!has(list, 'anchors_per_boat_day') && has(list, 'boat_days_per_10_anchor_lines')) {
    const days = parameter(list, 'boat_days_per_10_anchor_lines', 1);
    if (days > 0) anchorsPerBoatDay = 10 / days;
    legacyKeys.push('boat_days_per_10_anchor_lines');
  }
  return {
    diverHoursPerAnchor,
    diverHoursPerTonne: parameter(list, 'diver_h_per_tonne', DEFAULT_INSTALL.diverHoursPerTonne),
    anchorsPerBoatDay: anchorsPerBoatDay > 0 ? anchorsPerBoatDay : DEFAULT_INSTALL.anchorsPerBoatDay,
    workBoatMaxLiftKg: parameter(list, 'work_boat_max_lift_kg', DEFAULT_INSTALL.workBoatMaxLiftKg),
    legacyKeys,
  };
}

/** Mass of one anchor piece, kg: a block's mass, else its weight when given, else 0. */
export const anchorPieceMassKg = (product: Product): number => product.anchorMassKg ?? product.weightKg ?? 0;

/**
 * Cost of one anchor piece in place, € VAT 0 %: the installed price, else the supply price plus
 * the diving and work-boat time of the installation parameters; null without a price.
 */
export function anchorPieceCost(product: Product, list: PriceList, vatPct: number, install: InstallParams = installParams(list)): number | null {
  const installed = installedPriceVat0(product, vatPct);
  if (installed !== null) return installed;
  const supply = unitPriceVat0(product, vatPct);
  if (supply === null) return null;
  const rate = (id: string) => {
    const p = list.products.find((x) => x.id === id);
    return p ? (unitPriceVat0(p, vatPct) ?? 0) : 0;
  };
  const diving = (install.diverHoursPerAnchor + (install.diverHoursPerTonne * anchorPieceMassKg(product)) / 1000) * rate('rate-diving-team');
  const boat = rate('rate-work-boat') / install.anchorsPerBoatDay;
  return supply + diving + boat;
}

/** What one line asks of its anchor. */
export interface LineNeed {
  /** Design horizontal load at the anchor, N. */
  H: number;
  /** Uplift at the anchor, N (0 when the chain lies on the bottom). */
  V: number;
  /** Mass in air a concrete block needs (friction model, or wedge tables), kg. */
  blockMassKg: number;
}

export interface LineAnchorOptions {
  seabed: SeabedType;
  /** At most this many anchors on one line (D62). */
  maxPerLine: number;
  /** Heaviest concrete block to be handled, kg. */
  maxBlockMassKg: number;
  /** Factor of safety on published capacities (1 = they are working loads). */
  capacitySafetyFactor: number;
  /** Only concrete blocks (stern-buoy sinkers, sized from a table by mass). */
  blocksOnly?: boolean;
  /** How the block mass was found, for the reason ('block' or 'block (wedge sizing)'). */
  blockLabel?: string;
}

export interface AnchorPick {
  product: Product;
  kind: AnchorKind;
  count: number;
  /** Cost of the line's anchors in place, € VAT 0 %. */
  cost: number;
}

/** The anchor of a line, or why none of the price list fits (`reason`). */
export interface LineAnchor {
  pick: AnchorPick | null;
  reason: string | null;
}

/** 33922 → "33 922" (spaces between thousands). */
export const groupThousands = (x: number): string => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const kn = (n: number) => (n / 1000).toFixed(1);

const KIND_ORDER: readonly AnchorKind[] = ['block', 'screw', 'pile', 'rock_bolt', 'drag'];

export function chooseLineAnchor(need: LineNeed, o: LineAnchorOptions, list: PriceList, vatPct: number, install: InstallParams = installParams(list)): LineAnchor {
  const maxPerLine = Math.max(1, Math.floor(o.maxPerLine));
  const anchors = list.products.filter((p) => p.category === 'anchor' && (!o.blocksOnly || anchorKindOf(p) === 'block'));
  const suits = (p: Product, anyWhenEmpty: boolean) => (p.seabeds.length === 0 ? anyWhenEmpty : p.seabeds.includes(o.seabed));
  const candidates: AnchorPick[] = [];
  const reasons: string[] = [];
  const times = maxPerLine > 1 ? `${maxPerLine} × ` : '';

  // Concrete blocks: the friction model (or the wedge tables) gave the mass.
  const blocks = anchors.filter((p) => anchorKindOf(p) === 'block');
  if (blocks.length > 0) {
    const label = o.blockLabel ?? 'block';
    const usable = blocks.filter((p) => p.anchorMassKg !== null && p.anchorMassKg > 0 && anchorPieceCost(p, list, vatPct, install) !== null && suits(p, true));
    const handled = usable.filter((p) => p.anchorMassKg! <= o.maxBlockMassKg + 1e-9);
    for (const p of handled) {
      const count = Math.max(1, Math.ceil(need.blockMassKg / p.anchorMassKg! - 1e-9));
      if (count <= maxPerLine) candidates.push({ product: p, kind: 'block', count, cost: count * anchorPieceCost(p, list, vatPct, install)! });
    }
    if (usable.length === 0) reasons.push(`${label}: no concrete anchor with a mass and a price for ${o.seabed}`);
    else if (handled.length === 0) reasons.push(`${label}: needs ${groupThousands(need.blockMassKg)} kg, no product within the largest piece ${groupThousands(o.maxBlockMassKg)} kg`);
    else {
      const heaviest = handled.reduce((m, p) => Math.max(m, p.anchorMassKg!), 0);
      reasons.push(`${label}: needs ${groupThousands(need.blockMassKg)} kg, max product ${times}${groupThousands(heaviest)} kg`);
    }
  }

  // Other kinds: published capacities only.
  const sfH = o.capacitySafetyFactor * need.H;
  const sfV = o.capacitySafetyFactor * Math.max(0, need.V);
  const lifts = need.V > 1e-6;
  for (const kind of KIND_ORDER.filter((k) => k !== 'block')) {
    const ofKind = anchors.filter((p) => anchorKindOf(p) === kind);
    if (ofKind.length === 0) continue;
    const published = ofKind.filter((p) => p.capacityBasis === 'published' && p.capacityHorizontalKn !== null && p.capacityHorizontalKn > 0);
    const priced = published.filter((p) => anchorPieceCost(p, list, vatPct, install) !== null);
    const forSeabed = priced.filter((p) => suits(p, false));
    const withUplift = lifts ? forSeabed.filter((p) => p.capacityUpliftKn !== null && p.capacityUpliftKn > 0) : forSeabed;
    for (const p of withUplift) {
      const count = Math.max(1, Math.ceil(sfH / (p.capacityHorizontalKn! * 1000) - 1e-9), lifts ? Math.ceil(sfV / (p.capacityUpliftKn! * 1000) - 1e-9) : 0);
      if (count <= maxPerLine) candidates.push({ product: p, kind, count, cost: count * anchorPieceCost(p, list, vatPct, install)! });
    }
    if (published.length === 0) reasons.push(`${kind}: no published capacity in the price list`);
    else if (priced.length === 0) reasons.push(`${kind}: no price in the price list`);
    else if (forSeabed.length === 0) reasons.push(`${kind}: none for ${o.seabed}`);
    else if (withUplift.length === 0) reasons.push(`${kind}: needs ${kn(sfV)} kN uplift, no uplift capacity published`);
    else {
      const maxH = withUplift.reduce((m, p) => Math.max(m, p.capacityHorizontalKn!), 0);
      const maxV = lifts ? withUplift.reduce((m, p) => Math.max(m, p.capacityUpliftKn!), 0) : 0;
      const parts = [`${kn(sfH)} kN horizontal, max product ${times}${maxH.toFixed(1)} kN`];
      if (lifts) parts.push(`${kn(sfV)} kN uplift, max product ${times}${maxV.toFixed(1)} kN`);
      reasons.push(`${kind}: needs ${parts.join('; ')}`);
    }
  }

  if (candidates.length === 0) return { pick: null, reason: reasons.length > 0 ? reasons.join('; ') : 'no anchor in the price list' };
  candidates.sort(
    (a, b) =>
      (Math.abs(a.cost - b.cost) > 1e-9 ? a.cost - b.cost : 0) ||
      a.count - b.count ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      anchorPieceMassKg(a.product) - anchorPieceMassKg(b.product) ||
      (a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0),
  );
  return { pick: candidates[0]!, reason: null };
}
