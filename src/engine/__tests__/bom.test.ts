import { describe, expect, it } from 'vitest';
import type { AnchoringResult, AnchorLine } from '../anchoring';
import { costEstimate, excludesNote, moduleCombination, resolveChoices } from '../bom';
import type { PriceList, PriceParameter, Product } from '../catalog';
import { DEFAULT_COST, DEFAULT_PARAMS as DEFAULTS } from '../defaults';

/** The hand-calculated cases were written for a 3.0 m main pier (SPEC §4); D44 made 2.7 m the default. */
const DEFAULT_PARAMS = { ...DEFAULTS, mainPierWidth: 3 };
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
  anchorKind: null,
  capacityHorizontalKn: null,
  capacityUpliftKn: null,
  capacityBasis: null,
  seabeds: [],
  installedPrice: null,
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
    product({ id: 'post', category: 'safety_post', price: 1000 }),
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
    param('ladder_spacing_m', 40),
    param('safety_post_spacing_m', 80),
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
    param('diver_h_per_anchor', 1),
    param('diver_h_per_tonne', 0),
    param('anchors_per_boat_day', 10),
    param('work_boat_max_lift_kg', 3000),
  ],
};
const byId = (id: string) => LIST.products.find((p) => p.id === id)!;

describe('product choices', () => {
  it('automatic: pontoon and finger series by width, gangway series by price at the wanted length', () => {
    // Pier width 3.0 m → S3 (not the cheaper 2.4 m series); finger width 0.8 m → F (0.7 m) rather than Boom (0.4 m);
    // boom width 0.4 m (Y-boom berths, D34) → Boom.
    expect(resolveChoices(LIST, DEFAULT_COST, DEFAULT_PARAMS)).toEqual({
      pontoonSeries: 'S3',
      fingerSeries: 'F',
      boomSeries: 'Boom',
      gangwaySeries: 'G',
      pontoonFreeboard: 0.5,
      // D49: the project's gangway length.
      gangwayLength: 6,
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
    fixing: 'seabed',
    role: 'side',
    fix: { x: 0, y: 0 },
    anchor: { x: 10, y: 0 },
    horizontalKn: 5,
    topTensionKn: 5.2,
    upliftKn: 1,
    upliftAngleDeg: 0,
    dirDeg: 0,
    chainLength: 16.5,
    chainId: 'c13',
    chainFoS: 5,
    chainWeightEstimated: false,
    requiredAnchorKg: 900,
    anchorId: 'a1000',
    anchorKind: 'block',
    anchorCount: 1,
    status: 'OK',
    pileReason: null,
    governing: null,
    loadCases: [],
  });
  const anchoring: AnchoringResult = { lines: [line('A1'), line('A2')], piles: [], loads: [], issues: [] };
  const choices = resolveChoices(LIST, DEFAULT_COST, DEFAULT_PARAMS);
  const estimate = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: LIST, choices, anchoring });
  const lineFor = (id: string) => estimate.lines.find((l) => l.productId === id)!;

  it('pontoons: 30 m → 2 × 12 m + 1 × 8 m = 30 000 €', () => {
    expect(lineFor('p12').orderQuantity).toBe(2);
    expect(lineFor('p8').orderQuantity).toBe(1);
    expect(estimate.byGroup.pontoons).toBe(30000);
    expect(estimate.notes.some((n) => n.includes('P1: 30 m in the layout, built from'))).toBe(true);
  });

  it('booms of Y-boom berths come from the boom series (D34)', () => {
    const withBoom = costEstimate({
      layout: { piers: [pier], fingers: fingers.map((f, i) => (i === 2 ? { ...f, kind: 'boom' as const } : f)), berths },
      site,
      priceList: LIST,
      choices,
      anchoring,
    });
    // The 4.0 m divider is a boom → the 6 m boom product (500 €) instead of the 6 m finger.
    expect(withBoom.lines.find((l) => l.productId === 'boom6')!.orderQuantity).toBe(1);
    expect(withBoom.lines.find((l) => l.productId === 'boom6')!.basis).toBe('boom 4 m');
    expect(withBoom.byGroup.fingers).toBe(2 * 1300 + 500);
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

  it('a pier 4 m off the shore still has its gangway; beyond its reach none (D49)', () => {
    const off = (y: number) => costEstimate({ layout: { piers: [{ ...pier, start: { x: 0, y }, end: { x: 0, y: y + 30 } }], fingers, berths }, site, priceList: LIST, choices, anchoring });
    expect(off(4).lines.find((l) => l.productId === 'g8')!.orderQuantity).toBe(1);
    expect(off(7).lines.some((l) => l.productId === 'g8')).toBe(false);
    // A 5 m gangway asked for: the 5 m product.
    const short = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: LIST, choices: { ...choices, gangwayLength: 5 }, anchoring });
    expect(short.lines.find((l) => l.productId === 'g5')!.orderQuantity).toBe(1);
  });

  it('gangways of an access pontoon (D32): one per placed gangway, else one', () => {
    const withAccess = (gangways?: number[]) =>
      costEstimate({
        layout: { piers: [pier], fingers, berths },
        site: { ...site, accessPontoons: [{ id: 'access-1', start: { x: -40, y: 50 }, end: { x: -10, y: 50 }, width: 2, ...(gangways ? { gangways } : {}) }] },
        priceList: LIST,
        choices,
        anchoring,
      }).lines.find((l) => l.productId === 'g8')!;
    expect(withAccess().orderQuantity).toBe(2);
    expect(withAccess([5, 25]).orderQuantity).toBe(3);
    expect(withAccess([5, 25]).basis).toBe('P1: 4 berths → at least 0.9 m clear (AS 3962 Table 3.3); access-1: 0 berths → at least 0.7 m clear (AS 3962 Table 3.3); access-1: 0 berths → at least 0.7 m clear (AS 3962 Table 3.3)');
  });

  it('gangway widths by AS 3962 Table 3.3 (I109): the selected series if wide enough, else the cheapest wide enough one', () => {
    const wide = { ...LIST, products: [...LIST.products, product({ id: 'w15', category: 'gangway', series: 'W', price: 2000, lengthM: 8, widthM: 1.5 })].map((p) => (p.category === 'gangway' && p.widthM === null ? { ...p, widthM: 0.8 } : p)) };
    const run = (served: number) => {
      const many = Array.from({ length: served }, (_, i) => ({ ...berths[0]!, id: `b${i}` }));
      return costEstimate({ layout: { piers: [pier], fingers, berths: many }, site, priceList: wide, choices, anchoring });
    };
    // 4 berths: 0.9 m → the 0.8 m series is too narrow, the 1.5 m gangway is used.
    const four = run(4);
    expect(four.lines.find((l) => l.productId === 'w15')?.orderQuantity).toBe(1);
    expect(four.lines.find((l) => l.productId === 'g8')).toBeUndefined();
    expect(four.notes.some((n) => n.startsWith('Gangway widths: the product width is taken as the clear width'))).toBe(true);
    // 2 berths: 0.7 m → the selected 0.8 m series is enough.
    expect(run(2).lines.find((l) => l.productId === 'g8')?.orderQuantity).toBe(1);
    // 130 berths: 1.8 m → none is wide enough: not priced with a narrower one (D62), listed as unpriced.
    const many = run(130);
    expect(many.lines.some((l) => l.group === 'gangways')).toBe(false);
    expect(many.notes.find((n) => n.startsWith('No gangway in the price list is as wide'))).toBe(
      'No gangway in the price list is as wide as AS 3962 Table 3.3 asks for P1 (130 berths, 1.8 m); it is not priced (see the unpriced items).',
    );
    expect(many.unpriced).toContainEqual({
      name: 'Gangway for P1, at least 1.8 m clear (AS 3962 Table 3.3, 130 berths)',
      quantity: 1,
      unit: 'pcs',
      reason: 'No gangway in the price list is 1.8 m wide or wider (widest 1.5 m); not priced with a narrower one.',
    });
    expect(many.byGroup.gangways).toBe(0);
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

  it('fittings: 4 berths × 2 cleats + 1 ladder + 1 safety post (30 m pier: one of each, D65) = 1 380 € (a removed berth does not count)', () => {
    expect(lineFor('cleat').orderQuantity).toBe(8);
    expect(lineFor('ladder').orderQuantity).toBe(1);
    expect(lineFor('post').orderQuantity).toBe(1);
    expect(estimate.byGroup.fittings).toBe(1380);
    expect(estimate.equipment.items.map((x) => [x.id, x.t])).toEqual([
      ['P1-LAD1', 15],
      ['P1-SP1', 15],
    ]);
  });

  it('labour and plant from the output rates', () => {
    // Installer: 3 modules × 4 h + 3 fingers × 1.5 h + 1 gangway × 3 h + 10 small items (8 cleats, a ladder,
    // a safety post) × 0.25 h = 22.0 h (quantities in units other than pieces round to 0.1).
    expect(lineFor('rate-installer').quantity).toBeCloseTo(22, 9);
    expect(lineFor('rate-installer').orderQuantity).toBe(22);
    expect(lineFor('rate-diving-team').quantity).toBe(2);
    expect(estimate.labour).toBeCloseTo(2200 + 400, 9);
    expect(lineFor('rate-diving-team').basis).toBe('2 anchors × 1 h');
    // Crane: 3 h lifting + 6 h transport = 9 h; work boat ⌈2 anchors / 10 per day⌉ = 1 day.
    expect(lineFor('rate-crane').quantity).toBe(9);
    expect(lineFor('rate-work-boat').orderQuantity).toBe(1);
    expect(estimate.plant).toBeCloseTo(900 + 800, 9);
  });

  it('shore chains (D28): one wall fixing each, no anchor, no work-boat time', () => {
    const wall = (id: string): AnchorLine => ({ ...line(id), fixing: 'wall', role: 'shore', anchorKind: null, anchorId: null, anchorCount: 0, requiredAnchorKg: 0, chainLength: 3 });
    const withWall: AnchoringResult = { lines: [line('A1'), wall('S1'), wall('S2')], piles: [], loads: [], issues: [] };
    const list: PriceList = { ...LIST, products: [...LIST.products, product({ id: 'wf', category: 'wall_fixing', price: 18 })] };
    const e = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: list, choices, anchoring: withWall });
    const of = (id: string) => e.lines.find((l) => l.productId === id)!;
    expect(of('wf').orderQuantity).toBe(2);
    expect(of('a1000').orderQuantity).toBe(1);
    // Chain 16.5 + 2 × 3 = 22.5 m; divers for the anchor and the 2 wall fixings; the boat for the 1 anchor.
    expect(of('c13').quantity).toBeCloseTo(22.5, 9);
    expect(of('rate-diving-team').quantity).toBe(3);
    expect(of('rate-diving-team').basis).toBe('1 anchor + 2 wall fixings × 1 h');
    expect(of('rate-work-boat').basis).toBe('1 anchor ÷ 10 per day');
    const noFixing = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: LIST, choices, anchoring: withWall });
    expect(noFixing.notes).toContain('No wall fixing in the price list: the wall fixings of the shore chains are not priced.');
  });

  it('installation scales with the anchors, not the lines (D62)', () => {
    const many: AnchoringResult = { lines: Array.from({ length: 23 }, (_, i) => line(`A${i + 1}`)), piles: [], loads: [], issues: [] };
    const tonnes: PriceList = { ...LIST, parameters: LIST.parameters.map((p) => (p.key === 'diver_h_per_tonne' ? param('diver_h_per_tonne', 0.5) : p)) };
    const e = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: tonnes, choices, anchoring: many });
    const of = (id: string) => e.lines.find((l) => l.productId === id)!;
    // 23 anchors of 1 t: 23 × 1 h + 23 t × 0.5 h/t = 34.5 h; ⌈23 / 10⌉ = 3 boat days.
    expect(of('rate-diving-team').quantity).toBeCloseTo(34.5, 9);
    expect(of('rate-diving-team').basis).toBe('23 anchors × 1 h + 23 t × 0.5 h/t');
    expect(of('rate-work-boat').quantity).toBe(3);
    // D64: pile lines (no pile anchor in the list) take no diving or boat time; their piles are not priced.
    const bad: AnchorLine = { ...line('X1'), anchorId: null, anchorKind: 'pile', anchorCount: 1, status: 'PILE', pileReason: 'block: needs 4 000 kg, max product 1 000 kg', requiredAnchorKg: 4000 };
    const mixed = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: LIST, choices, anchoring: { ...anchoring, lines: [line('A1'), bad, { ...bad, id: 'X2' }] } });
    const m = (id: string) => mixed.lines.find((l) => l.productId === id)!;
    expect(m('rate-diving-team').quantity).toBe(1);
    expect(m('rate-work-boat').basis).toBe('1 anchor ÷ 10 per day');
    expect(m('a1000').orderQuantity).toBe(1);
    // Their chains are priced: 3 × 16.5 m + 5 %.
    expect(m('c13').quantity).toBeCloseTo(49.5, 9);
    expect(m('pile-anchor-by-design')).toMatchObject({ name: 'Pile anchor – length and section by geotechnical design', quantity: 2, unitPrice: null, total: null, basis: '2 lines with pile anchors (P1)' });
    expect(m('pile-anchor-by-design').note).toContain('block: needs 4 000 kg, max product 1 000 kg');
    // A pile anchor of the price list (supply price only): priced, its driving listed as unpriced.
    const withPile: PriceList = { ...LIST, products: [...LIST.products, product({ id: 'pile1', category: 'anchor', anchorKind: 'pile', price: 2500 })] };
    const piled = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: withPile, choices, anchoring: { ...anchoring, lines: [line('A1'), { ...bad, anchorId: 'pile1' }] } });
    expect(piled.lines.find((l) => l.productId === 'pile1')).toMatchObject({ orderQuantity: 1, unitPrice: 2500 });
    expect(piled.unpriced).toContainEqual({ name: 'Pile driving', quantity: 1, unit: 'pcs', reason: 'The pile anchors of the price list have a supply price only; driving them needs a contractor’s price.' });
    expect(piled.lines.find((l) => l.productId === 'rate-diving-team')!.quantity).toBe(1);
  });

  it('anchors heavier than the work boat lifts are flagged; installed anchors take no diving or boat time (D62)', () => {
    const heavy: PriceList = { ...LIST, parameters: LIST.parameters.map((p) => (p.key === 'work_boat_max_lift_kg' ? param('work_boat_max_lift_kg', 800) : p)) };
    const e = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: heavy, choices, anchoring });
    expect(e.notes).toContain('2 anchors (up to 1 000 kg) are heavier than the work boat lifts (work_boat_max_lift_kg 800 kg): a heavier crane barge is needed; its cost is not in the estimate.');
    expect(estimate.notes.some((n) => n.includes('heavier than the work boat'))).toBe(false);
    const installed: PriceList = { ...LIST, products: LIST.products.map((p) => (p.id === 'a1000' ? { ...p, installedPrice: 900 } : p)) };
    const i = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: installed, choices, anchoring });
    const a = i.lines.find((l) => l.productId === 'a1000')!;
    expect(a).toMatchObject({ name: 'a1000 (installed)', unitPrice: 900, total: 1800 });
    expect(a.note).toMatch(/^Installed price: supply and installation\./);
    expect(i.lines.some((l) => l.productId === 'rate-diving-team' || l.productId === 'rate-work-boat')).toBe(false);
    expect(i.notes).toContain('2 anchors are priced installed (supply and installation); no diving or work-boat time is added for them.');
  });

  it('older price lists: the per-line installation keys are read per anchor, with a note (D62)', () => {
    const old: PriceList = {
      ...LIST,
      parameters: [
        ...LIST.parameters.filter((p) => !['diver_h_per_anchor', 'anchors_per_boat_day'].includes(p.key)),
        param('diver_h_per_anchor_line', 2),
        param('boat_days_per_10_anchor_lines', 1),
      ],
    };
    const e = costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: old, choices, anchoring });
    expect(e.lines.find((l) => l.productId === 'rate-diving-team')!.quantity).toBe(4);
    expect(e.notes.some((n) => n.startsWith('The price list has the older installation keys diver_h_per_anchor_line, boat_days_per_10_anchor_lines'))).toBe(true);
  });

  it('every unpriced item is listed by name and left out of the totals (D62)', () => {
    expect(estimate.unpriced).toEqual([]);
    expect(excludesNote(estimate)).toBe('');
    // A breakwater (no price), a pile line, a product without a price and products missing from the list.
    const withBreakwater: Site = { ...site, breakwaters: [{ id: 'breakwater-1', start: { x: -40, y: 55 }, end: { x: 40, y: 55 }, product: '4300K' }] };
    const bad: AnchorLine = { ...line('X1'), anchorId: null, anchorKind: 'pile', anchorCount: 1, status: 'PILE', pileReason: 'block: needs 4 000 kg, max product 1 000 kg', requiredAnchorKg: 4000 };
    const thin: PriceList = {
      ...LIST,
      products: LIST.products.filter((p) => !['spring14', 'ladder', 'post'].includes(p.id)).map((p) => (p.id === 'anode16' ? { ...p, price: null } : p)),
    };
    const e = costEstimate({ layout: { piers: [pier], fingers, berths }, site: withBreakwater, priceList: thin, choices, anchoring: { ...anchoring, lines: [line('A1'), bad] } });
    const names = e.unpriced.map((u) => u.name);
    expect(names).toEqual([
      expect.stringMatching(/^Breakwater breakwater-1: Marinetek K-series Breakwater 4300K, \d+ × \S+/),
      'Pile anchor – length and section by geotechnical design',
      'Spring links of the anchor lines',
      'Chain anodes of the anchor lines',
      'Rescue ladders',
      'Safety equipment posts',
    ]);
    expect(e.unpriced[0]).toMatchObject({ unit: 'pcs', reason: expect.stringContaining('No breakwater in the price list') });
    expect(e.unpriced[2]).toEqual({ name: 'Spring links of the anchor lines', quantity: 2, unit: 'pcs', reason: 'No spring with a size and a price in the price list.' });
    // The anode without a price is a product without a price, not a missing product: no anode line in the BOM.
    expect(e.lines.some((l) => l.productId === 'anode16')).toBe(false);
    expect(e.missingPrices).toBe(6);
    expect(excludesNote(e)).toBe(' (excludes 6 unpriced items, see list)');
    expect(excludesNote({ unpriced: e.unpriced.slice(0, 1) })).toBe(' (excludes 1 unpriced item, see list)');
    expect(e.notes).toContain('6 items without a price are not in the totals: see the list of unpriced items.');
    // Not in the totals: the breakwater and the anchor point add nothing.
    expect(e.byGroup.pontoons).toBe(estimate.byGroup.pontoons);
    // A missing rate row is an unpriced item too.
    const noBoat: PriceList = { ...LIST, products: LIST.products.filter((p) => p.id !== 'rate-work-boat') };
    expect(costEstimate({ layout: { piers: [pier], fingers, berths }, site, priceList: noBoat, choices, anchoring }).unpriced).toEqual([
      { name: 'Work-boat days', quantity: 1, unit: 'day', reason: 'The price list has no row "rate-work-boat".' },
    ]);
  });

  it('totals: overheads 10 %, contingency 15 %, VAT 25.5 %, range −30 … +50 %', () => {
    // materials 30 000 + 3 600 + 1 200 + 1 223 + 1 380 = 37 403; labour 2 600; plant 1 700
    // subtotal 41 703; overheads 4 170.3; contingency 0.15 · 45 873.3 = 6 880.995
    // total 52 754.295; VAT 0.255 · total = 13 452.345225
    expect(estimate.materials).toBeCloseTo(37403, 6);
    expect(estimate.subtotal).toBeCloseTo(41703, 6);
    expect(estimate.overhead).toBeCloseTo(4170.3, 6);
    expect(estimate.contingency).toBeCloseTo(6880.995, 6);
    expect(estimate.totalVat0).toBeCloseTo(52754.295, 6);
    expect(estimate.vat).toBeCloseTo(13452.345225, 4);
    expect(estimate.totalWithVat).toBeCloseTo(66206.640225, 4);
    expect(estimate.range[0]).toBeCloseTo(36928.0065, 3);
    expect(estimate.range[1]).toBeCloseTo(79131.4425, 3);
    expect(estimate.perBerth).toBeCloseTo(52754.295 / 4, 6);
    expect(estimate.perPierMetre).toBeCloseTo(52754.295 / 30, 6);
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
