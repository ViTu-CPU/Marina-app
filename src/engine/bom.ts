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
import type { AnchoringResult } from './anchoring';
import { DEFAULT_VAT_PCT, parameter, unitPriceVat0, type PriceList, type Product, type ProductUnit } from './catalog';
import { distance, distancePointToPolyline } from './geometry';
import type { CostSettings, Layout, Params, Site } from './model';
import { rowFrame, toLocalRect } from './rows';
import { accessPontoonsOf, SHORE_TOLERANCE } from './site';

export type BomGroup = 'pontoons' | 'fingers' | 'gangways' | 'anchoring' | 'fittings' | 'labour' | 'plant';
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
  gangwaySeries: string | null;
  /** Freeboard of the chosen pontoon series, m (for the anchoring wind area), or null. */
  pontoonFreeboard: number | null;
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
  /** Lines without a price (their cost is not in the totals). */
  missingPrices: number;
  /** Total VAT 0 % per berth and per metre of main pier and access pontoon, €. */
  perBerth: number;
  perPierMetre: number;
  notes: string[];
}

const priced = (p: Product, vat: number) => unitPriceVat0(p, vat);
const seriesOf = (list: PriceList, category: Product['category'], series: string) =>
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
  const wanted = parameter(list, 'gangway_length_m', 6);
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
    gangwaySeries,
    pontoonFreeboard: freeboards.length > 0 ? Math.max(...freeboards) : null,
  };
}

