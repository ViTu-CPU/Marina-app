/**
 * Bill of materials and cost estimate (DECISIONS D24, I48–I53).
 *
 * Quantity-based unit-price estimate (docs/RESEARCH.md §4): every quantity comes from the
 * layout, the site and the anchoring plan; every price, labour output and percentage from
 * the price list. Totals are VAT 0 %; VAT is added to the total only (D18).
 *
 *   line         = order quantity × unit price (VAT 0 %), order quantity = quantity × (1 + margin)
 *   subtotal     = materials + labour + plant
 *   total VAT 0  = subtotal × (1 + overheads) × (1 + contingency)
 */
import { anchorPieceMassKg, groupThousands, installParams } from './anchorChoice';
import type { AnchoringResult, AnchorLine } from './anchoring';
import { DEFAULT_VAT_PCT, installedPriceVat0, parameter, unitPriceVat0, type PriceList, type Product, type ProductUnit } from './catalog';
import { distance, distancePointToPolyline } from './geometry';
import type { CostSettings, Layout, Params, Site } from './model';
import { rowFrame, toLocalRect } from './rows';
import { EQUIPMENT_DEFAULTS, equipmentPlan, type EquipmentKind, type EquipmentPlan, type EquipmentSpacing } from './equipment';
import { accessPontoonsOf, DEFAULT_GANGWAY_LENGTH, gangwayPositions, pierPolygon, pierShoreLink, SHORE_TOLERANCE } from './site';
import { gangwayClearWidth } from './as3962';
import { breakwaterModules, breakwaterProductOf, breakwatersOf } from './breakwater';

export type BomGroup = 'pontoons' | 'fingers' | 'gangways' | 'anchoring' | 'fittings' | 'labour' | 'plant';

/**
 * D64: the BOM row of the pile anchors of the lines that no concrete anchor of at most 5 t holds,
 * when the price list has no pile anchor with a price.
 */
export const PILE_BY_DESIGN_ID = 'pile-anchor-by-design';
export const PILE_BY_DESIGN_NAME = 'Pile anchor – length and section by geotechnical design';
export const BOM_GROUPS: BomGroup[] = ['pontoons', 'fingers', 'gangways', 'anchoring', 'fittings', 'labour', 'plant'];

export interface BomLine {
  group: BomGroup;
  productId: string;
  name: string;
  supplier: string;
  unit: ProductUnit;
  /** Calculated quantity. */
  quantity: number;
  /** Quantity with the product's margin; whole pieces for 'pcs'. */
  orderQuantity: number;
  /** € VAT 0 %, or null when the price list has no price. */
  unitPrice: number | null;
  total: number | null;
  /** How the quantity was obtained. */
  basis: string;
  sourceUrl: string;
  sourceDate: string;
  note: string;
}

export interface ResolvedChoices {
  pontoonSeries: string | null;
  fingerSeries: string | null;
  /** Series for the booms of Y-boom berths (D34). */
  boomSeries: string | null;
  gangwaySeries: string | null;
  /** Freeboard of the chosen pontoon series, m (for the anchoring wind area), or null. */
  pontoonFreeboard: number | null;
  /** D49: gangway length to buy, m: the project's (`Params.gangwayLength`), else the price list's `gangway_length_m`. */
  gangwayLength?: number;
}

/**
 * D62: something the estimate knows is needed but cannot price; it is not in the totals. Every
 * such item is listed by name: products without a price, anchor points by design, breakwaters,
 * products missing from the price list, work without a rate.
 */
export interface UnpricedItem {
  name: string;
  quantity: number;
  unit: ProductUnit;
  /** Why it has no price. */
  reason: string;
}

export interface CostEstimate {
  lines: BomLine[];
  byGroup: Record<BomGroup, number>;
  materials: number;
  labour: number;
  plant: number;
  subtotal: number;
  overhead: number;
  contingency: number;
  totalVat0: number;
  vatPct: number;
  vat: number;
  totalWithVat: number;
  /** Range around the total VAT 0 %. */
  range: [number, number];
  /** Number of unpriced items (`unpriced.length`): their cost is not in the totals. */
  missingPrices: number;
  /** D62: every unpriced item by name; not in the totals. */
  unpriced: UnpricedItem[];
  /** Total VAT 0 % per berth and per metre of main pier and access pontoon, €. */
  perBerth: number;
  perPierMetre: number;
  notes: string[];
  /** D65: rescue ladders, safety equipment posts and power and water pedestals, placed. */
  equipment: EquipmentPlan;
}

/** D65: the spacings of the equipment from the price list's parameters (defaults: EQUIPMENT_DEFAULTS). */
export function equipmentSpacing(list: PriceList): EquipmentSpacing {
  return {
    ladderSpacing: parameter(list, 'ladder_spacing_m', EQUIPMENT_DEFAULTS.ladderSpacing),
    safetyPostSpacing: parameter(list, 'safety_post_spacing_m', EQUIPMENT_DEFAULTS.safetyPostSpacing),
    berthsPerPedestal: parameter(list, 'berths_per_power_pedestal', EQUIPMENT_DEFAULTS.berthsPerPedestal),
  };
}

const priced = (p: Product, vat: number) => unitPriceVat0(p, vat);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * D62: what a total's label adds when items are unpriced: " (excludes 3 unpriced items, see list)",
 * else "".
 */
export const excludesNote = (estimate: Pick<CostEstimate, 'unpriced'>): string =>
  estimate.unpriced.length === 0 ? '' : ` (excludes ${plural(estimate.unpriced.length, 'unpriced item')}, see list)`;
