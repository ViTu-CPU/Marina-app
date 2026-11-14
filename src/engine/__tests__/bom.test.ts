import { describe, expect, it } from 'vitest';
import type { AnchoringResult, AnchorLine } from '../anchoring';
import { costEstimate, moduleCombination, resolveChoices } from '../bom';
import type { PriceList, PriceParameter, Product } from '../catalog';
import { DEFAULT_COST, DEFAULT_PARAMS } from '../defaults';
import type { Berth, Finger, MainPier, Site } from '../model';

const product = (p: Partial<Product> & Pick<Product, 'id' | 'category' | 'price'>): Product => ({
  supplier: 'S',
  series: '',
  name: p.id,
  code: '',
  unit: 'pcs',
  priceIncludesVat: false,
  marginPct: 0,
  lengthM: null,
  widthM: null,
  weightKg: null,
  capacityKg: null,
  freeboardM: null,
  chainDiameterMm: null,
  chainGrade: '',
  breakingLoadKn: null,
  massKgPerM: null,
  anchorMassKg: null,
  shackleMm: null,
  sourceUrl: 'https://example.org',
  sourceDate: '2026-11-14',
  note: '',
  ...p,
});
const param = (key: string, value: number): PriceParameter => ({ key, value, unit: '', description: '', source: '' });

/** All prices VAT 0 %. */
const LIST: PriceList = {
  title: 'test',
  products: [
    product({ id: 'p8', category: 'pontoon', series: 'S3', price: 8000, lengthM: 8, widthM: 3, freeboardM: 0.5 }),
    product({ id: 'p12', category: 'pontoon', series: 'S3', price: 11000, lengthM: 12, widthM: 3, freeboardM: 0.5 }),
    product({ id: 'q12', category: 'pontoon', series: 'S24', price: 9000, lengthM: 12, widthM: 2.4, freeboardM: 0.45 }),
    product({ id: 'f6', category: 'finger', series: 'F', price: 1000, lengthM: 6, widthM: 0.7 }),
    product({ id: 'f8', category: 'finger', series: 'F', price: 1300, lengthM: 8, widthM: 0.7 }),
    product({ id: 'f10', category: 'finger', series: 'F', price: 1600, lengthM: 10, widthM: 0.7 }),
    product({ id: 'boom6', category: 'finger', series: 'Boom', price: 500, lengthM: 6, widthM: 0.4 }),
    product({ id: 'g5', category: 'gangway', series: 'G', price: 700, lengthM: 5 }),
    product({ id: 'g8', category: 'gangway', series: 'G', price: 1200, lengthM: 8 }),
    product({ id: 'c13', category: 'chain', unit: 'm', price: 10, marginPct: 5, chainDiameterMm: 13, breakingLoadKn: 61.8, massKgPerM: 3.1 }),
    product({ id: 'a1000', category: 'anchor', price: 300, anchorMassKg: 1000 }),
    product({ id: 's13', category: 'shackle', price: 14, shackleMm: 13 }),
    product({ id: 's16', category: 'shackle', price: 17, shackleMm: 16 }),
    product({ id: 'spring14', category: 'spring', price: 60, chainDiameterMm: 14 }),
    product({ id: 'anode16', category: 'anode', price: 50, chainDiameterMm: 16 }),
    product({ id: 'cleat', category: 'cleat', price: 10 }),
    product({ id: 'ladder', category: 'ladder', price: 300 }),
    product({ id: 'rate-installer', category: 'labour', unit: 'h', price: 100 }),
    product({ id: 'rate-diving-team', category: 'labour', unit: 'h', price: 200 }),
    product({ id: 'rate-crane', category: 'plant', unit: 'h', price: 100 }),
    product({ id: 'rate-work-boat', category: 'plant', unit: 'day', price: 800 }),
  ],
  parameters: [
    param('vat_pct', 25.5),
    param('site_overhead_pct', 10),
    param('contingency_pct', 15),
    param('range_low_pct', -30),
    param('range_high_pct', 50),
    param('gangway_length_m', 6),
    param('cleats_per_berth', 2),
    param('ladders_per_pier', 1),
    param('berths_per_power_pedestal', 0),
    param('shackles_per_anchor_line', 2),
    param('springs_per_anchor_line', 1),
    param('anodes_per_anchor_line', 1),
    param('crane_h_per_pontoon', 1),
    param('transport_h_per_pontoon', 2),
    param('crew_h_per_pontoon', 4),
    param('crew_h_per_finger', 1.5),
    param('crew_h_per_gangway', 3),
    param('crew_h_per_small_item', 0.25),
    param('diver_h_per_anchor_line', 1),
    param('boat_days_per_10_anchor_lines', 1),
  ],
};
const byId = (id: string) => LIST.products.find((p) => p.id === id)!;

