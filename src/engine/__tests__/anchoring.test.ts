import { describe, expect, it } from 'vitest';
import {
  anchoringPlan,
  chainLengthFor,
  chainLine,
  chooseAnchor,
  chooseChain,
  DEFAULT_ANCHORING,
  requiredAnchorMass,
  type AnchoringParams,
} from '../anchoring';
import type { PriceList, Product } from '../catalog';
import type { Berth, BoatClass, MainPier, Site } from '../model';

const product = (p: Partial<Product> & Pick<Product, 'id' | 'category'>): Product => ({
  supplier: '',
  series: '',
  name: p.id,
  code: '',
  unit: 'pcs',
  price: 1,
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
  sourceUrl: '',
  sourceDate: '',
  note: '',
  ...p,
});

/** Two chains and three anchors; prices VAT 0 %. */
const LIST: PriceList = {
  title: 'test',
  parameters: [],
  products: [
    product({ id: 'c13', category: 'chain', unit: 'm', price: 10, chainDiameterMm: 13, breakingLoadKn: 61.8, massKgPerM: 3.1 }),
    product({ id: 'c16', category: 'chain', unit: 'm', price: 12, chainDiameterMm: 16, breakingLoadKn: 98.1, massKgPerM: 4.5 }),
    product({ id: 'c20-no-mbl', category: 'chain', unit: 'm', price: 5, chainDiameterMm: 20, massKgPerM: 7 }),
    product({ id: 'a1000', category: 'anchor', price: 300, anchorMassKg: 1000 }),
    product({ id: 'a2000', category: 'anchor', price: 480, anchorMassKg: 2000 }),
    product({ id: 'a3000', category: 'anchor', price: 700, anchorMassKg: 3000 }),
  ],
};

describe('chain line (catenary)', () => {
  it('part of the chain on the bottom: hand calculation', () => {
    // h = 5 m, w = 100 N/m, H = 10 kN → a = 100 m; touching length √(25 + 1000) = 32.016 m.
    // L = 40 m: span = 100 · acosh(1.05) + (40 − 32.016) = 31.492 + 7.984 = 39.477 m;
    // T = 10 000 + 100 · 5 = 10 500 N; no uplift.
    const line = chainLine(5, 40, 10000, 100);
    expect(line.touchesBottom).toBe(true);
    expect(line.span).toBeCloseTo(100 * Math.acosh(1.05) + 40 - Math.sqrt(1025), 9);
    expect(line.span).toBeCloseTo(39.477, 3);
    expect(line.topTension).toBe(10500);
    expect(line.uplift).toBe(0);
  });

  it('hanging between both ends: the curve closes on length and height', () => {
    const [h, L, H, w] = [5, 15, 10000, 100];
    const line = chainLine(h, L, H, w);
    expect(line.touchesBottom).toBe(false);
    const a = H / w;
    const x0 = line.span / 2 - a * Math.atanh(h / L); // lowest point of the catenary
    const sinhA = Math.sinh(-x0 / a);
    const sinhT = Math.sinh((line.span - x0) / a);
    expect(a * (sinhT - sinhA)).toBeCloseTo(L, 9); // arc length
    expect(a * (Math.cosh((line.span - x0) / a) - Math.cosh(-x0 / a))).toBeCloseTo(h, 9); // height
    expect(line.uplift).toBeCloseTo(H * sinhA, 6);
    expect(line.uplift).toBeGreaterThan(0);
    expect(line.topTension).toBeCloseTo(Math.hypot(H, H * sinhT), 6);
    expect(line.topTension).toBeCloseTo(Math.hypot(H, line.uplift + w * L), 6); // vertical balance
  });

  it('is continuous where the chain just touches the bottom', () => {
    const touching = Math.sqrt(25 + 2 * 5 * 100);
    const below = chainLine(5, touching - 1e-6, 10000, 100);
    const above = chainLine(5, touching + 1e-6, 10000, 100);
    expect(below.uplift).toBeCloseTo(0, 3);
    expect(below.span).toBeCloseTo(above.span, 3);
    expect(below.topTension).toBeCloseTo(above.topTension, 1);
  });

  it('chain length: factor × depth, at least depth + 1 m', () => {
    expect(chainLengthFor(5.5, DEFAULT_ANCHORING)).toBeCloseTo(16.5, 9);
    expect(chainLengthFor(5.5, { ...DEFAULT_ANCHORING, chainLengthFactor: 1 })).toBeCloseTo(6.5, 9);
  });
});

