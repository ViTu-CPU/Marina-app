import { describe, expect, it } from 'vitest';
import {
  anchoringPlan,
  chainLengthFor,
  chainLine,
  chooseAnchor,
  chooseChain,
  DEFAULT_ANCHORING,
  requiredAnchorMass,
  requiredWedgeMass,
  resetAnchoringFactors,
  upliftAngle,
  WEDGE_ANGLE_LIMIT,
  wedgeWorkingCapacity,
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
   * The same from the shore (all boats alike).
   * Pairs: max(2, ⌈30/12⌉ + 1) = 4 at 0.5, 10, 20 and 29.5 m; the stations up to 15 m are splayed
   * towards the head, the others towards the shore (I60): 4 + 4 lines, splay 45°.
   * Across: the 4 lines of one side, 14 036 / 4 / cos 45° = 4 962.5 N.
   * Along: the 4 lines splayed one way, 12 342 / 4 / sin 45° = 4 363.6 N → across governs.
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
    expect(plan.loads[0]!.axialFromSeaKn).toBeCloseTo(12.342, 6);
    expect(plan.loads[0]!.axialFromShoreKn).toBeCloseTo(12.342, 6);
  });

  it('wind along the pier from each end: the first boat from that end takes the full load', () => {
    // The boat nearest the head is a 6 m × 2.5 m one (profile 0.9 m, broadside 5.4 m²).
    // From the sea: 1.5 + 5.4 + 0.2 · 3 · 15 = 15.9 m² → 7 695.6 N.
    // From the shore: 1.5 + 15 + 0.2 · (15 + 15 + 5.4) = 23.58 m² → 11 412.72 N.
    const small: BoatClass = { id: 'b6', name: '6 m', length: 6, beam: 2.5, color: '#000', share: 1, count: 0 };
    const mixed = berths.map((b, i) => (i === 3 ? { ...b, boatClassId: 'b6' } : b));
    const p2 = anchoringPlan({ layout: { piers: [pier], berths: mixed }, site, classes: [boat, small], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    expect(p2.loads[0]!.axialFromSeaKn).toBeCloseTo(7.6956, 6);
    expect(p2.loads[0]!.axialFromShoreKn).toBeCloseTo(11.41272, 6);
  });

  it('8 crossed lines splayed 45° towards the ends of the pier (D25, I60)', () => {
    expect(plan.lines).toHaveLength(8);
    expect(plan.lines.filter((l) => l.splay === 'head')).toHaveLength(4);
    expect(plan.lines.filter((l) => l.splay === 'shore')).toHaveLength(4);
    for (const l of plan.lines) {
      expect(l.horizontalKn).toBeCloseTo(4.96248, 5);
      expect(l.governs).toBe('across');
      // Fixed on one edge and anchored beyond the other: chains cross under the pier.
      expect(Math.sign(l.fix.x)).toBe(-Math.sign(l.anchor.x));
      expect(Math.abs(l.anchor.x)).toBeGreaterThan(1.5);
      // 45° from square: as far along the pier as across it, towards the end named by `splay`.
      const dx = Math.abs(l.anchor.x - l.fix.x);
      const dy = l.anchor.y - l.fix.y;
      expect(Math.abs(dy)).toBeCloseTo(dx, 9);
      expect(Math.sign(dy)).toBe(l.splay === 'head' ? 1 : -1);
      // The shore half points to the head and the head half to the shore: no anchor lies
      // behind the shore end or beyond the head.
      expect(l.splay === 'head' ? l.fix.y <= 15 : l.fix.y > 15).toBe(true);
      expect(l.anchor.y).toBeGreaterThan(0);
      expect(l.anchor.y).toBeLessThan(30);
    }
  });

  it('a small splay angle leaves the wind along the pier governing', () => {
    // θ = 12°: across 14 036 / 4 / cos 12° = 3 587.4 N; along 12 342 / 4 / sin 12° = 14 840.4 N.
    const p12 = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params: { ...params, splayAngle: 12 }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    for (const l of p12.lines) {
      expect(l.horizontalKn).toBeCloseTo(14.8404, 4);
      expect(l.governs).toBe('along');
    }
  });

  it('square lines (0°) do not hold the wind along the pier, and say so', () => {
    const p0 = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params: { ...params, splayAngle: 0 }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    for (const l of p0.lines) {
      expect(l.splay).toBe('none');
      expect(l.horizontalKn).toBeCloseTo(3.509, 6);
      expect(l.anchor.y).toBeCloseTo(l.fix.y, 9);
    }
    expect(p0.issues.find((i) => i.code === 'ALONG_PIER_LOAD_NOT_HELD')?.message).toMatch(/pier P1 is not held/);
    expect(plan.issues.some((i) => i.code === 'ALONG_PIER_LOAD_NOT_HELD')).toBe(false);
  });

  it('chain and anchor per line', () => {
    const line = plan.lines[0]!;
    expect(line.chainId).toBe('c13');
    expect(line.chainLength).toBeCloseTo(4 * (4 + 1.5), 9);
    // 22 m of 13 mm chain in 5.5 m of water: a = 4 962.5 / 26.55 = 187 m needs 45.7 m to touch
    // the bottom, so the chain hangs and lifts the anchor.
    const H = 14036 / 4 / Math.SQRT1_2;
    const hanging = chainLine(5.5, 22, H, 3.1 * 9.81 * (1 - 1000 / 7850));
    expect(hanging.touchesBottom).toBe(false);
    expect(line.upliftKn).toBeCloseTo(hanging.uplift / 1000, 9);
    expect(line.requiredAnchorKg).toBeCloseTo(requiredAnchorMass(H, hanging.uplift, params), 6);
    // On sand 1.5 · (4 962.5 / 0.6 + V) / (9.81 · 0.583) = 2 168 kg + uplift → one 3 000 kg anchor.
    expect(line.requiredAnchorKg).toBeGreaterThan(2168);
    expect(line.requiredAnchorKg).toBeLessThan(3000);
    expect(line.anchorId).toBe('a3000');
    expect(line.anchorCount).toBe(1);
    expect(plan.issues.some((i) => i.code === 'SEVERAL_ANCHORS')).toBe(false);
    expect(plan.issues.some((i) => i.code === 'ANCHORING_NOT_A_DESIGN')).toBe(true);
    // On clay (μ 0.3) twice that, 4 336 kg + uplift: two 3 000 kg anchors per line.
    const onClay = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params: { ...params, seabed: 'clay' }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    expect(onClay.lines[0]!.requiredAnchorKg).toBeGreaterThan(4336);
    expect(onClay.lines[0]!.anchorId).toBe('a3000');
    expect(onClay.lines[0]!.anchorCount).toBe(2);
    expect(onClay.issues.some((i) => i.code === 'SEVERAL_ANCHORS')).toBe(true);
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
    // Square lines: the load along the pontoon is left to the wall.
    for (const l of withAccess.lines) expect(l.splay).toBe('none');
    expect(withAccess.issues.some((i) => i.code === 'ALONG_PIER_LOAD_NOT_HELD')).toBe(false);
    expect(withAccess.issues.some((i) => i.code === 'ACCESS_PONTOON_WALL_FIXING')).toBe(true);
  });

  it('anchors outside the water area are reported', () => {
    // The lines fixed on the right edge are anchored about 15 m left of the pier (span 21.3 m at
    // 45°); with the water ending 10 m left of it their 4 anchors lie on land.
    const tight = { ...site, water: [{ x: -10, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: -10, y: 100 }] };
    const plan2 = anchoringPlan({ layout: { piers: [pier], berths }, site: tight, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const issue = plan2.issues.find((i) => i.code === 'ANCHOR_OUTSIDE_WATER');
    expect(issue?.message).toMatch(/^4 anchors lie outside the water area/);
    expect(plan.issues.some((i) => i.code === 'ANCHOR_OUTSIDE_WATER')).toBe(false);
  });

  it('is deterministic', () => {
    const again = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    expect(again).toEqual(plan);
  });
  it('wedge anchors on clay: chains lengthened to the 5° limit, mass from Table 35', () => {
    const clay: AnchoringParams = { ...DEFAULT_ANCHORING, seabed: 'clay', anchorType: 'wedge' };
    const wedge = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params: clay, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const w13 = 3.1 * 9.81 * (1 - 1000 / 7850);
    for (const l of wedge.lines) {
      expect(l.anchorType).toBe('wedge');
      expect(l.upliftAngleDeg).toBeLessThanOrEqual(5 + 1e-9);
      // SF 1.5 equals the tables' FS: mass = H / (2.0 kips per US ton) = H / 9.80665 N/kg.
      expect(l.requiredAnchorKg).toBeCloseTo((l.horizontalKn * 1000) / 9.80665, 2);
    }
    // The 22 m rule length leaves the 13 mm chain at about 11° (above the limit), so it is
    // lengthened to the shortest 0.1 m step within 5°.
    const lateral = wedge.lines[0]!;
    const H = 14036 / 4 / Math.SQRT1_2;
    expect(lateral.chainId).toBe('c13');
    expect(upliftAngle(H, chainLine(5.5, 22, H, w13).uplift)).toBeGreaterThan(5);
    expect(lateral.chainLength).toBeGreaterThan(22);
    expect(upliftAngle(H, chainLine(5.5, lateral.chainLength - 0.1, H, w13).uplift)).toBeGreaterThan(5);
    // 4 962.5 N → 506.0 kg: the 1 000 kg anchor, the lightest in the list.
    expect(lateral.requiredAnchorKg).toBeCloseTo(506.0, 1);
    expect(lateral.anchorId).toBe('a1000');
    expect(wedge.issues.some((i) => i.code === 'WEDGE_ANCHORS')).toBe(true);
  });

  it('wedge anchors are not sized on rock: plain blocks and a warning', () => {
    const rock: AnchoringParams = { ...DEFAULT_ANCHORING, seabed: 'rock', anchorType: 'wedge' };
    const onRock = anchoringPlan({ layout: { piers: [pier], berths }, site, classes: [boat], params: rock, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const line = onRock.lines[0]!;
    expect(line.anchorType).toBe('block');
    expect(line.chainLength).toBeCloseTo(22, 9);
    expect(line.requiredAnchorKg).toBeCloseTo(requiredAnchorMass(line.horizontalKn * 1000, line.upliftKn * 1000, rock), 6);
    expect(onRock.issues.some((i) => i.code === 'WEDGE_NOT_ON_ROCK')).toBe(true);
  });
});

describe('wedge (Pearl Harbor type) anchor tables, Sound & Sea Technology 2009', () => {
  const TON = 907.18474;
  const KIP = 4448.2216;

  it('soft clay/mud (Table 35): 2.0 kips working capacity per US ton, every size', () => {
    expect(wedgeWorkingCapacity(TON, 'clay', 0)).toBeCloseTo(2 * KIP, 6);
    expect(wedgeWorkingCapacity(60 * TON, 'clay', 0)).toBeCloseTo(120 * KIP, 6);
    // 3 000 kg: 3 000 / 907.18 · 8 896.4 = 29 420 N, about the weight in air.
    expect(wedgeWorkingCapacity(3000, 'clay', 5)).toBeCloseTo(29419.95, 1);
    // "Keep chain angle less than 5 to 6 degrees": above 5° the table does not apply.
    expect(WEDGE_ANGLE_LIMIT.clay).toBe(5);
    expect(wedgeWorkingCapacity(3000, 'clay', 5.1)).toBeNull();
  });

  it('sand (Table 36): rows at 0° and 6°, linear between rows and angles', () => {
    expect(wedgeWorkingCapacity(2 * TON, 'sand', 0)).toBeCloseTo(9.35 * KIP, 6);
    expect(wedgeWorkingCapacity(2 * TON, 'sand', 6)).toBeCloseTo(6.3 * KIP, 6);
    expect(wedgeWorkingCapacity(2 * TON, 'sand', 3)).toBeCloseTo(7.825 * KIP, 6);
    expect(wedgeWorkingCapacity(1.5 * TON, 'sand', 0)).toBeCloseTo(6.61 * KIP, 6);
    // Below the first row in proportion to it; above the last in proportion to the last.
    expect(wedgeWorkingCapacity(0.5 * TON, 'sand', 0)).toBeCloseTo(1.935 * KIP, 6);
    expect(wedgeWorkingCapacity(120 * TON, 'sand', 0)).toBeCloseTo(662 * KIP, 6);
    expect(wedgeWorkingCapacity(TON, 'sand', 6.1)).toBeNull();
    expect(wedgeWorkingCapacity(TON, 'rock', 0)).toBeNull();
  });

  it('required mass inverts the capacity with the anchor safety factor', () => {
    for (const seabed of ['clay', 'sand'] as const) {
      for (const sf of [1.5, 2]) {
        const p: AnchoringParams = { ...DEFAULT_ANCHORING, seabed, slidingSafetyFactor: sf };
        for (const H of [2000, 8000, 50000, 400000, 3e6]) {
          const m = requiredWedgeMass(H, 4, p)!;
          expect((wedgeWorkingCapacity(m, seabed, 4)! * 1.5) / sf).toBeCloseTo(H, 3);
        }
      }
    }
    // 2.0 kips per US ton is 9.8066 N per kg, i.e. a working capacity equal to the weight in air.
    expect((2 * KIP) / TON).toBeCloseTo(9.80665, 4);
    expect(requiredWedgeMass(6000, 0, { ...DEFAULT_ANCHORING, seabed: 'clay' })).toBeCloseTo(6000 / ((2 * KIP) / TON), 9);
    expect(requiredWedgeMass(6000, 0, { ...DEFAULT_ANCHORING, seabed: 'rock' })).toBeNull();
  });
});