export const seriesOf = (list: PriceList, category: Product['category'], series: string) =>
  list.products.filter((p) => p.category === category && p.series === series);

/** Series names of a category, in price-list order. */
export function seriesNames(list: PriceList, category: Product['category']): string[] {
  const names: string[] = [];
  for (const p of list.products) if (p.category === category && p.series && !names.includes(p.series)) names.push(p.series);
  return names;
}

/** Lowest price per metre of a series (VAT 0 %), Infinity when unknown. */
function pricePerMetre(products: Product[], vat: number): number {
  let best = Infinity;
  for (const p of products) {
    const price = priced(p, vat);
    if (price === null) continue;
    if (p.unit === 'm') best = Math.min(best, price);
    else if (p.lengthM) best = Math.min(best, price / p.lengthM);
  }
  return best;
}

/** The series closest in width to `width` (m); ties go to the lower price per metre. */
function closestByWidth(list: PriceList, category: Product['category'], width: number, vat: number): string | null {
  let best: { name: string; dw: number; ppm: number } | null = null;
  for (const name of seriesNames(list, category)) {
    const products = seriesOf(list, category, name);
    const w = products.find((p) => p.widthM !== null)?.widthM ?? 0;
    const dw = Math.abs(w - width);
    const ppm = pricePerMetre(products, vat);
    if (!best || dw < best.dw - 1e-9 || (Math.abs(dw - best.dw) < 1e-9 && ppm < best.ppm)) best = { name, dw, ppm };
  }
  return best?.name ?? null;
}

export function resolveChoices(list: PriceList, cost: CostSettings, params: Params): ResolvedChoices {
  const vat = parameter(list, 'vat_pct', DEFAULT_VAT_PCT);
  const pick = (chosen: string, category: Product['category'], auto: () => string | null) =>
    chosen && seriesNames(list, category).includes(chosen) ? chosen : auto();
  const pontoonSeries = pick(cost.pontoonSeries, 'pontoon', () => closestByWidth(list, 'pontoon', params.mainPierWidth, vat));
  const fingerSeries = pick(cost.fingerSeries, 'finger', () => closestByWidth(list, 'finger', params.fingerWidth, vat));
  const boomSeries = pick(cost.boomSeries ?? '', 'finger', () => closestByWidth(list, 'finger', params.boomWidth, vat));
  const wanted = params.gangwayLength ?? parameter(list, 'gangway_length_m', 6);
  const gangwaySeries = pick(cost.gangwaySeries, 'gangway', () => {
    let best: { name: string; price: number } | null = null;
    for (const name of seriesNames(list, 'gangway')) {
      const fit = pickByLength(seriesOf(list, 'gangway', name), wanted, vat);
      const price = fit ? priced(fit.product, vat) : null;
      if (fit?.longEnough && price !== null && (!best || price < best.price)) best = { name, price };
    }
    return best?.name ?? seriesNames(list, 'gangway')[0] ?? null;
  });
  const freeboards = pontoonSeries
    ? seriesOf(list, 'pontoon', pontoonSeries).flatMap((p) => (p.freeboardM === null ? [] : [p.freeboardM]))
    : [];
  return {
    pontoonSeries,
    fingerSeries,
    boomSeries,
    gangwaySeries,
    pontoonFreeboard: freeboards.length > 0 ? Math.max(...freeboards) : null,
    ...(params.gangwayLength === undefined ? {} : { gangwayLength: params.gangwayLength }),
  };
}

/** The shortest product at least `length` long (ties: cheaper), else the longest. */
export function pickByLength(products: Product[], length: number, vat: number): { product: Product; longEnough: boolean } | null {
  const withLength = products.filter((p) => p.lengthM !== null);
  if (withLength.length === 0) return null;
  const enough = withLength.filter((p) => p.lengthM! >= length - 0.05);
  if (enough.length > 0) {
    enough.sort((a, b) => a.lengthM! - b.lengthM! || (priced(a, vat) ?? Infinity) - (priced(b, vat) ?? Infinity));
    return { product: enough[0]!, longEnough: true };
  }
  return { product: withLength.reduce((a, b) => (b.lengthM! > a.lengthM! ? b : a)), longEnough: false };
}

/**
 * I109: the gangway for `served` berths: of the selected series when wide (AS 3962 Table 3.3) and long
 * enough, else the cheapest wide enough gangway of the price list, else the selected series. A price
 * list without gangway widths is not judged (`wideEnough` true).
 */
export function chooseGangway(list: PriceList, seriesProducts: Product[], served: number, length: number, vat: number): { product: Product; longEnough: boolean; wideEnough: boolean } | null {
  const all = list.products.filter((p) => p.category === 'gangway');
  const hasWidths = all.some((p) => p.widthM !== null);
  const width = gangwayClearWidth(served);
  const wide = (products: Product[]) => (hasWidths ? products.filter((p) => p.widthM !== null && p.widthM >= width - 0.005) : products);
  const inSeries = pickByLength(wide(seriesProducts), length, vat);
  const anywhere = inSeries?.longEnough ? inSeries : (pickByLength(wide(all), length, vat) ?? inSeries);
  if (anywhere) return { ...anywhere, wideEnough: true };
  const fallback = pickByLength(seriesProducts, length, vat);
  return fallback ? { ...fallback, wideEnough: false } : null;
}

/**
 * Pontoon modules covering a pier of `length` m at the lowest cost: an unbounded knapsack
 * over the module lengths in 0.1 m steps (sum ≥ length − 0.05 m). Ties: fewer modules, then
 * less length. Unpriced modules count with their length only when no priced one exists.
 */