describe('anchor mass and product choice', () => {
  it('required mass: SF · (H/μ + V) / (g · (1 − ρw/ρc))', () => {
    // H = 10 kN, clay μ = 0.3, SF 1.5: 50 kN submerged → 50 000 / (9.81 · (1 − 1000/2400)) = 8 737 kg.
    expect(requiredAnchorMass(10000, 0, DEFAULT_ANCHORING)).toBeCloseTo(50000 / (9.81 * (1 - 1000 / 2400)), 6);
    expect(requiredAnchorMass(10000, 0, DEFAULT_ANCHORING)).toBeCloseTo(8737.4, 1);
    // With 2 kN uplift: 1.5 · (33 333 + 2 000) = 53 000 N → 9 262 kg. Sand (μ 0.6) halves the sliding part.
    expect(requiredAnchorMass(10000, 2000, DEFAULT_ANCHORING)).toBeCloseTo(53000 / 5.7225, 1);
    expect(requiredAnchorMass(10000, 0, { ...DEFAULT_ANCHORING, seabed: 'sand' })).toBeCloseTo(4368.7, 1);
  });

  it('the cheapest chain that holds the load with the safety factor and corrosion allowance', () => {
    // h = 5.5 m, L = 16.5 m. 13 mm: 61.8 kN · (11/13)² = 44.2 kN effective. For H = 10 kN
    // the top tension is about 10.8 kN → 3 · 10.8 = 32.4 kN ≤ 44.2 → 13 mm (cheaper) is chosen.
    const small = chooseChain(10000, 5.5, DEFAULT_ANCHORING, LIST, 25.5)!;
    expect(small.product.id).toBe('c13');
    expect(small.length).toBeCloseTo(16.5, 9);
    expect(3 * small.topTension).toBeLessThanOrEqual(61.8e3 * (11 / 13) ** 2);
    // For H = 15 kN the 13 mm chain is too weak (3 · ≥15 kN > 44.2 kN): 16 mm.
    expect(chooseChain(15000, 5.5, DEFAULT_ANCHORING, LIST, 25.5)!.product.id).toBe('c16');
    // Nothing holds 30 kN: 16 mm gives 98.1 · (14/16)² = 75.1 kN < 3 · 30 kN.
    expect(chooseChain(30000, 5.5, DEFAULT_ANCHORING, LIST, 25.5)).toBeNull();
  });

  it('a chain without a published breaking load is never chosen', () => {
    const onlyUnrated: PriceList = { ...LIST, products: LIST.products.filter((p) => p.id === 'c20-no-mbl') };
    expect(chooseChain(100, 5, DEFAULT_ANCHORING, onlyUnrated, 25.5)).toBeNull();
  });

  it('the cheapest anchor heavy enough, otherwise several of the heaviest', () => {
    expect(chooseAnchor(900, LIST, 25.5)).toEqual({ product: LIST.products[3], count: 1 });
    expect(chooseAnchor(1500, LIST, 25.5)!.product.id).toBe('a2000');
    expect(chooseAnchor(8737, LIST, 25.5)).toEqual({ product: LIST.products[5], count: 3 });
  });
});

