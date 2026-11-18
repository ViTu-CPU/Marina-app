import { describe, expect, it } from 'vitest';
import {
  anchoringPlan,
  anchorTotals,
  waveAction,
  chainLengthFor,
  chainLine,
  choosePileGuide,
  chooseChain,
  DEFAULT_ANCHORING,
  requiredAnchorMass,
  requiredWedgeMass,
  resetAnchoringFactors,
  tributaryLengths,
  upliftAngle,
  waveLoadFactor,
  WEDGE_ANGLE_LIMIT,
  wedgeWorkingCapacity,
  type AnchoringParams,
} from '../anchoring';
import { anchorPieceCost, chooseLineAnchor, groupThousands, installParams } from '../anchorChoice';
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
  anchorKind: null,
  capacityHorizontalKn: null,
  capacityUpliftKn: null,
  capacityBasis: null,
  seabeds: [],
  installedPrice: null,
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
      buoySinkerFactor: 5,
      buoyChainFactor: 3,
    };
    expect(resetAnchoringFactors(own)).toEqual({ ...DEFAULT_ANCHORING, depth: 7, highWater: 1.2, lowWater: 0.6, seabed: 'sand', windSpeed: 25 });
    // The stern-buoy method, table and exposure are choices, like the anchor type (D36, D37).
    const chosen = resetAnchoringFactors({ ...own, buoySinkerMethod: 'factor', buoyTable: 'topMarine', buoyExposed: true });
    expect([chosen.buoySinkerMethod, chosen.buoyTable, chosen.buoyExposed]).toEqual(['factor', 'topMarine', true]);
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

  it('the formula of the regression case: H 36.22 kN, V 8.69 kN on clay → 33 922 kg (D62)', () => {
    // 1.5 · (36 220 / 0.3 + 8 690) / (9.81 · (1 − 1000 / 2400)) = 194 135 / 5.7225 = 33 925 kg.
    const p = { ...DEFAULT_ANCHORING, friction: { ...DEFAULT_ANCHORING.friction, clay: 0.3 }, slidingSafetyFactor: 1.5, concreteDensity: 2400, waterDensity: 1000 };
    const m = requiredAnchorMass(36220, 8690, p);
    expect(Math.abs(m - 33922) / 33922).toBeLessThanOrEqual(0.001);
  });
});