/** The shortest product at least `length` long (ties: cheaper), else the longest. */
function pickByLength(products: Product[], length: number, vat: number): { product: Product; longEnough: boolean } | null {
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
  const notes: string[] = [];
  const byId = new Map(list.products.map((p) => [p.id, p]));

  /** Accumulated quantities per product and group, with the reasons. */
  const acc = new Map<string, { group: BomGroup; product: Product; quantity: number; basis: string[] }>();
  const addQty = (group: BomGroup, product: Product, quantity: number, basis: string) => {
    if (quantity <= 0) return;
    const key = `${group}|${product.id}`;
    const entry = acc.get(key) ?? { group, product, quantity: 0, basis: [] };
    entry.quantity += quantity;
    entry.basis.push(basis);
    acc.set(key, entry);
  };
  const fmt = (x: number) => (Math.round(x * 10) / 10).toString();

  // --- Pontoons: main piers and access pontoons --------------------------------------
  const pontoonProducts = choices.pontoonSeries ? seriesOf(list, 'pontoon', choices.pontoonSeries) : [];
  const held = [
    ...layout.piers.map((p) => ({ id: p.id, length: distance(p.start, p.end), width: p.width })),
    ...accessPontoonsOf(site).map((a) => ({ id: a.id, length: distance(a.start, a.end), width: a.width })),
  ];
  let moduleCount = 0;
  if (pontoonProducts.length === 0) {
    if (held.length > 0) notes.push('No pontoon series in the price list: the pontoons are not priced.');
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
  const pierById = new Map(layout.piers.map((p) => [p.id, p]));
  let fingerCount = 0;
  let tooShort = 0;
  for (const f of layout.fingers) {
    const pier = pierById.get(f.pierId);
    if (!pier) continue;
    const r = toLocalRect(f.shape, rowFrame(pier, 'left'));
    const needed = r.d1 - r.d0;
    const fit = pickByLength(fingerProducts, needed, vat);
    if (!fit) continue;
    if (!fit.longEnough) tooShort++;
    addQty('fingers', fit.product, 1, `finger ${fmt(needed)} m`);
    fingerCount++;
  }
  if (layout.fingers.length > 0 && fingerProducts.length === 0) notes.push('No finger series in the price list: the fingers are not priced.');
  if (tooShort > 0) notes.push(`${tooShort} fingers are longer than the longest product of "${choices.fingerSeries}"; the longest is used.`);

  // --- Gangways: one per pier that starts at the shoreline, one per access pontoon -----
  const gangwayProducts = choices.gangwaySeries ? seriesOf(list, 'gangway', choices.gangwaySeries) : [];
  const fromShore = layout.piers.filter(
    (p) => site.shoreline.length >= 2 && distancePointToPolyline(p.start, site.shoreline) <= SHORE_TOLERANCE + p.width / 2,
  ).length;
  const gangways = fromShore + accessPontoonsOf(site).length;
  const wantedGangway = par('gangway_length_m', 6);
  const gangway = pickByLength(gangwayProducts, wantedGangway, vat);
  if (gangways > 0 && gangway) {
    addQty('gangways', gangway.product, gangways, `${fromShore} piers from the shore + ${accessPontoonsOf(site).length} access pontoons`);
    if (!gangway.longEnough) notes.push(`No gangway of "${choices.gangwaySeries}" is ${fmt(wantedGangway)} m long; the longest is used.`);
  }

  // --- Anchoring -----------------------------------------------------------------------
  const lineCount = anchoring.lines.length;
  const smallest = (category: Product['category'], size: (p: Product) => number | null, min: number) => {
    const candidates = list.products.filter((p) => p.category === category && size(p) !== null && priced(p, vat) !== null);
    const enough = candidates.filter((p) => size(p)! >= min).sort((a, b) => size(a)! - size(b)! || priced(a, vat)! - priced(b, vat)!);
    return enough[0] ?? candidates.sort((a, b) => size(b)! - size(a)!)[0] ?? null;
  };
  let missingChain = 0;
  for (const line of anchoring.lines) {
    const chain = line.chainId ? byId.get(line.chainId) : undefined;
    if (chain) addQty('anchoring', chain, line.chainLength, line.id);
    else missingChain++;
    const anchor = line.anchorId ? byId.get(line.anchorId) : undefined;
    if (anchor) addQty('anchoring', anchor, line.anchorCount, line.id);
    const d = chain?.chainDiameterMm ?? 0;
    const shackle = smallest('shackle', (p) => p.shackleMm, d);
    if (shackle) addQty('anchoring', shackle, par('shackles_per_anchor_line', 2), line.id);
    const spring = smallest('spring', (p) => p.chainDiameterMm, d);
    if (spring) addQty('anchoring', spring, par('springs_per_anchor_line', 1), line.id);
    const anode = smallest('anode', (p) => p.chainDiameterMm, d);
    if (anode) addQty('anchoring', anode, par('anodes_per_anchor_line', 1), line.id);
  }
  if (missingChain > 0) notes.push(`${missingChain} anchor lines have no chain strong enough in the price list; their chain is not priced.`);

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
  }
  const ladder = cheapest('ladder');
  const ladders = held.length * par('ladders_per_pier', 1);
  if (ladder && ladders > 0) {
    addQty('fittings', ladder, ladders, `${held.length} piers and access pontoons × ${par('ladders_per_pier', 1)}`);
    smallItems += ladders;
  }
  const perPedestal = par('berths_per_power_pedestal', 0);
  const power = cheapest('power');
  if (power && perPedestal > 0 && berths > 0) {
    const n = Math.ceil(berths / perPedestal);
    addQty('fittings', power, n, `${berths} berths ÷ ${perPedestal}`);
    smallItems += n;
  }

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
  if (diving) addQty('labour', diving, lineCount * par('diver_h_per_anchor_line', 1), `${lineCount} anchor lines × ${par('diver_h_per_anchor_line', 1)} h`);
  if (crane) {
    addQty('plant', crane, moduleCount * par('crane_h_per_pontoon', 1), `lifting: ${moduleCount} pontoons × ${par('crane_h_per_pontoon', 1)} h`);
    addQty('plant', crane, moduleCount * par('transport_h_per_pontoon', 2), `transport: ${moduleCount} pontoons × ${par('transport_h_per_pontoon', 2)} h`);
  }
  if (boat && lineCount > 0) {
    const days = Math.ceil((lineCount / 10) * par('boat_days_per_10_anchor_lines', 1));
    addQty('plant', boat, days, `${lineCount} anchor lines`);
  }

  // --- Lines and totals ----------------------------------------------------------------------
  const lines: BomLine[] = [];
  let missingPrices = 0;
  for (const group of BOM_GROUPS) {
    for (const { product, quantity, basis } of [...acc.values()].filter((e) => e.group === group)) {
      const withMargin = quantity * (1 + product.marginPct / 100);
      const orderQuantity = product.unit === 'pcs' ? Math.ceil(withMargin - 1e-9) : Math.round(withMargin * 10) / 10;
      const unitPrice = priced(product, vat);
      if (unitPrice === null) missingPrices++;
      lines.push({
        group,
        productId: product.id,
        name: product.name,
        supplier: product.supplier,
        unit: product.unit,
        quantity,
        orderQuantity,
        unitPrice,
        total: unitPrice === null ? null : orderQuantity * unitPrice,
        basis: basis.length > 4 ? `${basis.length} items` : basis.join('; '),
        sourceUrl: product.sourceUrl,
        sourceDate: product.sourceDate,
        note: product.note,
      });
    }
  }
  if (missingPrices > 0) notes.push(`${missingPrices} lines have no price; they are not in the totals.`);

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
    missingPrices,
    perBerth: berths > 0 ? totalVat0 / berths : 0,
    perPierMetre: pierMetres > 0 ? totalVat0 / pierMetres : 0,
    notes,
  };
}
