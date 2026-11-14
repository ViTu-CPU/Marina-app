import { describe, expect, it } from 'vitest';
import {
  anchoringPlan,
  chainLengthFor,
  chainLine,
  chooseAnchor,
  chooseChain,
  DEFAULT_ANCHORING,
  requiredAnchorMass,
  resetAnchoringFactors,
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

  it('resetting the factors keeps the site values (U19)', () => {
    const own: AnchoringParams = {
      ...DEFAULT_ANCHORING,
      depth: 7,
      highWater: 1.2,
      lowWater: 0.6,
      seabed: 'sand',
      windSpeed: 25,
      dragCoefficient: 1.2,
      profileHeightRatio: 0.25,
      friction: { clay: 0.2, sand: 0.5, rock: 0.4 },
    };
    expect(resetAnchoringFactors(own)).toEqual({ ...DEFAULT_ANCHORING, depth: 7, highWater: 1.2, lowWater: 0.6, seabed: 'sand', windSpeed: 25 });
  });

  it('chain length: factor × depth, at least depth + 1 m', () => {
    // Default factor 4 (SF Marina's initial assumption, Chalmers 2026 §3.3).
    expect(chainLengthFor(5.5, DEFAULT_ANCHORING)).toBeCloseTo(22, 9);
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

  it('the cheapest chain that holds the load with the safety factor (new breaking load, UFC 4-159-03)', () => {
    // h = 5.5 m, L = 22 m. 13 mm holds a top tension up to 61.8 / 3 = 20.6 kN.
    const small = chooseChain(15000, 5.5, DEFAULT_ANCHORING, LIST, 25.5)!;
    expect(small.product.id).toBe('c13');
    expect(small.length).toBeCloseTo(22, 9);
    expect(3 * small.topTension).toBeLessThanOrEqual(61.8e3);
    // H = 25 kN: 3 · ≥25 kN > 61.8 kN, 16 mm (98.1 kN) holds.
    expect(chooseChain(25000, 5.5, DEFAULT_ANCHORING, LIST, 25.5)!.product.id).toBe('c16');
    // Nothing holds 35 kN: 3 · 35 kN > 98.1 kN.
    expect(chooseChain(35000, 5.5, DEFAULT_ANCHORING, LIST, 25.5)).toBeNull();
  });

  it('a corrosion allowance reduces the breaking load by ((d − c)/d)²', () => {
    // c = 2 mm, L = 16.5 m: 13 mm gives 61.8 kN · (11/13)² = 44.2 kN. For H = 10 kN the top
    // tension is about 10.8 kN → 3 · 10.8 = 32.4 kN ≤ 44.2 → 13 mm; for H = 15 kN 16 mm.
    const p = { ...DEFAULT_ANCHORING, corrosionAllowance: 2, chainLengthFactor: 3 };
    const small = chooseChain(10000, 5.5, p, LIST, 25.5)!;
    expect(small.product.id).toBe('c13');
    expect(3 * small.topTension).toBeLessThanOrEqual(61.8e3 * (11 / 13) ** 2);
    expect(chooseChain(15000, 5.5, p, LIST, 25.5)!.product.id).toBe('c16');
    // 16 mm gives 98.1 · (14/16)² = 75.1 kN < 3 · 30 kN.
    expect(chooseChain(30000, 5.5, p, LIST, 25.5)).toBeNull();
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

  it('anchors heavier than the largest piece to be handled are not used (Chalmers 2026 §3.8)', () => {
    // 2 500 kg with at most 2 000 kg pieces: two 2 000 kg anchors instead of one 3 000 kg.
    expect(chooseAnchor(2500, LIST, 25.5, 2000)).toEqual({ product: LIST.products[4], count: 2 });
    expect(chooseAnchor(2500, LIST, 25.5, 3000)).toEqual({ product: LIST.products[5], count: 1 });
    // A limit below every anchor falls back to the whole list.
    expect(chooseAnchor(900, LIST, 25.5, 100)).toEqual({ product: LIST.products[3], count: 1 });
  });
});

describe('anchoring plan of a pier', () => {
  /**
   * Pier 30 m × 3 m, freeboard 0.5 m, four 10 m × 3.5 m boats on its left side
   * (UFC 4-152-07 C1 §6-3.4.1 and Fig. 6-5).
   * q = ½ · 1.25 · 22² = 302.5 Pa; Cd = 1.6 → 484 Pa; profile height 0.15 · 10 = 1.5 m.
   * Across (boats bow-on, 3.5 · 1.5 = 5.25 m² each, 21 m² per row; the boats hide 4 · 3.5 = 14 m
   * of the pier face):
   *   wind from the left:  21 + 0.2 · 0 + (30 − 14) · 0.5 = 29 m²
   *   wind from the right: 0 + 0.2 · 21 + 30 · 0.5        = 19.2 m²
   *   → 484 · 29 = 14 036 N.
   * Along (boats broadside, 10 · 1.5 = 15 m²): pier end 3 · 0.5 = 1.5 m² + first boat 15 m²
   *   + 3 · 0.2 · 15 = 9 m² → 25.5 m² → 12 342 N.
   * Pairs: max(2, ⌈30/12⌉ + 1) = 4 → 8 lateral lines of 14 036 / 4 = 3 509 N.
   * Axial: 2 lines of 12 342 / 2 / cos 30° = 7 125.6 N.
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
    expect(plan.loads[0]!.lateralKn).toBeCloseTo(14.036, 6);
    expect(plan.loads[0]!.axialKn).toBeCloseTo(12.342, 6);
  });

  it('8 crossed lateral lines and 2 axial lines with the hand-calculated loads', () => {
    const lateral = plan.lines.filter((l) => l.kind === 'lateral');
    const axial = plan.lines.filter((l) => l.kind === 'axial');
    expect(lateral).toHaveLength(8);
    expect(axial).toHaveLength(2);
    for (const l of lateral) expect(l.horizontalKn).toBeCloseTo(3.509, 6);
    for (const l of axial) expect(l.horizontalKn).toBeCloseTo(12.342 / 2 / Math.cos(Math.PI / 6), 6);
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
    expect(line.chainLength).toBeCloseTo(4 * (4 + 1.5), 9);
    // 22 m of 13 mm chain in 5.5 m of water: a = 3 509 / 26.55 = 132 m needs 38.5 m to touch the
    // bottom, so the chain hangs and lifts the anchor.
    const hanging = chainLine(5.5, 22, 3509, 3.1 * 9.81 * (1 - 1000 / 7850));
    expect(hanging.touchesBottom).toBe(false);
    expect(line.upliftKn).toBeCloseTo(hanging.uplift / 1000, 9);
    expect(line.requiredAnchorKg).toBeCloseTo(requiredAnchorMass(3509, hanging.uplift, params), 6);
    // On sand 1.5 · (3 509 / 0.6 + V) / (9.81 · 0.583) = 1 533 kg + uplift → one 2 000 kg anchor.
    expect(line.requiredAnchorKg).toBeGreaterThan(1533);
    expect(line.requiredAnchorKg).toBeLessThan(2000);
    expect(line.anchorId).toBe('a2000');
    expect(line.anchorCount).toBe(1);
    // The axial lines hold 7 126 N: 1.5 · 7 126 / 0.6 / 5.72 = 3 113 kg + uplift, more than the
    // heaviest anchor (3 000 kg) → two 3 000 kg anchors.
    const axial = plan.lines.find((l) => l.kind === 'axial')!;
    expect(axial.requiredAnchorKg).toBeGreaterThan(3113);
    expect(axial.anchorId).toBe('a3000');
    expect(axial.anchorCount).toBe(2);
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
    // 100 m · 0.5 m · 484 Pa = 24 200 N; ⌈100/12⌉ + 1 = 10 pairs → 20 lines; the 10 lines of
    // one side carry the load from that side: 2 420 N each.
    expect(withAccess.loads[0]!.lateralKn).toBeCloseTo(24.2, 6);
    expect(withAccess.lines).toHaveLength(20);
    expect(withAccess.lines[0]!.horizontalKn).toBeCloseTo(2.42, 6);
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