export function moduleCombination(length: number, modules: Product[], vat: number): Map<Product, number> | null {
  const usable = modules.filter((m) => m.lengthM !== null && m.lengthM > 0);
  if (usable.length === 0) return null;
  const target = Math.max(1, Math.round((length - 0.05) * 10));
  const steps = usable.map((m) => Math.round(m.lengthM! * 10));
  const cost = usable.map((m) => priced(m, vat) ?? m.lengthM! * 1e6); // unpriced: heavily penalised
  const limit = target + Math.max(...steps);
  const best: { cost: number; count: number; from: number; module: number }[] = Array.from({ length: limit + 1 }, () => ({
    cost: Infinity,
    count: Infinity,
    from: -1,
    module: -1,
  }));
  best[0] = { cost: 0, count: 0, from: -1, module: -1 };
  for (let x = 0; x <= limit; x++) {
    const here = best[x]!;
    if (here.cost === Infinity || x >= target) continue;
    usable.forEach((_, i) => {
      const y = Math.min(limit, x + steps[i]!);
      const c = here.cost + cost[i]!;
      const n = here.count + 1;
      const there = best[y]!;
      if (c < there.cost - 1e-6 || (Math.abs(c - there.cost) <= 1e-6 && n < there.count)) best[y] = { cost: c, count: n, from: x, module: i };
    });
  }
  let end = -1;
  for (let x = target; x <= limit; x++) {
    const b = best[x]!;
    if (b.cost === Infinity) continue;
    if (end < 0 || b.cost < best[end]!.cost - 1e-6 || (Math.abs(b.cost - best[end]!.cost) <= 1e-6 && b.count < best[end]!.count)) end = x;
  }
  if (end < 0) return null;
  const result = new Map<Product, number>();
  for (let x = end; x > 0; x = best[x]!.from) {
    const m = usable[best[x]!.module]!;
    result.set(m, (result.get(m) ?? 0) + 1);
  }
  return result;
}

export interface CostInput {
  layout: Pick<Layout, 'piers' | 'fingers' | 'berths'>;
  site: Site;
  priceList: PriceList;
  choices: ResolvedChoices;
  anchoring: AnchoringResult;
}

