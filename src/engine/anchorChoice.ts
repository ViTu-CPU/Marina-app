/**
 * The anchor of one line (DECISIONS D62, D64).
 *
 * The owner's rule (D64): a line gets **concrete anchors of at most `maxAnchorMass` (5 t)** — one
 * per line, two only as the user's tandem choice — or, when no such block holds it, a **pile anchor
 * at the end of its chain** (length and section by geotechnical design). The required block mass
 * comes from the sizing of docs/ANKKUROINTI_MITOITUS_SPEC.md (engine/mooring.ts). No other anchor
 * kinds (screw anchors etc.) are chosen.
 *
 * Among the blocks that hold, the cheapest per line wins: pieces × (installed price, else supply
 * price + the installation estimated from the labour parameters of the price list). A block without
 * a price is chosen only when no priced block holds (it is then listed as unpriced).
 */
import { anchorKindOf, installedPriceVat0, parameter, unitPriceVat0, type PriceList, type Product } from './catalog';

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

/** 33922 → "33 922" (spaces between thousands). */
export const groupThousands = (x: number): string => Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export interface BlockPick {
  product: Product;
  count: number;
  /** Cost of the line's blocks in place, € VAT 0 %; null when the block has no price. */
  cost: number | null;
}

/** The concrete blocks a plan may use: no heavier than `maxBlockMassKg`, for the seabed (empty list = any). */
export function usableBlocks(list: PriceList, maxBlockMassKg: number, seabed: string): Product[] {
  return list.products.filter(
    (p) =>
      p.category === 'anchor' &&
      anchorKindOf(p) === 'block' &&
      p.anchorMassKg !== null &&
      p.anchorMassKg > 0 &&
      p.anchorMassKg <= maxBlockMassKg + 1e-9 &&
      (p.seabeds.length === 0 || (p.seabeds as readonly string[]).includes(seabed)),
  );
}

/**
 * The cheapest blocks of at least `massReqKg` in total, at most `maxPerLine` pieces of at most
 * `maxBlockMassKg`; null with the reason ("block: needs 32 604 kg, max product 5 000 kg") when none.
 */
export function chooseBlock(
  massReqKg: number,
  o: { maxPerLine: number; maxBlockMassKg: number; seabed: string },
  list: PriceList,
  vatPct: number,
  install: InstallParams = installParams(list),
): { pick: BlockPick | null; heaviestKg: number; reason: string | null } {
  const maxPerLine = Math.max(1, Math.floor(o.maxPerLine));
  const blocks = usableBlocks(list, o.maxBlockMassKg, o.seabed);
  const heaviestKg = blocks.reduce((m, p) => Math.max(m, p.anchorMassKg!), 0);
  if (!Number.isFinite(massReqKg)) return { pick: null, heaviestKg, reason: 'block: no friction capacity (the seabed slope leaves none)' };
  const candidates: BlockPick[] = [];
  for (const p of blocks) {
    const count = Math.max(1, Math.ceil(massReqKg / p.anchorMassKg! - 1e-9));
    if (count > maxPerLine) continue;
    const piece = anchorPieceCost(p, list, vatPct, install);
    candidates.push({ product: p, count, cost: piece === null ? null : count * piece });
  }
  if (candidates.length === 0) {
    const times = maxPerLine > 1 ? `${maxPerLine} × ` : '';
    return {
      pick: null,
      heaviestKg,
      reason: blocks.length === 0 ? `block: no concrete anchor of at most ${groupThousands(o.maxBlockMassKg)} kg in the price list` : `block: needs ${groupThousands(massReqKg)} kg, max product ${times}${groupThousands(heaviestKg)} kg`,
    };
  }
  candidates.sort(
    (a, b) =>
      (a.cost === null ? 1 : 0) - (b.cost === null ? 1 : 0) ||
      (a.cost !== null && b.cost !== null && Math.abs(a.cost - b.cost) > 1e-9 ? a.cost - b.cost : 0) ||
      a.count - b.count ||
      a.product.anchorMassKg! - b.product.anchorMassKg! ||
      (a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0),
  );
  return { pick: candidates[0]!, heaviestKg, reason: null };
}

/** D64: the pile anchor of the price list (`anchor_type` pile with a price; installed price first), or null. */
export function pileProduct(list: PriceList, vatPct: number): Product | null {
  const piles = list.products.filter((p) => p.category === 'anchor' && anchorKindOf(p) === 'pile' && (installedPriceVat0(p, vatPct) ?? unitPriceVat0(p, vatPct)) !== null);
  piles.sort((a, b) => (installedPriceVat0(a, vatPct) ?? unitPriceVat0(a, vatPct)!) - (installedPriceVat0(b, vatPct) ?? unitPriceVat0(b, vatPct)!) || (a.id < b.id ? -1 : 1));
  return piles[0] ?? null;
}