describe('anchoring plan of a pier', () => {
  /**
   * Pier 30 m × 3 m, freeboard 0.5 m, four 10 m × 3.5 m boats on its left side.
   * q = ½ · 1.25 · 22² = 302.5 Pa; Cd = 1.2; boat profile 0.25 · 10 = 2.5 m → 25 m² each.
   * Across: max(100 + 0.2 · 0, 0 + 0.2 · 100) + 30 · 0.5 = 115 m² → 302.5 · 1.2 · 115 = 41 745 N.
   * Along: pier end 3 · 0.5 = 1.5 m² + first boat 3.5 · 2.5 = 8.75 m² + 3 · 0.2 · 8.75
   *        = 15.5 m² → 5 626.5 N.
   * Pairs: max(2, ⌈30/12⌉ + 1) = 4 → 8 lateral lines of 41 745 / 4 = 10 436 N.
   * Axial: 2 lines of 5 626.5 / 2 / cos 30° = 3 248 N.
   */
  const pier: MainPier = { id: 'P1', start: { x: 0, y: 0 }, end: { x: 0, y: 30 }, width: 3, locked: false, origin: 'manual' };
  const boat: BoatClass = { id: 'b10', name: '10 m', length: 10, beam: 3.5, color: '#000', share: 1, count: 0 };
  const berths: Berth[] = [0, 1, 2, 3].map((i) => ({
    id: `P1-L${i + 1}`,
    pierId: 'P1',
    side: 'left',
    boatClassId: 'b10',
    slot: [{ x: -1.5, y: 1 + 4 * i }, { x: -1.5, y: 5 + 4 * i }, { x: -12, y: 5 + 4 * i }, { x: -12, y: 1 + 4 * i }],
    boat: [],
    removed: false,
    issues: [],
  }));
  const site: Site = {
    water: [{ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: -100, y: 100 }],
    shoreline: [{ x: -100, y: 0 }, { x: 100, y: 0 }],
    entrance: { a: { x: -100, y: 100 }, b: { x: 100, y: 100 } },
    obstacles: [],
    zones: [],
  };
  const params: AnchoringParams = { ...DEFAULT_ANCHORING, seabed: 'sand' };
  const plan = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });

  it('wind loads', () => {
    expect(plan.loads).toHaveLength(1);
    expect(plan.loads[0]!.lateralKn).toBeCloseTo(41.745, 6);
    expect(plan.loads[0]!.axialKn).toBeCloseTo(5.6265, 6);
  });

  it('8 crossed lateral lines and 2 axial lines with the hand-calculated loads', () => {
    const lateral = plan.lines.filter((l) => l.kind === 'lateral');
    const axial = plan.lines.filter((l) => l.kind === 'axial');
    expect(lateral).toHaveLength(8);
    expect(axial).toHaveLength(2);
    for (const l of lateral) expect(l.horizontalKn).toBeCloseTo(10.43625, 6);
    for (const l of axial) expect(l.horizontalKn).toBeCloseTo(5.6265 / 2 / Math.cos(Math.PI / 6), 6);
    // Each line is fixed on one edge and anchored beyond the other: chains cross under the pier.
    for (const l of lateral) {
      expect(Math.sign(l.fix.x)).toBe(-Math.sign(l.anchor.x));
      expect(Math.abs(l.anchor.x)).toBeGreaterThan(1.5);
    }
    // Axial anchors lie beyond the head.
    for (const l of axial) expect(l.anchor.y).toBeGreaterThan(30);
  });

  it('chain and anchor per line', () => {
    const line = plan.lines[0]!;
    expect(line.chainId).toBe('c13');
    expect(line.chainLength).toBeCloseTo(3 * (4 + 1.5), 9);
    expect(line.requiredAnchorKg).toBeCloseTo(requiredAnchorMass(10436.25, line.upliftKn * 1000, params), 6);
    // About 4.4 t without uplift on sand: two 3 000 kg anchors (the heaviest in the list).
    expect(line.anchorId).toBe('a3000');
    expect(line.anchorCount).toBe(2);
    expect(plan.issues.some((i) => i.code === 'SEVERAL_ANCHORS')).toBe(true);
    expect(plan.issues.some((i) => i.code === 'ANCHORING_NOT_A_DESIGN')).toBe(true);
  });

  it('an access pontoon is anchored by its own wind area', () => {
    const withAccess = anchoringPlan({
      layout: { piers: [], berths: [] },
      site: { ...site, accessPontoons: [{ id: 'access-1', start: { x: -50, y: 2 }, end: { x: 50, y: 2 }, width: 3 }] },
      classes: [boat],
      params,
      priceList: LIST,
      vatPct: 25.5,
      pierFreeboard: 0.5,
    });
    // 100 m · 0.5 m · 302.5 Pa · 1.2 = 18 150 N; ⌈100/12⌉ + 1 = 10 pairs → 20 lines; the 10
    // lines of one side carry the load from that side: 1 815 N each.
    expect(withAccess.loads[0]!.lateralKn).toBeCloseTo(18.15, 6);
    expect(withAccess.lines).toHaveLength(20);
    expect(withAccess.lines[0]!.horizontalKn).toBeCloseTo(1.815, 6);
    expect(withAccess.issues.some((i) => i.code === 'ACCESS_PONTOON_WALL_FIXING')).toBe(true);
  });

  it('anchors outside the water area are reported', () => {
    // The pier's axial anchors lie beyond its head; a basin ending 5 m beyond the head leaves them on land.
    const tight = { ...site, water: [{ x: -100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 35 }, { x: -100, y: 35 }] };
    const plan2 = anchoringPlan({ layout: { piers: [pier], berths }, site: tight, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const issue = plan2.issues.find((i) => i.code === 'ANCHOR_OUTSIDE_WATER');
    expect(issue?.message).toMatch(/^2 anchors lie outside the water area/);
    expect(plan.issues.some((i) => i.code === 'ANCHOR_OUTSIDE_WATER')).toBe(false);
  });

  it('is deterministic', () => {
    const again = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    expect(again).toEqual(plan);
  });
});