export function costEstimate(input: CostInput): CostEstimate {
  const { layout, site, priceList: list, choices, anchoring } = input;
  const vat = parameter(list, 'vat_pct', DEFAULT_VAT_PCT);
  const par = (key: string, fallback: number) => parameter(list, key, fallback);
  const spacing = equipmentSpacing(list);
  const equipment = equipmentPlan(layout, site, spacing);
  const notes: string[] = [];
  const byId = new Map(list.products.map((p) => [p.id, p]));

  /**
   * Accumulated quantities per product and group, with the reasons. D62: an anchor with an
   * installed price is priced at it ('installed': supply and installation).
   */
  const acc = new Map<string, { group: BomGroup; product: Product; quantity: number; basis: string[]; installed: boolean }>();
  /** Rows without a product of the price list (D62: anchor points by design). */
  const extra: BomLine[] = [];
  const addQty = (group: BomGroup, product: Product, quantity: number, basis: string, installed = false) => {
    if (quantity <= 0) return;
    const key = `${group}|${product.id}${installed ? '|installed' : ''}`;
    const entry = acc.get(key) ?? { group, product, quantity: 0, basis: [], installed };
    entry.quantity += quantity;
    entry.basis.push(basis);
    acc.set(key, entry);
  };
  const fmt = (x: number) => (Math.round(x * 10) / 10).toString();
  /** D62: items needed but not priced (besides the BOM lines without a price). */
  const unpriced: UnpricedItem[] = [];
  const leaveOut = (name: string, quantity: number, unit: ProductUnit, reason: string) => {
    if (quantity > 0) unpriced.push({ name, quantity, unit, reason });
  };

  // --- Pontoons: main piers and access pontoons --------------------------------------
  const pontoonProducts = choices.pontoonSeries ? seriesOf(list, 'pontoon', choices.pontoonSeries) : [];
  const held = [
    ...layout.piers.map((p) => ({ id: p.id, length: distance(p.start, p.end), width: p.width })),
    ...accessPontoonsOf(site).map((a) => ({ id: a.id, length: distance(a.start, a.end), width: a.width })),
  ];
  let moduleCount = 0;
  if (pontoonProducts.length === 0) {
    if (held.length > 0) {
      notes.push('No pontoon series in the price list: the pontoons are not priced.');
      leaveOut('Pontoons of the main piers and access pontoons', Math.round(held.reduce((t, h) => t + h.length, 0) * 10) / 10, 'm', 'No pontoon series in the price list.');
    }
  } else {
    const width = pontoonProducts.find((p) => p.widthM !== null)?.widthM;
    for (const h of held) {
      if (width !== undefined && width !== null && Math.abs(width - h.width) > 0.05) {
        notes.push(`${h.id} is ${fmt(h.width)} m wide in the layout; the pontoon series "${choices.pontoonSeries}" is ${fmt(width)} m wide.`);
      }
      const perMetre = pontoonProducts.find((p) => p.unit === 'm');
      if (perMetre) {
        addQty('pontoons', perMetre, h.length, `${h.id} ${fmt(h.length)} m`);
        // Modules unknown: one per 12 m assumed for installation hours (I51).
        moduleCount += Math.ceil(h.length / 12);
        continue;
      }
      const combo = moduleCombination(h.length, pontoonProducts, vat);
      if (!combo) continue;
      let built = 0;
      const parts: string[] = [];
      for (const [m, n] of combo) {
        addQty('pontoons', m, n, `${h.id}`);
        built += n * m.lengthM!;
        moduleCount += n;
        parts.push(`${n} × ${fmt(m.lengthM!)} m`);
      }
      if (built - h.length > 1) notes.push(`${h.id}: ${fmt(h.length)} m in the layout, built from ${parts.join(' + ')} = ${fmt(built)} m.`);
    }
  }

  // --- Fingers -------------------------------------------------------------------------
  const fingerProducts = choices.fingerSeries ? seriesOf(list, 'finger', choices.fingerSeries) : [];
  // Booms of Y-boom berths (D34) from their own series.
  const boomProducts = choices.boomSeries ? seriesOf(list, 'finger', choices.boomSeries) : [];
  const pierById = new Map(layout.piers.map((p) => [p.id, p]));
  let fingerCount = 0;
  const tooShort = { finger: 0, boom: 0 };
  for (const f of layout.fingers) {
    const pier = pierById.get(f.pierId);
    if (!pier) continue;
    const r = toLocalRect(f.shape, rowFrame(pier, 'left'));
    const needed = r.d1 - r.d0;
    const boom = f.kind === 'boom';
    const fit = pickByLength(boom ? boomProducts : fingerProducts, needed, vat);
    if (!fit) continue;
    if (!fit.longEnough) tooShort[boom ? 'boom' : 'finger']++;
    addQty('fingers', fit.product, 1, `${boom ? 'boom' : 'finger'} ${fmt(needed)} m`);
    fingerCount++;
  }
  if (layout.fingers.some((f) => f.kind !== 'boom') && fingerProducts.length === 0) {
    notes.push('No finger series in the price list: the fingers are not priced.');
    leaveOut('Fingers', layout.fingers.filter((f) => f.kind !== 'boom').length, 'pcs', 'No finger series in the price list.');
  }
  if (layout.fingers.some((f) => f.kind === 'boom') && boomProducts.length === 0) {
    notes.push('No boom series in the price list: the booms are not priced.');
    leaveOut('Booms', layout.fingers.filter((f) => f.kind === 'boom').length, 'pcs', 'No boom series in the price list.');
  }
  if (tooShort.finger > 0) notes.push(`${tooShort.finger} fingers are longer than the longest product of "${choices.fingerSeries}"; the longest is used.`);
  if (tooShort.boom > 0) notes.push(`${tooShort.boom} booms are longer than the longest product of "${choices.boomSeries}"; the longest is used.`);

  // --- Gangways: one per pier that starts at the shoreline, one per access pontoon -----
  const gangwayProducts = choices.gangwaySeries ? seriesOf(list, 'gangway', choices.gangwaySeries) : [];
  // D49: every pier reached from the shoreline by its gangway (not those on an access pontoon).
  const fromShore = layout.piers.filter((p) => pierShoreLink(p, site, choices.gangwayLength ?? DEFAULT_GANGWAY_LENGTH)?.kind === 'gangway').length;
  const accessGangways = accessPontoonsOf(site).reduce((n, a) => n + gangwayPositions(a).length, 0);
  const gangways = fromShore + accessGangways;
  const wantedGangway = choices.gangwayLength ?? par('gangway_length_m', 6);
  // I109: each gangway at least the clear width of AS 3962-2001 Table 3.3 for the berths it serves:
  // a pier's own berths, or an access pontoon's attached piers shared by its gangways. The selected
  // series first, else the cheapest wide enough gangway of the price list (product width taken as
  // the clear width: assumption).
  const berthsOf = (pierId: string) => layout.berths.filter((b) => b.pierId === pierId && !b.removed).length;
  const needs: { what: string; served: number }[] = [
    ...layout.piers
      .filter((p) => pierShoreLink(p, site, choices.gangwayLength ?? DEFAULT_GANGWAY_LENGTH)?.kind === 'gangway')
      .map((p) => ({ what: p.id, served: berthsOf(p.id) })),
    ...accessPontoonsOf(site).flatMap((a) => {
      const edges = pierPolygon(a.start, a.end, a.width);
      const attached = layout.piers.filter((p) => distancePointToPolyline(p.start, [edges[0]!, edges[1]!]) <= SHORE_TOLERANCE || distancePointToPolyline(p.start, [edges[3]!, edges[2]!]) <= SHORE_TOLERANCE);
      const served = attached.reduce((n, p) => n + berthsOf(p.id), 0);
      const count = gangwayPositions(a).length;
      return Array.from({ length: count }, () => ({ what: a.id, served: Math.ceil(served / count) }));
    }),
  ];
  const hasWidths = list.products.some((p) => p.category === 'gangway' && p.widthM !== null);
  const widest = list.products.filter((p) => p.category === 'gangway' && p.widthM !== null).reduce((m, p) => Math.max(m, p.widthM!), 0);
  const narrow: string[] = [];
  let short = false;
  for (const need of needs) {
    const width = gangwayClearWidth(need.served);
    const pick = chooseGangway(list, gangwayProducts, need.served, wantedGangway, vat);
    if (!pick) continue;
    const chosen = pick;
    if (!pick.wideEnough) {
      // D62: not priced with a narrower gangway; listed as unpriced with the width it needs.
      narrow.push(`${need.what} (${need.served} berths, ${fmt(width)} m)`);
      leaveOut(
        `Gangway for ${need.what}, at least ${fmt(width)} m clear (AS 3962 Table 3.3, ${need.served} berths)`,
        1,
        'pcs',
        `No gangway in the price list is ${fmt(width)} m wide or wider (widest ${fmt(widest)} m); not priced with a narrower one.`,
      );
      continue;
    }
    if (!chosen.longEnough) short = true;
    addQty('gangways', chosen.product, 1, `${need.what}: ${need.served} berths → at least ${fmt(width)} m clear (AS 3962 Table 3.3)`);
  }
  if (narrow.length > 0) notes.push(`No gangway in the price list is as wide as AS 3962 Table 3.3 asks for ${narrow.join(', ')}; ${narrow.length === 1 ? 'it is' : 'they are'} not priced (see the unpriced items).`);
  if (short) notes.push(`No gangway wide enough is ${fmt(wantedGangway)} m long; the longest is used.`);
  if (needs.length > 0 && hasWidths) notes.push('Gangway widths: the product width is taken as the clear width between the handrails (assumption); AS 3962 Table 3.3 gives the clear width.');

  // --- Anchoring -----------------------------------------------------------------------
  const lineCount = anchoring.lines.length;
  const seabedLines = anchoring.lines.filter((l) => l.fixing === 'seabed').length;
  const wallLines = lineCount - seabedLines;
  const smallest = (category: Product['category'], size: (p: Product) => number | null, min: number) => {
    const candidates = list.products.filter((p) => p.category === category && size(p) !== null && priced(p, vat) !== null);
    const enough = candidates.filter((p) => size(p)! >= min).sort((a, b) => size(a)! - size(b)! || priced(a, vat)! - priced(b, vat)!);
    return enough[0] ?? candidates.sort((a, b) => size(b)! - size(a)!)[0] ?? null;
  };
  let missingChain = 0;
  /** D62: lines that no anchor of the price list holds (not priced: by design). */
  const byDesign: AnchorLine[] = [];
  /** D64: pile anchors of the price list priced at their supply price only (installation not priced). */
  let pilesWithoutInstallation = 0;
  /**
   * D62: anchors installed by the divers and the work boat: every piece whose price is a supply
   * price (an installed price includes the installation), with their mass.
   */
  const placed = { pieces: 0, tonnes: 0, installed: 0, heavy: 0, heaviestKg: 0 };
  const install = installParams(list);
  /** Stern buoys (D36) without a float of the needed buoyancy in the list. */
  let smallFloats = 0;
  let buoyLines = 0;
  /** D62: fittings of the lines that the price list has no product for. */
  const missing = { chainM: 0, float: 0, shackle: 0, spring: 0, anode: 0 };
  for (const line of anchoring.lines) {
    const chain = line.chainId ? byId.get(line.chainId) : undefined;
    if (chain) addQty('anchoring', chain, line.chainLength, line.id);
    else {
      missingChain++;
      missing.chainM += line.chainLength;
    }
    const anchor = line.anchorId ? byId.get(line.anchorId) : undefined;
    if (anchor && line.anchorKind === 'pile') {
      // D64: a pile anchor of the price list; its driving is not in the diving or boat time.
      const installed = installedPriceVat0(anchor, vat) !== null;
      addQty('anchoring', anchor, line.anchorCount, line.id, installed);
      if (!installed) pilesWithoutInstallation += line.anchorCount;
    } else if (anchor) {
      const installed = installedPriceVat0(anchor, vat) !== null;
      addQty('anchoring', anchor, line.anchorCount, line.id, installed);
      const mass = anchorPieceMassKg(anchor);
      if (installed) placed.installed += line.anchorCount;
      else {
        placed.pieces += line.anchorCount;
        placed.tonnes += (line.anchorCount * mass) / 1000;
      }
      if (mass > install.workBoatMaxLiftKg + 1e-9) {
        placed.heavy += line.anchorCount;
        placed.heaviestKg = Math.max(placed.heaviestKg, mass);
      }
    } else if (line.status === 'PILE') byDesign.push(line);
    const d = chain?.chainDiameterMm ?? 0;
    if (line.buoy) {
      // A stern buoy: float, sinker and chain with its shackles, as in Top Marine's buoy
      // packages (no spring, no anode; I81); the shackle one size above the chain (I84).
      buoyLines++;
      const float = smallest('buoy', (p) => p.capacityKg, line.buoy.floatCapacityKg);
      if (float) {
        if ((float.capacityKg ?? 0) < line.buoy.floatCapacityKg - 1e-9) smallFloats++;
        addQty('anchoring', float, 1, line.id);
      } else missing.float++;
      // "Sakkelin nimellinen koko on aina suurempi kuin kettingin koko" (Top Marine).
      const buoyShackle = smallest('shackle', (p) => p.shackleMm, Math.max(d, line.buoy.tableChainMm) + 0.5);
      if (buoyShackle) addQty('anchoring', buoyShackle, par('shackles_per_buoy_line', 1), line.id);
      else missing.shackle += par('shackles_per_buoy_line', 1);
      continue;
    }
    const shackle = smallest('shackle', (p) => p.shackleMm, d);
    if (shackle) addQty('anchoring', shackle, par('shackles_per_anchor_line', 2), line.id);
    else missing.shackle += par('shackles_per_anchor_line', 2);
    const spring = smallest('spring', (p) => p.chainDiameterMm, d);
    if (spring) addQty('anchoring', spring, par('springs_per_anchor_line', 1), line.id);
    else missing.spring += par('springs_per_anchor_line', 1);
    const anode = smallest('anode', (p) => p.chainDiameterMm, d);
    if (anode) addQty('anchoring', anode, par('anodes_per_anchor_line', 1), line.id);
    else missing.anode += par('anodes_per_anchor_line', 1);
  }
  if (missingChain > 0) notes.push(`${missingChain} anchor lines have no chain strong enough in the price list; their chain is not priced.`);
  leaveOut(`Anchor chain for ${plural(missingChain, 'line')}`, Math.round(missing.chainM * 10) / 10, 'm', 'No chain of the price list holds the line load with the safety factor.');
  leaveOut('Stern-buoy floats', missing.float, 'pcs', 'No buoy float with a buoyancy and a price in the price list.');
  leaveOut('Shackles of the anchor lines', missing.shackle, 'pcs', 'No shackle with a size and a price in the price list.');
  leaveOut('Spring links of the anchor lines', missing.spring, 'pcs', 'No spring with a size and a price in the price list.');
  leaveOut('Chain anodes of the anchor lines', missing.anode, 'pcs', 'No anode with a size and a price in the price list.');
  if (byDesign.length > 0) {
    const where = [...new Set(byDesign.map((l) => (l.role === 'buoy' ? 'stern buoys' : l.holdsId)))];
    const worst = byDesign.reduce((a, l) => ((l.requiredAnchorKg || 0) > (a.requiredAnchorKg || 0) ? l : a));
    extra.push({
      group: 'anchoring',
      productId: PILE_BY_DESIGN_ID,
      name: PILE_BY_DESIGN_NAME,
      supplier: '',
      unit: 'pcs',
      quantity: byDesign.length,
      orderQuantity: byDesign.length,
      unitPrice: null,
      total: null,
      basis: `${byDesign.length} lines with pile anchors (${where.join(', ')})`,
      sourceUrl: '',
      sourceDate: '',
      note: `No concrete anchor of the price list within the allowed mass holds these lines (worst ${worst.id}: ${worst.pileReason}). No pile anchor with a price in the price list: supply and driving are not priced.`,
    });
    notes.push(
      `${byDesign.length} anchor lines take pile anchors (${where.join(', ')}): no concrete anchor of the allowed mass holds them; the piles are not priced (no pile anchor in the price list) and need a geotechnical design. Their chains are priced.`,
    );
  }
  leaveOut('Pile driving', pilesWithoutInstallation, 'pcs', 'The pile anchors of the price list have a supply price only; driving them needs a contractor’s price.');
  if (buoyLines > 0 && !list.products.some((p) => p.category === 'buoy' && p.capacityKg !== null && priced(p, vat) !== null)) {
    notes.push('No buoy floats with a buoyancy in the price list: the stern buoys are not priced.');
  }
  if (smallFloats > 0) notes.push(`${smallFloats} stern buoys need more buoyancy than the largest float of the price list; the largest is used.`);
  // Shore chains (D28): one fixing in the wall each; its capacity is not checked.
  if (wallLines > 0) {
    const fixing = list.products
      .filter((p) => p.category === 'wall_fixing' && priced(p, vat) !== null)
      .sort((a, b) => priced(a, vat)! - priced(b, vat)! || (a.id < b.id ? -1 : 1))[0];
    if (fixing) addQty('anchoring', fixing, wallLines, `${wallLines} shore chains`);
    else {
      notes.push('No wall fixing in the price list: the wall fixings of the shore chains are not priced.');
      leaveOut('Wall fixings of the shore chains', wallLines, 'pcs', 'No wall fixing with a price in the price list.');
    }
  }
  // D58, I106: breakwater modules; Marinetek's breakwater prices are not public and not in the price list.
  for (const b of breakwatersOf(site)) {
    const product = breakwaterProductOf(b);
    const length = distance(b.start, b.end);
    const modules = breakwaterModules(length, product);
    const byCode = new Map<string, { count: number; weightT: number }>();
    for (const module of modules) {
      const entry = byCode.get(module.code) ?? { count: 0, weightT: module.weightT };
      entry.count++;
      byCode.set(module.code, entry);
    }
    const parts = [...byCode.entries()].map(([code, e]) => `${e.count} × ${code}`).join(' + ');
    const weight = [...byCode.values()].reduce((t, e) => t + e.count * e.weightT, 0);
    const built = modules.reduce((t, m) => t + m.length, 0);
    notes.push(`Breakwater ${b.id}: ${product.name}, drawn ${fmt(length)} m: ${parts} = ${fmt(built)} m (${fmt(weight)} t), not priced: no breakwater in the price list.`);
    // D62: listed in the bill of materials without a price, so that it counts as unpriced.
    extra.push({
      group: 'pontoons',
      productId: `breakwater-${b.id}`,
      name: `Breakwater ${b.id}: ${product.name}, ${parts} (${fmt(weight)} t)`,
      supplier: 'Marinetek',
      unit: 'pcs',
      quantity: modules.length,
      orderQuantity: modules.length,
      unitPrice: null,
      total: null,
      basis: `drawn ${fmt(length)} m, built ${fmt(built)} m`,
      sourceUrl: 'https://www.marinetek.hr/en/brochures-and-specifications/',
      sourceDate: '2026-11-15',
      note: 'No breakwater in the price list (Marinetek publishes no prices): the modules and their installation are not priced; their anchor lines are in the anchoring.',
    });
  }
  // End piles of long fingers (D31): no public prices.
  if (anchoring.piles.length > 0) {
    const guides = [...new Set(anchoring.piles.map((x) => x.guide ?? 'above G700'))].join(', ');
    notes.push(`${anchoring.piles.length} end piles with pile guides (${guides}) for fingers longer than the limit are not priced: no public prices.`);
    leaveOut(`End piles with pile guides (${guides})`, anchoring.piles.length, 'pcs', 'No public prices; the piles are not designed here.');
  }

  // --- Fittings --------------------------------------------------------------------------
  const berths = layout.berths.filter((b) => !b.removed).length;
  const cheapest = (category: Product['category']) =>
    list.products.filter((p) => p.category === category && priced(p, vat) !== null).sort((a, b) => priced(a, vat)! - priced(b, vat)!)[0];
  let smallItems = 0;
  const cleat = cheapest('cleat');
  const cleats = berths * par('cleats_per_berth', 2);
  if (cleat && cleats > 0) {
    addQty('fittings', cleat, cleats, `${berths} berths × ${par('cleats_per_berth', 2)}`);
    smallItems += cleats;
  } else if (!cleat) leaveOut('Cleats or mooring rings', cleats, 'pcs', 'No cleat with a price in the price list.');
  // D65: rescue ladders, safety equipment posts and power and water pedestals placed on the piers and access pontoons.
  const count = (kind: EquipmentKind) => equipment.items.filter((x) => x.kind === kind).length;
  const ladders = count('ladder');
  const ladder = cheapest('ladder');
  if (ladder && ladders > 0) {
    addQty('fittings', ladder, ladders, `every ${fmt(spacing.ladderSpacing)} m of ${held.length} piers and access pontoons (at most ${fmt(spacing.ladderSpacing / 2)} m from any point)`);
    smallItems += ladders;
  } else if (!ladder && ladders > 0) leaveOut('Rescue ladders', ladders, 'pcs', 'No ladder with a price in the price list.');
  const posts = count('safetyPost');
  const post = cheapest('safety_post');
  if (post && posts > 0) {
    addQty('fittings', post, posts, `every ${fmt(spacing.safetyPostSpacing)} m of ${held.length} piers and access pontoons (at most ${fmt(spacing.safetyPostSpacing / 2)} m from any point)`);
    smallItems += posts;
  } else if (!post && posts > 0) leaveOut('Safety equipment posts', posts, 'pcs', 'No safety equipment post with a price in the price list.');
  const pedestals = count('pedestal');
  // The cheapest pedestal with at least one socket per berth it serves (sockets read from the name, e.g. "4×16A"); else the cheapest.
  const sockets = (p: Product) => Number((/(\d+)\s*[x×]\s*\d+\s*A/i.exec(p.name) ?? [])[1] ?? NaN);
  const powers = list.products.filter((p) => p.category === 'power' && priced(p, vat) !== null).sort((a, b) => priced(a, vat)! - priced(b, vat)!);
  const power = powers.find((p) => sockets(p) >= spacing.berthsPerPedestal) ?? powers[0];
  if (power && pedestals > 0) {
    addQty('fittings', power, pedestals, `${equipment.berths} berths ÷ ${fmt(spacing.berthsPerPedestal)} per pedestal (one socket per berth, assumption), per pier`);
    smallItems += pedestals;
    if (!(sockets(power) >= spacing.berthsPerPedestal)) notes.push(`Power pedestals: no pedestal of the price list has ${fmt(spacing.berthsPerPedestal)} sockets; ${power.name} is used.`);
  } else if (!power && pedestals > 0) leaveOut('Power and water pedestals', pedestals, 'pcs', 'No power pedestal with a price in the price list.');
  if (pedestals > 0) notes.push('Power and water pedestals: cabling, water pipes and the connections ashore are not priced.');

  // --- Labour and plant ----------------------------------------------------------------------
  const rate = (id: string) => {
    const p = byId.get(id);
    if (!p) notes.push(`The price list has no row "${id}"; that work is not priced.`);
    return p;
  };
  const installer = rate('rate-installer');
  const diving = rate('rate-diving-team');
  const crane = rate('rate-crane');
  const boat = rate('rate-work-boat');
  const crewHours =
    moduleCount * par('crew_h_per_pontoon', 4) +
    fingerCount * par('crew_h_per_finger', 1.5) +
    gangways * par('crew_h_per_gangway', 3) +
    smallItems * par('crew_h_per_small_item', 0.25);
  if (installer) {
    addQty(
      'labour',
      installer,
      crewHours,
      `${moduleCount} pontoons × ${par('crew_h_per_pontoon', 4)} h + ${fingerCount} fingers × ${par('crew_h_per_finger', 1.5)} h + ${gangways} gangways × ${par('crew_h_per_gangway', 3)} h + ${smallItems} small items × ${par('crew_h_per_small_item', 0.25)} h`,
    );
  }
  // D62: diving hours per anchor piece (and per wall fixing of a shore chain) and per tonne of anchor.
  const divingHours = (placed.pieces + wallLines) * install.diverHoursPerAnchor + placed.tonnes * install.diverHoursPerTonne;
  if (!installer) leaveOut('Installer hours', Math.round(crewHours * 10) / 10, 'h', 'The price list has no row "rate-installer".');
  if (!diving) leaveOut('Diving-team hours', Math.round(divingHours * 10) / 10, 'h', 'The price list has no row "rate-diving-team".');
  if (!crane) leaveOut('Crane hours (lifting and transport)', moduleCount * (par('crane_h_per_pontoon', 1) + par('transport_h_per_pontoon', 2)), 'h', 'The price list has no row "rate-crane".');
  if (!boat) leaveOut('Work-boat days', Math.ceil(placed.pieces / install.anchorsPerBoatDay - 1e-9), 'day', 'The price list has no row "rate-work-boat".');
  if (diving && divingHours > 0) {
    addQty(
      'labour',
      diving,
      divingHours,
      `${plural(placed.pieces, 'anchor')}${wallLines > 0 ? ` + ${plural(wallLines, 'wall fixing')}` : ''} × ${fmt(install.diverHoursPerAnchor)} h${
        install.diverHoursPerTonne > 0 ? ` + ${fmt(placed.tonnes)} t × ${fmt(install.diverHoursPerTonne)} h/t` : ''
      }`,
    );
  }
  if (crane) {
    addQty('plant', crane, moduleCount * par('crane_h_per_pontoon', 1), `lifting: ${moduleCount} pontoons × ${par('crane_h_per_pontoon', 1)} h`);
    addQty('plant', crane, moduleCount * par('transport_h_per_pontoon', 2), `transport: ${moduleCount} pontoons × ${par('transport_h_per_pontoon', 2)} h`);
  }
  // D62: the work boat carries and lowers the anchors: days by the number of anchor pieces.
  if (boat && placed.pieces > 0) {
    const days = Math.ceil(placed.pieces / install.anchorsPerBoatDay - 1e-9);
    addQty('plant', boat, days, `${plural(placed.pieces, 'anchor')} ÷ ${fmt(install.anchorsPerBoatDay)} per day`);
  }
  if (placed.heavy > 0) {
    notes.push(
      `${placed.heavy} anchors (up to ${groupThousands(placed.heaviestKg)} kg) are heavier than the work boat lifts (work_boat_max_lift_kg ${groupThousands(install.workBoatMaxLiftKg)} kg): a heavier crane barge is needed; its cost is not in the estimate.`,
    );
    leaveOut(
      `Crane barge for ${plural(placed.heavy, 'anchor')} heavier than ${groupThousands(install.workBoatMaxLiftKg)} kg`,
      placed.heavy,
      'pcs',
      'Heavier than the work boat lifts (work_boat_max_lift_kg); no rate for a heavier barge in the price list.',
    );
  }
  if (placed.installed > 0) notes.push(`${placed.installed} anchors are priced installed (supply and installation); no diving or work-boat time is added for them.`);
  if (install.legacyKeys.length > 0) {
    notes.push(`The price list has the older installation keys ${install.legacyKeys.join(', ')} (per anchor line); they are used per anchor. Replace them with diver_h_per_anchor and anchors_per_boat_day.`);
  }

  // --- Lines and totals ----------------------------------------------------------------------
  const lines: BomLine[] = [];
  for (const group of BOM_GROUPS) {
    for (const { product, quantity, basis, installed } of [...acc.values()].filter((e) => e.group === group)) {
      const withMargin = quantity * (1 + product.marginPct / 100);
      const orderQuantity = product.unit === 'pcs' ? Math.ceil(withMargin - 1e-9) : Math.round(withMargin * 10) / 10;
      const unitPrice = installed ? installedPriceVat0(product, vat) : priced(product, vat);
      lines.push({
        group,
        productId: product.id,
        name: installed ? `${product.name} (installed)` : product.name,
        supplier: product.supplier,
        unit: product.unit,
        quantity,
        orderQuantity,
        unitPrice,
        total: unitPrice === null ? null : orderQuantity * unitPrice,
        basis: basis.length > 4 ? `${basis.length} items` : basis.join('; '),
        sourceUrl: product.sourceUrl,
        sourceDate: product.sourceDate,
        note: installed ? `Installed price: supply and installation.${product.note ? ` ${product.note}` : ''}` : product.note,
      });
    }
    lines.push(...extra.filter((x) => x.group === group));
  }
  // D62: every unpriced item, by name: the BOM lines without a price first, then what has no line.
  const extraIds = new Set(extra.map((l) => l.productId));
  const allUnpriced: UnpricedItem[] = [
    ...lines
      .filter((l) => l.unitPrice === null)
      .map((l) => ({ name: l.name, quantity: l.orderQuantity, unit: l.unit, reason: extraIds.has(l.productId) ? l.note : 'No price in the price list.' })),
    ...unpriced,
  ];
  if (allUnpriced.length > 0) notes.push(`${plural(allUnpriced.length, 'item')} without a price ${allUnpriced.length === 1 ? 'is' : 'are'} not in the totals: see the list of unpriced items.`);

  const byGroup = Object.fromEntries(BOM_GROUPS.map((g) => [g, 0])) as Record<BomGroup, number>;
  for (const l of lines) byGroup[l.group] += l.total ?? 0;
  const labour = byGroup.labour;
  const plant = byGroup.plant;
  const materials = byGroup.pontoons + byGroup.fingers + byGroup.gangways + byGroup.anchoring + byGroup.fittings;
  const subtotal = materials + labour + plant;
  const overhead = (subtotal * par('site_overhead_pct', 10)) / 100;
  const contingency = ((subtotal + overhead) * par('contingency_pct', 15)) / 100;
  const totalVat0 = subtotal + overhead + contingency;
  const vatAmount = (totalVat0 * vat) / 100;
  const pierMetres = held.reduce((s, h) => s + h.length, 0);
  return {
    lines,
    byGroup,
    materials,
    labour,
    plant,
    subtotal,
    overhead,
    contingency,
    totalVat0,
    vatPct: vat,
    vat: vatAmount,
    totalWithVat: totalVat0 + vatAmount,
    range: [totalVat0 * (1 + par('range_low_pct', -30) / 100), totalVat0 * (1 + par('range_high_pct', 50) / 100)],
    missingPrices: allUnpriced.length,
    unpriced: allUnpriced,
    perBerth: berths > 0 ? totalVat0 / berths : 0,
    perPierMetre: pierMetres > 0 ? totalVat0 / pierMetres : 0,
    notes,
    equipment,
  };
}