describe('product choices', () => {
  it('automatic: pontoon and finger series by width, gangway series by price at the wanted length', () => {
    // Pier width 3.0 m → S3 (not the cheaper 2.4 m series); finger width 0.8 m → F (0.7 m) rather than Boom (0.4 m).
    expect(resolveChoices(LIST, DEFAULT_COST, DEFAULT_PARAMS)).toEqual({
      pontoonSeries: 'S3',
      fingerSeries: 'F',
      gangwaySeries: 'G',
      pontoonFreeboard: 0.5,
    });
    expect(resolveChoices(LIST, DEFAULT_COST, { ...DEFAULT_PARAMS, mainPierWidth: 2.4 }).pontoonSeries).toBe('S24');
  });

  it('a chosen series is kept when it exists', () => {
    const chosen = resolveChoices(LIST, { ...DEFAULT_COST, pontoonSeries: 'S24', fingerSeries: 'Boom' }, DEFAULT_PARAMS);
    expect(chosen.pontoonSeries).toBe('S24');
    expect(chosen.fingerSeries).toBe('Boom');
    expect(chosen.pontoonFreeboard).toBe(0.45);
    expect(resolveChoices(LIST, { ...DEFAULT_COST, pontoonSeries: 'gone' }, DEFAULT_PARAMS).pontoonSeries).toBe('S3');
  });
});

describe('pontoon modules', () => {
  const modules = [byId('p8'), byId('p12')];
  it.each([
    // 30 m: 2 × 12 + 8 = 32 m for 30 000 € beats 4 × 8 (32 000 €) and 3 × 12 (33 000 €).
    [30, { p12: 2, p8: 1 }],
    // 20 m: 12 + 8 (19 000 €) beats 2 × 12 (22 000 €) and 3 × 8 (24 000 €).
    [20, { p12: 1, p8: 1 }],
    // 24 m: 2 × 12 (22 000 €) beats 3 × 8 (24 000 €).
    [24, { p12: 2 }],
    // 7.97 m counts as 8 m (0.05 m tolerance).
    [7.97, { p8: 1 }],
  ])('%s m', (length, expected) => {
    const combo = moduleCombination(length, modules, 25.5)!;
    expect(Object.fromEntries([...combo].map(([p, n]) => [p.id, n]))).toEqual(expected);
  });
});