describe('the anchor of one line (D62)', () => {
  const opts = { seabed: 'clay' as const, maxPerLine: 1, maxBlockMassKg: 3000, capacitySafetyFactor: 1 };
  const need = (blockMassKg: number, H = 10000, V = 0) => ({ H, V, blockMassKg });
  const screw = product({
    id: 'screw50',
    category: 'anchor',
    price: 1500,
    anchorKind: 'screw',
    capacityBasis: 'published',
    capacityHorizontalKn: 50,
    capacityUpliftKn: 50,
    seabeds: ['clay'],
    sourceUrl: 'https://example.com/screw',
    sourceDate: '2026-11-18',
  });
  const withScrew = (s: Partial<Product> = {}): PriceList => ({ ...LIST, products: [...LIST.products, { ...screw, ...s }] });

  it('the cheapest block heavy enough, one per line; never several', () => {
    expect(chooseLineAnchor(need(900), opts, LIST, 25.5)).toEqual({ pick: { product: LIST.products[3], kind: 'block', count: 1, cost: 300 }, reason: null });
    expect(chooseLineAnchor(need(1500), opts, LIST, 25.5).pick!.product.id).toBe('a2000');
    // 8 737 kg: no single block of the list (3 000 kg at most) holds the line.
    expect(chooseLineAnchor(need(8737), opts, LIST, 25.5)).toEqual({ pick: null, reason: 'block: needs 8 737 kg, max product 3 000 kg' });
  });

  it('two in tandem only when the user allows 2 per line', () => {
    expect(chooseLineAnchor(need(5000), { ...opts, maxPerLine: 2 }, LIST, 25.5).pick).toMatchObject({ product: { id: 'a3000' }, count: 2, cost: 1400 });
    expect(chooseLineAnchor(need(8737), { ...opts, maxPerLine: 2 }, LIST, 25.5).reason).toBe('block: needs 8 737 kg, max product 2 × 3 000 kg');
  });

  it('blocks heavier than the largest piece to be handled are not used (Chalmers 2026 §3.8)', () => {
    expect(chooseLineAnchor(need(2500), { ...opts, maxBlockMassKg: 2000 }, LIST, 25.5)).toEqual({ pick: null, reason: 'block: needs 2 500 kg, max product 2 000 kg' });
    expect(chooseLineAnchor(need(2500), { ...opts, maxBlockMassKg: 3000 }, LIST, 25.5).pick!.product.id).toBe('a3000');
    expect(chooseLineAnchor(need(900), { ...opts, maxBlockMassKg: 100 }, LIST, 25.5).reason).toBe('block: needs 900 kg, no product within the largest piece 100 kg');
  });

  it('another kind holds the line by its published capacity', () => {
    // The regression line: 33 922 kg as a block, or one screw anchor of 50 kN.
    expect(chooseLineAnchor(need(33922, 36220, 8690), opts, withScrew(), 25.5)).toEqual({ pick: { product: { ...screw }, kind: 'screw', count: 1, cost: 1500 }, reason: null });
    // A cheaper block wins where one holds the line.
    expect(chooseLineAnchor(need(2500, 10000, 0), opts, withScrew(), 25.5).pick!.product.id).toBe('a3000');
    // Installed price below the block's: the screw anchor.
    expect(chooseLineAnchor(need(2500, 10000, 0), opts, withScrew({ installedPrice: 600 }), 25.5).pick).toMatchObject({ product: { id: 'screw50' }, cost: 600 });
  });

  it('a capacity factor, tandem, and what each kind lacks', () => {
    // SF 1.5: 54.3 kN > 50 kN, and 13.0 kN uplift.
    const sf = { ...opts, capacitySafetyFactor: 1.5 };
    expect(chooseLineAnchor(need(33922, 36220, 8690), sf, withScrew(), 25.5).reason).toBe(
      'block: needs 33 922 kg, max product 3 000 kg; screw: needs 54.3 kN horizontal, max product 50.0 kN; 13.0 kN uplift, max product 50.0 kN',
    );
    expect(chooseLineAnchor(need(33922, 36220, 8690), { ...sf, maxPerLine: 2 }, withScrew(), 25.5).pick).toMatchObject({ kind: 'screw', count: 2 });
    // A lifting line needs an uplift capacity; a line on the bottom does not.
    expect(chooseLineAnchor(need(33922, 36220, 8690), opts, withScrew({ capacityUpliftKn: null }), 25.5).reason).toBe(
      'block: needs 33 922 kg, max product 3 000 kg; screw: needs 8.7 kN uplift, no uplift capacity published',
    );
    expect(chooseLineAnchor(need(30000, 36220, 0), opts, withScrew({ capacityUpliftKn: null }), 25.5).pick!.kind).toBe('screw');
    // Never chosen without a published capacity, or on a seabed it does not list.
    expect(chooseLineAnchor(need(33922, 36220, 0), opts, withScrew({ capacityHorizontalKn: null, capacityUpliftKn: null, capacityBasis: null }), 25.5).reason).toBe(
      'block: needs 33 922 kg, max product 3 000 kg; screw: no published capacity in the price list',
    );
    expect(chooseLineAnchor(need(33922, 36220, 0), { ...opts, seabed: 'sand' }, withScrew(), 25.5).reason).toBe('block: needs 33 922 kg, max product 3 000 kg; screw: none for sand');
    expect(chooseLineAnchor(need(33922, 36220, 0), opts, withScrew({ seabeds: [] }), 25.5).reason).toContain('screw: none for clay');
    // Stern-buoy sinkers are blocks only.
    expect(chooseLineAnchor(need(33922, 36220, 0), { ...opts, blocksOnly: true }, withScrew(), 25.5).reason).toBe('block: needs 33 922 kg, max product 3 000 kg');
  });

  it('the cost compared includes the installation when the price is the supply price', () => {
    const rates: PriceList = {
      ...LIST,
      products: [...LIST.products, product({ id: 'rate-diving-team', category: 'labour', unit: 'h', price: 180 }), product({ id: 'rate-work-boat', category: 'plant', unit: 'day', price: 800 })],
      parameters: [{ key: 'diver_h_per_anchor', value: 1, unit: 'h', description: '', source: 'Assumption.' }, { key: 'diver_h_per_tonne', value: 0.5, unit: 'h', description: '', source: 'Assumption.' }, { key: 'anchors_per_boat_day', value: 8, unit: 'pcs', description: '', source: 'Assumption.' }],
    };
    // 700 € + (1 h + 0.5 h/t · 3 t) · 180 €/h + 800 € / 8 = 700 + 450 + 100 = 1 250 €.
    expect(anchorPieceCost(LIST.products[5]!, rates, 25.5)).toBeCloseTo(1250, 9);
    // An installed price stands alone.
    expect(anchorPieceCost({ ...LIST.products[5]!, installedPrice: 999 }, rates, 25.5)).toBe(999);
    expect(groupThousands(33922.4)).toBe('33 922');
  });

  it('older price lists: the per-line installation keys stand in', () => {
    const old: PriceList = { ...LIST, parameters: [{ key: 'diver_h_per_anchor_line', value: 2, unit: 'h', description: '', source: '' }, { key: 'boat_days_per_10_anchor_lines', value: 2, unit: 'day', description: '', source: '' }] };
    expect(installParams(old)).toEqual({ diverHoursPerAnchor: 2, diverHoursPerTonne: 0, anchorsPerBoatDay: 5, workBoatMaxLiftKg: 3000, legacyKeys: ['diver_h_per_anchor_line', 'boat_days_per_10_anchor_lines'] });
    expect(installParams(LIST)).toEqual({ diverHoursPerAnchor: 1, diverHoursPerTonne: 0, anchorsPerBoatDay: 10, workBoatMaxLiftKg: 3000, legacyKeys: [] });
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
   * Stations (D46, I96): no module lengths given, so joints every 12 m: 12 and 24 m. At the shore end
   * (0.5 m) one chain per side splayed towards the head; at each joint on each side one towards the
   * head and one towards the shore (X pattern): 2 + 2 · 4 = 10 lines, 5 anchored on each side, 6
   * splayed towards the head and 4 towards the shore, θ = 45°.
   * Across: the 5 lines of one side, 14 036 / 5 / cos 45° = 3 970.0 N.
   * Along from the sea: the 6 head-ward lines, 12 342 / 6 / sin 45° = 2 909.0 N → across governs them;
   * from the shore: the 4 shore-ward lines, 12 342 / 4 / sin 45° = 4 363.6 N → along governs them.
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
  /**
   * The pier tests use a shoreline 30 m behind the pier, beyond its 6 m gangway, so that they show
   * the seabed chains alone; see 'shore chains under the gangway (D49)'.
   */
  const pierSite: Site = { ...site, shoreline: [{ x: -100, y: -30 }, { x: 100, y: -30 }] };
  // Tip chains (D30) are off in this block, which checks the side lines; see 'tip chains'.
  const params: AnchoringParams = { ...DEFAULT_ANCHORING, seabed: 'sand', tipAnchorMinLength: 1000 };
  const plan = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });

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
    const p2 = anchoringPlan({ layout: { piers: [pier], berths: mixed }, site: pierSite, classes: [boat, small], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    expect(p2.loads[0]!.axialFromSeaKn).toBeCloseTo(7.6956, 6);
    expect(p2.loads[0]!.axialFromShoreKn).toBeCloseTo(11.41272, 6);
  });

  const ACROSS = 14036 / 5 / Math.SQRT1_2 / 1000;
  const FROM_SHORE = 12342 / 4 / Math.SQRT1_2 / 1000;

  it('10 crossed lines: an X at every joint, towards the head at the shore end (D46)', () => {
    expect(plan.lines).toHaveLength(10);
    expect(plan.lines.filter((l) => l.splay === 'head')).toHaveLength(6);
    expect(plan.lines.filter((l) => l.splay === 'shore')).toHaveLength(4);
    // Stations: 0.5 m (2 lines), 12 m and 24 m (4 lines each).
    const stations = [...new Set(plan.lines.map((l) => Math.round(l.fix.y * 10) / 10))].sort((x, y) => x - y);
    expect(stations).toEqual([0.5, 12, 24]);
    expect(plan.lines.filter((l) => Math.abs(l.fix.y - 0.5) < 1e-9).every((l) => l.splay === 'head')).toBe(true);
    for (const l of plan.lines) {
      expect(l.horizontalKn).toBeCloseTo(l.splay === 'head' ? ACROSS : FROM_SHORE, 5);
      expect(l.governs).toBe(l.splay === 'head' ? 'across' : 'along');
      // Fixed on one edge and anchored beyond the other: chains cross under the pier.
      expect(Math.sign(l.fix.x)).toBe(-Math.sign(l.anchor.x));
      expect(Math.abs(l.anchor.x)).toBeGreaterThan(1.5);
      // 45° from square: as far along the pier as across it, towards the end named by `splay`.
      const dx = Math.abs(l.anchor.x - l.fix.x);
      const dy = l.anchor.y - l.fix.y;
      expect(Math.abs(dy)).toBeCloseTo(dx, 9);
      expect(Math.sign(dy)).toBe(l.splay === 'head' ? 1 : -1);
    }
    // At a joint both sides have both directions: the chains of neighbouring joints cross.
    for (const t of [12, 24]) {
      const at = plan.lines.filter((l) => Math.abs(l.fix.y - t) < 1e-9);
      expect(new Set(at.map((l) => `${Math.sign(l.fix.x)}${l.splay}`)).size).toBe(4);
    }
  });

  it('joints at the module joints when the module lengths are given (D44, D46)', () => {
    // A 32.1 m pier of 19.90 + 12.20 m modules: one joint at 19.9 m → 2 + 4 lines.
    const p32: MainPier = { ...pier, end: { x: 0, y: 32.1 } };
    const m = anchoringPlan({ layout: { piers: [p32], berths }, site: pierSite, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5, moduleLengths: [19.9, 16.05, 12.2] });
    expect(m.lines).toHaveLength(6);
    expect([...new Set(m.lines.map((l) => Math.round(l.fix.y * 10) / 10))].sort((x, y) => x - y)).toEqual([0.5, 19.9]);
  });

  it('a small splay angle leaves the wind along the pier governing', () => {
    // θ = 12°: across 14 036 / 5 / cos 12° = 2 870.0 N; from the sea 12 342 / 6 / sin 12° = 9 893.6 N;
    // from the shore 12 342 / 4 / sin 12° = 14 840.4 N.
    const p12 = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: { ...params, splayAngle: 12 }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    for (const l of p12.lines) {
      expect(l.horizontalKn).toBeCloseTo(l.splay === 'head' ? 9.8936 : 14.8404, 4);
      expect(l.governs).toBe('along');
    }
  });

  it('square lines (0°) do not hold the wind along the pier, and say so', () => {
    // One line per side at each station (0.5, 12, 24 m): 14 036 / 3 = 4 678.7 N.
    const p0 = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: { ...params, splayAngle: 0 }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    expect(p0.lines).toHaveLength(6);
    for (const l of p0.lines) {
      expect(l.splay).toBe('none');
      expect(l.horizontalKn).toBeCloseTo(4.678667, 6);
      expect(l.anchor.y).toBeCloseTo(l.fix.y, 9);
    }
    expect(p0.issues.find((i) => i.code === 'ALONG_PIER_LOAD_NOT_HELD')?.message).toMatch(/^The wind along P1 is not held/);
    expect(plan.issues.some((i) => i.code === 'ALONG_PIER_LOAD_NOT_HELD')).toBe(false);
  });

  it('chain and anchor per line', () => {
    const line = plan.lines[0]!;
    expect(line.chainId).toBe('c13');
    expect(line.chainLength).toBeCloseTo(4 * (4 + 1.5), 9);
    // 22 m of 13 mm chain in 5.5 m of water: a = 3 970 / 26.55 = 150 m needs 41 m to touch the
    // bottom, so the chain hangs and lifts the anchor.
    const H = 14036 / 5 / Math.SQRT1_2;
    const hanging = chainLine(5.5, 22, H, 3.1 * 9.81 * (1 - 1000 / 7850));
    expect(hanging.touchesBottom).toBe(false);
    expect(line.upliftKn).toBeCloseTo(hanging.uplift / 1000, 9);
    const mass = requiredAnchorMass(H, hanging.uplift, params);
    expect(line.requiredAnchorKg).toBeCloseTo(mass, 6);
    // On sand 1.5 · (3 970 / 0.6 + V) / (9.81 · 0.583) = 1 735 kg + uplift.
    expect(mass).toBeGreaterThan(1735);
    expect(line.anchorId).toBe(mass <= 2000 ? 'a2000' : 'a3000');
    expect(line).toMatchObject({ anchorCount: 1, anchorKind: 'block', status: 'OK', infeasibleReason: null });
    expect(plan.issues.some((i) => i.code === 'ANCHOR_INFEASIBLE')).toBe(false);
    expect(plan.issues.some((i) => i.code === 'ANCHORING_NOT_A_DESIGN')).toBe(true);
    // On clay (μ 0.3) about twice that, over 3 000 kg: no block of the list holds a line alone (D62).
    const onClay = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: { ...params, seabed: 'clay' }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const first = onClay.lines[0]!;
    expect(first.requiredAnchorKg).toBeGreaterThan(3470);
    expect(first).toMatchObject({ status: 'INFEASIBLE', anchorId: null, anchorKind: null, anchorCount: 0 });
    expect(first.infeasibleReason).toBe(`block: needs ${groupThousands(first.requiredAnchorKg)} kg, max product 3 000 kg`);
    expect(onClay.lines.every((l) => l.anchorCount <= 1)).toBe(true);
    const issue = onClay.issues.find((i) => i.code === 'ANCHOR_INFEASIBLE')!;
    expect(issue.elementId).toBe('P1');
    expect(issue.message).toMatch(/^P1: \d+ of 10 anchor lines INFEASIBLE: no anchor of the price list holds them with at most 1 anchor per line/);
    expect(issue.message).toContain('closer lines are not a fix');
    expect(onClay.issues.some((i) => i.code === 'TANDEM_ANCHORS')).toBe(false);
    // Two in tandem only by the user's choice, with a warning.
    const tandem = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: { ...params, seabed: 'clay', maxAnchorsPerLine: 2 }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    // The cheapest pair that holds: 2 × 2 000 kg (960 €) rather than 2 × 3 000 kg (1 400 €).
    expect(tandem.lines[0]).toMatchObject({ status: 'OK', anchorId: 'a2000', anchorCount: 2 });
    expect(2 * 2000).toBeGreaterThanOrEqual(tandem.lines[0]!.requiredAnchorKg);
    expect(tandem.issues.find((i) => i.code === 'TANDEM_ANCHORS')!.message).toMatch(/^\d+ lines have 2 anchors in tandem \(maxAnchorsPerLine = 2, the user's choice/);
  });

  it('shore chains under the gangway of a pier 4 m off the wall (D49)', () => {
    // Shoreline 4 m behind the pier's shore end: two shore chains, crossed at 45° under the gangway,
    // plan 4 / cos 45° = 5.66 m, chain 5.66 + 1.5 + 0.9 = 8.06 m. They share the wind from the shore
    // with the 4 shore-ward seabed chains: 12 342 / 6 = 2 057 N each along the pier → shore chain
    // 2 057 / cos 45° = 2 909.0 N, seabed shore-ward 2 057 / sin 45° = 2 909.0 N (below the across
    // load 3 970.0 N, which now governs every seabed line).
    const gangSite: Site = { ...site, shoreline: [{ x: -100, y: -4 }, { x: 100, y: -4 }] };
    const g = anchoringPlan({ layout: { piers: [pier], berths }, site: gangSite, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const shore = g.lines.filter((l) => l.role === 'shore');
    expect(shore.map((l) => l.id)).toEqual(['P1-S1', 'P1-S2']);
    for (const l of shore) {
      expect(l.fixing).toBe('wall');
      expect(l.horizontalKn).toBeCloseTo(12342 / 6 / Math.SQRT1_2 / 1000, 6);
      expect(l.chainLength).toBeCloseTo(4 / Math.SQRT1_2 + 1.5 + 0.9, 6);
      // From a shore-end corner to the wall, crossing to the other side under the gangway.
      expect(l.fix.y).toBeCloseTo(0, 9);
      expect(l.anchor.y).toBeCloseTo(-4, 6);
      expect(Math.sign(l.anchor.x)).toBe(-Math.sign(l.fix.x));
    }
    for (const l of g.lines.filter((x) => x.fixing === 'seabed')) {
      expect(l.horizontalKn).toBeCloseTo(ACROSS, 5);
      expect(l.governs).toBe('across');
    }
    // A pier on an access pontoon or beyond the gangway's reach has none.
    expect(plan.lines.some((l) => l.role === 'shore')).toBe(false);
  });

  it('AS 3962 wave load from the directions with open water (D45, I99)', () => {
    // Pier P1 runs north (shore end at y = 0). Waves from the east: their front lies along the pier,
    // 2 kN/m on its 30 m → +60 kN across. Waves from the north (the head): +2 · 3 = 6 kN from the sea.
    expect(waveAction(0, 90)).toBe('across');
    expect(waveAction(0, 0)).toBe('fromSea');
    expect(waveAction(0, 180)).toBe('fromShore');
    expect(waveAction(0, 45)).toBe('fromSea'); // 45° off the axis: along (the boundary goes along)
    expect(waveAction(0, 135)).toBe('fromShore');
    expect(waveAction(90, 0)).toBe('across');
    const run = (from: number[], exceeding: string[] = []) =>
      anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5, waves: { from, exceeding } });
    const east = run([90]);
    expect(east.loads[0]!.lateralKn).toBeCloseTo(14.036 + 60, 6);
    expect(east.loads[0]!.axialFromSeaKn).toBeCloseTo(12.342, 6);
    expect(east.issues.find((i) => i.code === 'WAVE_LOAD')!.message).toContain('P1 across 60.0 kN');
    const north = run([0, 315]);
    expect(north.loads[0]!.lateralKn).toBeCloseTo(14.036, 6);
    expect(north.loads[0]!.axialFromSeaKn).toBeCloseTo(12.342 + 6, 6);
    // No waves, or a zero load: unchanged.
    expect(run([]).loads).toEqual(plan.loads);
    expect(anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: { ...params, waveLoad: 0 }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5, waves: { from: [90], exceeding: [] } }).loads).toEqual(plan.loads);
    expect(plan.issues.some((i) => i.code === 'WAVE_LOAD')).toBe(false);
    // Waves above the criteria: the 2 kN/m minimum is not enough on its own.
    expect(run([90], ['E']).issues.find((i) => i.code === 'WAVE_LOAD_ABOVE_CRITERIA')!.message).toMatch(/^The waves from E exceed/);
  });

  it('a floating breakwater is anchored from its module joints with outward pairs at both ends (D58, I106)', () => {
    // 39.8 m of Marinetek 3300 (2 × M3320BR, 19.90 m; 3.3 m wide, freeboard 0.55 m) along y = 50, x 0 → 39.8.
    const site: Site = { ...pierSite, breakwaters: [{ id: 'breakwater-1', start: { x: 0, y: 50 }, end: { x: 39.8, y: 50 }, product: '3300BR' }] };
    const run = (waves?: { from: number[]; exceeding: string[] }) =>
      anchoringPlan({ layout: { piers: [], berths: [] }, site, classes: [], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5, ...(waves ? { waves } : {}) });
    const plan = run();
    const own = plan.lines.filter((l) => l.holdsId === 'breakwater-1');
    // Stations: first end (towards the far end) and an outward pair, the joint at 19.9 m (both ways), the far end outward.
    expect(own.filter((l) => l.role === 'side')).toHaveLength(6);
    expect(own.filter((l) => l.role === 'tip')).toHaveLength(4);
    expect(own.every((l) => l.fixing === 'seabed')).toBe(true);
    // Wind on the freeboard: ½ · 1.25 · 22² · 1.6 = 484 Pa · 39.8 m · 0.55 m = 10 595 N across.
    expect(plan.loads[0]!.lateralKn).toBeCloseTo((484 * 39.8 * 0.55) / 1000, 6);
    expect(plan.issues.some((i) => i.code === 'BREAKWATER_ANCHORING')).toBe(true);
    // Waves from the north travel square to it: + 2 kN/m · 39.8 m across (no height known: the full load).
    expect(run({ from: [0], exceeding: [] }).loads[0]!.lateralKn).toBeCloseTo((484 * 39.8 * 0.55) / 1000 + 79.6, 6);
  });

  it('wave load in proportion to the 50-year wave height (D57, I104)', () => {
    // None up to 0.3 m, full from 0.6 m, Hm0² between: 0.45 m → (0.2025 − 0.09) / (0.36 − 0.09) = 0.4167.
    expect(waveLoadFactor(null, params)).toBe(1);
    expect(waveLoadFactor(0.3, params)).toBe(0);
    expect(waveLoadFactor(0.2, params)).toBe(0);
    expect(waveLoadFactor(0.6, params)).toBe(1);
    expect(waveLoadFactor(1.2, params)).toBe(1);
    expect(waveLoadFactor(0.45, params)).toBeCloseTo(0.1125 / 0.27, 9);
    expect(waveLoadFactor(0.1, { waveLoadMinHs: 0.3, waveLoadFullHs: 0 })).toBe(1);
    const run = (hs50: (number | null)[]) =>
      anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5, waves: { from: [90], exceeding: [], hs50 } });
    // 0.45 m from the east: 2 · 0.4167 kN/m on 30 m = 25.0 kN across.
    const mid = run([0.45]);
    expect(mid.loads[0]!.lateralKn).toBeCloseTo(14.036 + 60 * (0.1125 / 0.27), 6);
    expect(mid.issues.find((i) => i.code === 'WAVE_LOAD')!.message).toContain('P1 across 25.0 kN (0.8 kN/m)');
    expect(run([0.8]).loads).toEqual(run([null]).loads);
    // Small waves: no wave load, and a note says why.
    const small = run([0.25]);
    expect(small.loads).toEqual(plan.loads);
    expect(small.issues.some((i) => i.code === 'WAVE_LOAD')).toBe(false);
    expect(small.issues.find((i) => i.code === 'WAVE_LOAD_SMALL_WAVES')!.message).toContain('0.25 m');
    // The larger of two directions of the same kind: east 0.45 m and west 0.6 m across → full load.
    const two = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5, waves: { from: [90, 270], exceeding: [], hs50: [0.45, 0.6] } });
    expect(two.loads[0]!.lateralKn).toBeCloseTo(14.036 + 60, 6);
  });

  describe('access pontoon in front of the shore (D28)', () => {
    /**
     * Access pontoon 100 m × 3 m along the shore (y = 0) with its edge 0.5 m off it.
     * Wind on it: 100 · 0.5 · 484 = 24 200 N; along the wall (its end) 3 · 0.5 · 484 = 726 N.
     * Water side: ⌈100/12⌉ + 1 = 10 stations, one line each, 2 420 N, anchored in the water.
     * Shore chains at the gangway (middle), crossed at 45°: plan length 0.5 / cos 45° = 0.707 m,
     * chain 0.707 + 1.5 + 0.9 = 3.107 m.
     */
    const access = { id: 'access-1', start: { x: -50, y: 2 }, end: { x: 50, y: 2 }, width: 3 };
    const withAccess = (piers: MainPier[]) =>
      anchoringPlan({
        layout: { piers, berths: [] },
        site: { ...site, accessPontoons: [access] },
        classes: [boat],
        params,
        priceList: LIST,
        vatPct: 25.5,
        pierFreeboard: 0.5,
      });

    it('alone: chains on the water side, the shore chains hold it off the wall', () => {
      const plan1 = withAccess([]);
      expect(plan1.loads[0]!.lateralKn).toBeCloseTo(24.2, 6);
      const seabed = plan1.lines.filter((l) => l.fixing === 'seabed');
      expect(seabed).toHaveLength(10);
      for (const l of seabed) {
        expect(l.horizontalKn).toBeCloseTo(2.42, 6);
        expect(l.splay).toBe('none');
        // Fixed on the edge towards the wall (y = 0.5), anchored beyond the far edge.
        expect(l.fix.y).toBeCloseTo(0.5, 9);
        expect(l.anchor.y).toBeGreaterThan(3.5);
      }
      // Off the wall the whole 24 200 N goes to the 2 shore chains: 24 200 / 2 / cos 45° = 17 112 N
      // (along the wall 726 / sin 45° = 1 027 N is less). Tension at the extreme water level:
      // H · 3.107 / √(3.107² − 1.5²) = 1.142 · H = 19 538 N; 3 · 19.5 = 58.6 kN ≤ 61.8 kN → c13.
      const shore = plan1.lines.filter((l) => l.fixing === 'wall');
      expect(shore).toHaveLength(2);
      const L = Math.SQRT1_2 + 1.5 + 0.9;
      for (const l of shore) {
        expect(l.horizontalKn).toBeCloseTo(24.2 / 2 / Math.SQRT1_2, 6);
        expect(l.governs).toBe('across');
        expect(l.chainLength).toBeCloseTo(L, 9);
        expect(l.topTensionKn).toBeCloseTo((l.horizontalKn * L) / Math.sqrt(L * L - 2.25), 9);
        expect(l.chainId).toBe('c13');
        expect(l.anchorId).toBeNull();
        expect(l.anchorCount).toBe(0);
        // Crossed under the gangway: from the edge (y = 0.5) to the wall (y = 0), 0.5 m apart.
        expect(l.fix.y).toBeCloseTo(0.5, 9);
        expect(l.anchor.y).toBeCloseTo(0, 9);
        expect(Math.abs(l.anchor.x - l.fix.x)).toBeCloseTo(0.5, 9);
        expect(Math.sign(l.anchor.x - l.fix.x)).toBe(-Math.sign(l.fix.x));
      }
      expect(plan1.issues.find((i) => i.code === 'ACCESS_PONTOON_SHORE_CHAINS')?.message).toMatch(/shore chains 24\.2 kN\./);
      expect(plan1.issues.some((i) => i.code === 'ANCHOR_OUTSIDE_WATER')).toBe(false);
      expect(plan1.issues.some((i) => i.code === 'ALONG_PIER_LOAD_NOT_HELD')).toBe(false);
    });

    it('with a pier attached: the load off the wall is shared by tributary length', () => {
      // Pier from the water-side edge at x = 20 (t = 70 along the pontoon); the gangway at t = 50.
      // Tributary lengths: gangway 0…60 m, pier 60…100 m → 14 520 N and 9 680 N.
      const pier2: MainPier = { id: 'P2', start: { x: 20, y: 3.5 }, end: { x: 20, y: 33.5 }, width: 3, locked: false, origin: 'manual' };
      const plan2 = withAccess([pier2]);
      // The pier's own wind along it from the shore is its end, 3 · 0.5 · 484 = 726 N.
      expect(plan2.loads.find((l) => l.id === 'P2')!.axialFromShoreKn).toBeCloseTo(0.726 + 9.68, 6);
      for (const l of plan2.lines.filter((x) => x.fixing === 'wall')) expect(l.horizontalKn).toBeCloseTo(14.52 / 2 / Math.SQRT1_2, 6);
      expect(plan2.issues.find((i) => i.code === 'ACCESS_PONTOON_SHORE_CHAINS')?.message).toMatch(/shore chains 14\.5 kN, P2 9\.7 kN\./);
    });

    it('gangways placed by the user (D32): 2 shore chains at each, load shared by tributary length', () => {
      // Gangways at 20 and 80 m (x = −30 and 30), a pier at t = 70: tributary lengths 0…45,
      // 45…75 and 75…100 m → 10 890, 7 260 and 6 050 N (shown as 6.0 kN: 6.05 rounds down in
      // binary). Along the wall 726 N, half per gangway.
      const pier2: MainPier = { id: 'P2', start: { x: 20, y: 3.5 }, end: { x: 20, y: 33.5 }, width: 3, locked: false, origin: 'manual' };
      const plan4 = anchoringPlan({
        layout: { piers: [pier2], berths: [] },
        site: { ...site, accessPontoons: [{ ...access, gangways: [80, 20] }] },
        classes: [boat],
        params,
        priceList: LIST,
        vatPct: 25.5,
        pierFreeboard: 0.5,
      });
      const shore = plan4.lines.filter((l) => l.fixing === 'wall');
      expect(shore.map((l) => l.id)).toEqual(['access-1-S1', 'access-1-S2', 'access-1-S3', 'access-1-S4']);
      for (const l of shore.slice(0, 2)) {
        expect(l.horizontalKn).toBeCloseTo(10.89 / 2 / Math.SQRT1_2, 6);
        expect(Math.abs(l.fix.x + 30)).toBeCloseTo(0.25, 9);
      }
      for (const l of shore.slice(2)) {
        expect(l.horizontalKn).toBeCloseTo(6.05 / 2 / Math.SQRT1_2, 6);
        expect(Math.abs(l.fix.x - 30)).toBeCloseTo(0.25, 9);
      }
      expect(plan4.loads.find((l) => l.id === 'P2')!.axialFromShoreKn).toBeCloseTo(0.726 + 7.26, 6);
      expect(plan4.issues.find((i) => i.code === 'ACCESS_PONTOON_SHORE_CHAINS')?.message).toContain(
        '2 shore chains at each of its 2 gangways (at 20.0 m, 80.0 m from its first point)',
      );
      expect(plan4.issues.find((i) => i.code === 'ACCESS_PONTOON_SHORE_CHAINS')?.message).toContain('shore chains at 20.0 m 10.9 kN, P2 7.3 kN, shore chains at 80.0 m 6.0 kN');
    });

    it('without a shoreline: anchored on both sides like a pier', () => {
      const plan3 = anchoringPlan({
        layout: { piers: [], berths: [] },
        site: { ...site, shoreline: [], accessPontoons: [access] },
        classes: [boat],
        params,
        priceList: LIST,
        vatPct: 25.5,
        pierFreeboard: 0.5,
      });
      expect(plan3.lines).toHaveLength(20);
      expect(plan3.lines.every((l) => l.fixing === 'seabed')).toBe(true);
      expect(plan3.issues.some((i) => i.code === 'ACCESS_PONTOON_NO_SHORE')).toBe(true);
    });
  });

  describe('tip chains (D30)', () => {
    const withTips: AnchoringParams = { ...DEFAULT_ANCHORING, seabed: 'sand' };

    it('a pier of 10 m or more gets two crossed chains at its head, splayed outwards', () => {
      // As above, plus the tip pair: 6 lines anchored on each side, across 14 036 / 6 / cos 45° =
      // 3 308.3 N; wind from the sea shared by 6 + 2 head-ward lines, 12 342 / 8 / sin 45° = 2 181.8 N;
      // wind from the shore by the 4 shore-ward lines, 4 363.6 N (governs those).
      const planT = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: withTips, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
      expect(planT.lines).toHaveLength(12);
      const across = 14036 / 6 / Math.SQRT1_2 / 1000;
      const tips = planT.lines.filter((l) => l.role === 'tip');
      expect(tips.map((l) => l.id)).toEqual(['P1-T1', 'P1-T2']);
      for (const l of tips) {
        expect(l.horizontalKn).toBeCloseTo(across, 9);
        expect(l.splay).toBe('head');
        expect(l.fix.y).toBeCloseTo(30, 9);
        expect(l.anchor.y).toBeGreaterThan(30);
        expect(Math.sign(l.fix.x)).toBe(-Math.sign(l.anchor.x));
        expect(l.anchor.y - l.fix.y).toBeCloseTo(Math.abs(l.anchor.x - l.fix.x), 9);
      }
      for (const l of planT.lines.filter((x) => x.role === 'side' && x.splay === 'head')) {
        expect(l.horizontalKn).toBeCloseTo(across, 9);
        expect(l.governs).toBe('across');
      }
      for (const l of planT.lines.filter((x) => x.splay === 'shore')) {
        expect(l.horizontalKn).toBeCloseTo(12342 / 4 / Math.SQRT1_2 / 1000, 9);
        expect(l.governs).toBe('along');
      }
      // A limit above the pier length turns them off.
      const off = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: { ...withTips, tipAnchorMinLength: 30.5 }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
      expect(off.lines.some((l) => l.role === 'tip')).toBe(false);
    });

    it('a finger longer than the limit gets an end pile: half the full broadside wind of its boats (D31)', () => {
      // Finger 10 m × 0.8 m on the left of the pier at y = 10…10.8, a 12 m × 3.5 m boat each side.
      // Broadside 12 · (0.15 · 12) = 21.6 m² each → 43.2 m² · 484 Pa = 20 908.8 N, no shielding
      // (UFC 4-152-07); the pile takes half, 10.454 kN → Marinetek G200 (20 kN).
      const big: BoatClass = { id: 'b12', name: '12 m', length: 12, beam: 3.5, color: '#000', share: 1, count: 0 };
      const slot = (y0: number, y1: number) => [{ x: -1.5, y: y0 }, { x: -1.5, y: y1 }, { x: -14, y: y1 }, { x: -14, y: y0 }];
      const two: Berth[] = [
        { id: 'P1-L1', pierId: 'P1', side: 'left', boatClassId: 'b12', slot: slot(6, 10), boat: [], removed: false, issues: [] },
        { id: 'P1-L2', pierId: 'P1', side: 'left', boatClassId: 'b12', slot: slot(10.8, 14.8), boat: [], removed: false, issues: [] },
      ];
      const finger = { id: 'P1-F1', pierId: 'P1', shape: [{ x: -1.5, y: 10 }, { x: -1.5, y: 10.8 }, { x: -11.5, y: 10.8 }, { x: -11.5, y: 10 }] };
      const run = (over: Partial<AnchoringParams>) =>
        anchoringPlan({ layout: { piers: [pier], berths: two, fingers: [finger] }, site: pierSite, classes: [big], params: { ...withTips, ...over }, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
      // Default: only fingers longer than 12 m (Marinetek) → none for a 10 m finger.
      const byDefault = run({});
      expect(byDefault.piles).toEqual([]);
      expect(byDefault.issues.some((i) => i.code === 'FINGER_END_PILES')).toBe(false);
      const planF = run({ fingerPileMinLength: 9.5 });
      expect(planF.loads.find((l) => l.id === 'P1-F1')!.lateralKn).toBeCloseTo(20.9088, 6);
      expect(planF.piles).toHaveLength(1);
      const pile = planF.piles[0]!;
      expect(pile.holdsId).toBe('P1-F1');
      expect(pile.at.x).toBeCloseTo(-11.5, 9);
      expect(pile.at.y).toBeCloseTo(10.4, 9);
      expect(pile.loadKn).toBeCloseTo(10.4544, 6);
      expect(pile.guide).toBe('G200');
      // No chains at the finger: the pile holds it.
      expect(planF.lines.every((l) => l.holdsId === 'P1')).toBe(true);
      expect(planF.issues.find((i) => i.code === 'FINGER_END_PILES')?.message).toMatch(/^1 fingers longer than 9\.5 m/);
      // At 35 m/s the load grows by (35/22)²: 26.46 kN → G400 (40 kN).
      const windy = run({ fingerPileMinLength: 9.5, windSpeed: 35 });
      expect(windy.piles[0]!.loadKn).toBeCloseTo(10.4544 * (35 / 22) ** 2, 6);
      expect(windy.piles[0]!.guide).toBe('G400');
    });
  });

  it('pile guides: the smallest Marinetek guide whose design load is enough', () => {
    expect(choosePileGuide(15)).toBe('G200');
    expect(choosePileGuide(20)).toBe('G200');
    expect(choosePileGuide(25)).toBe('G400');
    expect(choosePileGuide(60)).toBe('G700');
    expect(choosePileGuide(75)).toBeNull();
  });

  it('tributary lengths: half-way to the neighbours, the ends to the ends', () => {
    expect(tributaryLengths([50, 70], 100)).toEqual([60, 40]);
    expect(tributaryLengths([70, 50], 100)).toEqual([40, 60]);
    expect(tributaryLengths([30], 60)).toEqual([60]);
    // Points outside the pontoon count at its ends; coincident points split at that point.
    expect(tributaryLengths([-5, 5, 5], 10)).toEqual([2.5, 2.5, 5]);
  });

  it('anchors outside the water area are reported', () => {
    // The lines fixed on the right edge are anchored about 15 m left of the pier (span ≈ 21 m at
    // 45°); with the water ending 10 m left of it their anchors lie on land, and so do the anchors of
    // shore-ward chains that reach behind the shore end (y < 0).
    const tight = { ...pierSite, water: [{ x: -10, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: -10, y: 100 }] };
    const plan2 = anchoringPlan({ layout: { piers: [pier], berths }, site: tight, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const outside = plan2.lines.filter((l) => l.anchor.x < -10 || l.anchor.y < 0).length;
    expect(outside).toBeGreaterThanOrEqual(5);
    const issue = plan2.issues.find((i) => i.code === 'ANCHOR_OUTSIDE_WATER');
    expect(issue?.message).toMatch(new RegExp(`^${outside} anchors lie outside the water area`));
    expect(plan.issues.some((i) => i.code === 'ANCHOR_OUTSIDE_WATER')).toBe(plan.lines.some((l) => l.anchor.y < 0));
  });

  it('is deterministic', () => {
    const again = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    expect(again).toEqual(plan);
  });
  it('wedge anchors on clay: chains lengthened to the 5° limit, mass from Table 35', () => {
    const clay: AnchoringParams = { ...params, seabed: 'clay', anchorType: 'wedge' };
    const wedge = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: clay, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
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
    const H = 14036 / 5 / Math.SQRT1_2;
    expect(lateral.chainId).toBe('c13');
    expect(upliftAngle(H, chainLine(5.5, 22, H, w13).uplift)).toBeGreaterThan(5);
    expect(lateral.chainLength).toBeGreaterThan(22);
    expect(upliftAngle(H, chainLine(5.5, lateral.chainLength - 0.1, H, w13).uplift)).toBeGreaterThan(5);
    // 3 970.0 N → 404.8 kg: the 1 000 kg anchor, the lightest in the list.
    expect(lateral.requiredAnchorKg).toBeCloseTo(404.8, 1);
    expect(lateral.anchorId).toBe('a1000');
    expect(wedge.issues.some((i) => i.code === 'WEDGE_ANCHORS')).toBe(true);
  });

  it('wedge anchors are not sized on rock: plain blocks and a warning', () => {
    const rock: AnchoringParams = { ...params, seabed: 'rock', anchorType: 'wedge' };
    const onRock = anchoringPlan({ layout: { piers: [pier], berths }, site: pierSite, classes: [boat], params: rock, priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 });
    const line = onRock.lines[0]!;
    expect(line.anchorType).toBe('block');
    expect(line.chainLength).toBeCloseTo(22, 9);
    expect(line.requiredAnchorKg).toBeCloseTo(requiredAnchorMass(line.horizontalKn * 1000, line.upliftKn * 1000, rock), 6);
    expect(onRock.issues.some((i) => i.code === 'WEDGE_NOT_ON_ROCK')).toBe(true);
    // I102: no comparison on rock (no wedge tables).
    expect(onRock.comparison).toBeUndefined();
  });

  it('compares the anchors with the other anchor type (I102)', () => {
    const input = { layout: { piers: [pier], berths }, site: pierSite, classes: [boat], priceList: LIST, vatPct: 25.5, pierFreeboard: 0.5 };
    const wedge = anchoringPlan({ ...input, params: { ...params, anchorType: 'wedge' } });
    expect(plan.comparison).toEqual({ current: anchorTotals(plan.lines, 'block'), other: anchorTotals(wedge.lines, 'wedge') });
    expect(wedge.comparison).toEqual({ current: anchorTotals(wedge.lines, 'wedge'), other: anchorTotals(plan.lines, 'block') });
    const total = plan.lines.filter((l) => l.fixing === 'seabed').reduce((s, l) => s + l.requiredAnchorKg, 0);
    expect(plan.comparison!.current.totalKg).toBeCloseTo(total, 6);
    expect(plan.comparison!.other.longestChainM).toBeGreaterThan(plan.comparison!.current.longestChainM);
    // Without waves no note; turned off, no comparison.
    expect(plan.issues.some((i) => i.code === 'WAVE_LOAD_PLAIN_BLOCKS')).toBe(false);
    expect(anchoringPlan({ ...input, params, compareAnchorTypes: false }).comparison).toBeUndefined();
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