describe('cost estimate, hand-calculated', () => {
  const pier: MainPier = { id: 'P1', start: { x: 0, y: 0 }, end: { x: 0, y: 30 }, width: 3, locked: false, origin: 'manual' };
  // Fingers of 7.2, 7.2 and 4.0 m (extent square to the pier, i.e. along x).
  const finger = (id: string, y: number, length: number): Finger => ({
    id,
    pierId: 'P1',
    shape: [{ x: -1.5, y }, { x: -1.5, y: y + 0.8 }, { x: -1.5 - length, y: y + 0.8 }, { x: -1.5 - length, y }],
  });
  const fingers = [finger('F1', 0, 7.2), finger('F2', 10, 7.2), finger('F3', 20, 4)];
  const berth = (id: string, removed = false): Berth => ({
    id,
    pierId: 'P1',
    side: 'left',
    boatClassId: 'c9',
    slot: [],
    boat: [],
    removed,
    issues: [],
  });
  const berths = [berth('B1'), berth('B2'), berth('B3'), berth('B4'), berth('B5', true)];
  const site: Site = {
    water: [{ x: -50, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 60 }, { x: -50, y: 60 }],
    shoreline: [{ x: -50, y: 0 }, { x: 50, y: 0 }],
    entrance: { a: { x: -50, y: 60 }, b: { x: 50, y: 60 } },
    obstacles: [],
    zones: [],
  };
  const line = (id: string): AnchorLine => ({
    id,
    holdsId: 'P1',
    splay: 'none',
    governs: 'across',
    fix: { x: 0, y: 0 },
    anchor: { x: 10, y: 0 },
    horizontalKn: 5,
    topTensionKn: 5.2,
    upliftKn: 1,
    upliftAngleDeg: 0,
    anchorType: 'block',
    chainLength: 16.5,
    chainId: 'c13',
    requiredAnchorKg: 900,
    anchorId: 'a1000',
    anchorCount: 1,
  });
  const anchoring: AnchoringResult = { lines: [line('A1'), line('A2')], loads: [], issues: [] };
  const choices = resolveChoices(LIST, DEFAULT_COST, DEFAULT_PARAMS);
  const estimate = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: LIST, choices, anchoring });
  const lineFor = (id: string) => estimate.lines.find((l) => l.productId === id)!;

  it('pontoons: 30 m → 2 × 12 m + 1 × 8 m = 30 000 €', () => {
    expect(lineFor('p12').orderQuantity).toBe(2);
    expect(lineFor('p8').orderQuantity).toBe(1);
    expect(estimate.byGroup.pontoons).toBe(30000);
    expect(estimate.notes.some((n) => n.includes('P1: 30 m in the layout, built from'))).toBe(true);
  });

  it('fingers: 7.2 m → 8 m product (×2), 4.0 m → 6 m product = 3 600 €', () => {
    expect(lineFor('f8').orderQuantity).toBe(2);
    expect(lineFor('f6').orderQuantity).toBe(1);
    expect(estimate.byGroup.fingers).toBe(3600);
  });

  it('gangway: one pier from the shore; 6 m wanted → 8 m product = 1 200 €', () => {
    expect(lineFor('g8').orderQuantity).toBe(1);
    expect(estimate.byGroup.gangways).toBe(1200);
  });

  it('anchoring: chain 2 × 16.5 m + 5 % = 34.7 m; anchors, shackles, springs, anodes = 1 223 €', () => {
    expect(lineFor('c13').quantity).toBeCloseTo(33, 9);
    expect(lineFor('c13').orderQuantity).toBe(34.7);
    expect(lineFor('c13').total).toBeCloseTo(347, 9);
    expect(lineFor('a1000').orderQuantity).toBe(2);
    expect(lineFor('s13').orderQuantity).toBe(4); // smallest shackle ≥ 13 mm
    expect(lineFor('spring14').orderQuantity).toBe(2);
    expect(lineFor('anode16').orderQuantity).toBe(2);
    expect(estimate.byGroup.anchoring).toBeCloseTo(347 + 600 + 56 + 120 + 100, 9);
  });

  it('fittings: 4 berths × 2 cleats + 1 ladder = 380 € (a removed berth does not count)', () => {
    expect(lineFor('cleat').orderQuantity).toBe(8);
    expect(lineFor('ladder').orderQuantity).toBe(1);
    expect(estimate.byGroup.fittings).toBe(380);
  });

  it('labour and plant from the output rates', () => {
    // Installer: 3 modules × 4 h + 3 fingers × 1.5 h + 1 gangway × 3 h + 9 small items × 0.25 h
    // = 21.75 h, ordered as 21.8 h (quantities in units other than pieces round to 0.1).
    expect(lineFor('rate-installer').quantity).toBeCloseTo(21.75, 9);
    expect(lineFor('rate-installer').orderQuantity).toBe(21.8);
    expect(lineFor('rate-diving-team').quantity).toBe(2);
    expect(estimate.labour).toBeCloseTo(2180 + 400, 9);
    // Crane: 3 h lifting + 6 h transport = 9 h; work boat ⌈2/10 · 1⌉ = 1 day.
    expect(lineFor('rate-crane').quantity).toBe(9);
    expect(lineFor('rate-work-boat').orderQuantity).toBe(1);
    expect(estimate.plant).toBeCloseTo(900 + 800, 9);
  });

  it('totals: overheads 10 %, contingency 15 %, VAT 25.5 %, range −30 … +50 %', () => {
    // materials 30 000 + 3 600 + 1 200 + 1 223 + 380 = 36 403; labour 2 580; plant 1 700
    // subtotal 40 683; overheads 4 068.3; contingency 0.15 · 44 751.3 = 6 712.695
    // total 51 463.995; VAT 0.255 · total = 13 123.318725
    expect(estimate.materials).toBeCloseTo(36403, 6);
    expect(estimate.subtotal).toBeCloseTo(40683, 6);
    expect(estimate.overhead).toBeCloseTo(4068.3, 6);
    expect(estimate.contingency).toBeCloseTo(6712.695, 6);
    expect(estimate.totalVat0).toBeCloseTo(51463.995, 6);
    expect(estimate.vat).toBeCloseTo(13123.318725, 4);
    expect(estimate.totalWithVat).toBeCloseTo(64587.313725, 4);
    expect(estimate.range[0]).toBeCloseTo(36024.7965, 3);
    expect(estimate.range[1]).toBeCloseTo(77195.9925, 3);
    expect(estimate.perBerth).toBeCloseTo(51463.995 / 4, 6);
    expect(estimate.perPierMetre).toBeCloseTo(51463.995 / 30, 6);
    expect(estimate.missingPrices).toBe(0);
  });

  it('every line keeps its source', () => {
    for (const l of estimate.lines) expect(l.sourceUrl).toBe('https://example.org');
  });

  it('a product without a price is listed but left out of the totals', () => {
    const unpriced: PriceList = { ...LIST, products: LIST.products.map((p) => (p.id === 'cleat' ? { ...p, price: null } : p)) };
    const e = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: unpriced, choices, anchoring });
    // The cleat is no longer the cheapest priced cleat; with none priced there is no cleat line.
    expect(e.lines.some((l) => l.productId === 'cleat')).toBe(false);
    const noPontoonPrice: PriceList = { ...LIST, products: LIST.products.map((p) => (p.id === 'p8' ? { ...p, price: null } : p)) };
    const e2 = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: noPontoonPrice, choices, anchoring });
    // Without a price for 8 m modules, 30 m is covered by 3 × 12 m.
    expect(e2.lines.find((l) => l.productId === 'p12')!.orderQuantity).toBe(3);
    expect(e2.missingPrices).toBe(0);
  });
});
