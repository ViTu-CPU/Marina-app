/**
 * The anchoring plan after the owner's specification (D64, docs/ANKKUROINTI_MITOITUS_SPEC.md): the
 * layout of the legs (D25, D28, D30, D46, D49, D58), and the sizing with engine/mooring.ts (its own
 * Appendix B tests are in mooring.test.ts). Expected values are computed with the spec's functions,
 * so that these tests check how the plan uses them.
 */
import { describe, expect, it } from 'vitest';
import { anchorPieceCost, chooseBlock, groupThousands, installParams, pileProduct } from '../anchorChoice';
import {
  anchoringPlan,
  anchoringStatus,
  anchoringStatusText,
  chainLengthFor,
  choosePileGuide,
  DEFAULT_ANCHORING,
  evenJoints,
  frictionSensitivity,
  MOORING_DISCLAIMER,
  MOORING_NOTES,
  resetAnchoringFactors,
  SOFT_CLAY_NOTE,
  type AnchoringInput,
  type AnchoringParams,
} from '../anchoring';
import type { PriceList, Product } from '../catalog';
import type { Berth, BoatClass, MainPier, Site } from '../model';
import { distributeToLegs, environmentalLoads, requiredAnchorMassFriction, vesselWindArea, windPressure } from '../mooring';

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

/** Chains of A-Laiturit-like data and blocks up to 5 t; prices VAT 0 %. */
const LIST: PriceList = {
  title: 'test',
  parameters: [],
  products: [
    product({ id: 'c13', category: 'chain', unit: 'm', price: 10, chainDiameterMm: 13, breakingLoadKn: 61.8, massKgPerM: 3.1 }),
    product({ id: 'c16', category: 'chain', unit: 'm', price: 12, chainDiameterMm: 16, breakingLoadKn: 98.1, massKgPerM: 4.5 }),
    product({ id: 'c22', category: 'chain', unit: 'm', price: 20, chainDiameterMm: 22, breakingLoadKn: 190, massKgPerM: 10 }),
    product({ id: 'c30-no-mbl', category: 'chain', unit: 'm', price: 5, chainDiameterMm: 30, massKgPerM: 20 }),
    product({ id: 'a1000', category: 'anchor', price: 300, anchorMassKg: 1000 }),
    product({ id: 'a2000', category: 'anchor', price: 480, anchorMassKg: 2000 }),
    product({ id: 'a3000', category: 'anchor', price: 700, anchorMassKg: 3000 }),
    product({ id: 'a5000', category: 'anchor', price: 1200, anchorMassKg: 5000 }),
    product({ id: 'a10000', category: 'anchor', price: 2000, anchorMassKg: 10000 }),
  ],
};

/** Pier 30 m × 3 m (axis +y), freeboard 0.5 m, four 10 m motor boats on its left side (−x). */
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
  water: [{ x: -100, y: -40 }, { x: 100, y: -40 }, { x: 100, y: 100 }, { x: -100, y: 100 }],
  // 30 m behind the pier, beyond its gangway: no shore chains (see 'shore chains under the gangway').
  shoreline: [{ x: -100, y: -30 }, { x: 100, y: -30 }],
  entrance: { a: { x: -100, y: 100 }, b: { x: 100, y: 100 } },
  obstacles: [],
  zones: [],
};
const base = (over: Partial<AnchoringParams> = {}, more: Partial<AnchoringInput> = {}): AnchoringInput => ({
  layout: { piers: [pier], berths },
  site,
  classes: [boat],
  params: { ...DEFAULT_ANCHORING, tipAnchorMinLength: 1000, ...over },
  priceList: LIST,
  vatPct: 25.5,
  pierFreeboard: 0.5,
  ...more,
});
const plan = (over: Partial<AnchoringParams> = {}, more: Partial<AnchoringInput> = {}) => anchoringPlan(base(over, more));
const codes = (r: ReturnType<typeof plan>) => r.issues.map((i) => i.code);

describe('defaults (spec §2, owner D64)', () => {
  it('the spec’s defaults and the owner’s limits', () => {
    expect(DEFAULT_ANCHORING).toMatchObject({
      seabed: 'mediumClay',
      waveMin: 2,
      waveLineLoad: 0,
      currentSpeed: 0,
      waterDensity: 1025,
      concreteDensity: 2400,
      chainSafetyFactor: 3,
      slidingSafetyFactor: 1.5,
      unevenFactor: 1,
      capacityFactor: 1,
      pontoonFreeboard: 0.5,
      pontoonDraft: 0.5,
      leewardFactor: 0.2,
      maxAnchorMass: 5000,
      maxAnchorsPerLine: 1,
      chainLengthFactor: 5,
      winterInWater: true,
      cohesive: null,
    });
    // NAVFAC DM-7.02 lower ends.
    expect(DEFAULT_ANCHORING.friction).toEqual({ rock: 0.7, gravelCoarseSand: 0.55, fineMediumSand: 0.45, fineSiltySand: 0.35, silt: 0.3, stiffClay: 0.4, mediumClay: 0.3 });
  });

  it('resetting the factors keeps the site values (U19)', () => {
    const site = { ...DEFAULT_ANCHORING, depth: 7, seabed: 'silt' as const, windSpeed: 30, waveLineLoad: 3, slopeDeg: 4, chainSafetyFactor: 5, unevenFactor: 1.3 };
    const reset = resetAnchoringFactors(site);
    expect(reset).toMatchObject({ depth: 7, seabed: 'silt', windSpeed: 30, waveLineLoad: 3, slopeDeg: 4, chainSafetyFactor: 3, unevenFactor: 1 });
  });

  it('chain length: factor × depth at high water, at least depth + 1 m', () => {
    expect(chainLengthFor(5.5, DEFAULT_ANCHORING)).toBeCloseTo(27.5, 9);
    expect(chainLengthFor(5.5, { ...DEFAULT_ANCHORING, chainLengthFactor: 1 })).toBeCloseTo(6.5, 9);
  });
});

describe('a main pier', () => {
  const r = plan({ seabed: 'gravelCoarseSand', windSpeed: 15, waveMin: 0.5 });
  const seabed = r.lines.filter((l) => l.fixing === 'seabed');

  it('loads of the spec (AS 3962) for the pier and its boats: four main directions', () => {
    const expected = environmentalLoads(
      { length: 30, width: 3, freeboard: 0.5, draft: 0.5, type: 'walkway' },
      { sideA: [0, 1, 2, 3].map(() => ({ loa: 10, type: 'motor' as const })), sideB: [] },
      { windSpeed: 15, waveLineLoad: 0, currentSpeed: 0, waterDensity: 1025, iceLineLoad: 0, extraStatic_kN: 0, winterInWater: true },
      { leewardFactor: 0.2, waveMin: 0.5 },
    );
    expect(r.loads).toHaveLength(1);
    expect(r.loads[0]!.cases).toEqual(expected.cases);
    // Across with the boats' side (left, +y local) to windward: 0.135 kPa · 1.1 · 4 · 7 m² + 0.135 · 2 · 30 · 0.5 + 1.5 · 0.5 · 30.
    const q = windPressure(15);
    const towardsRight = r.loads[0]!.cases.find((c) => c.id === 'perp-')!;
    expect(towardsRight.F_uls).toBeCloseTo(q * 1.1 * 4 * 7 + q * 2 * 30 * 0.5 + 1.5 * 0.5 * 30, 9);
    expect(codes(r)).toContain('WAVE_MIN_BELOW_AS3962');
  });

  it('10 crossed legs: an X at every joint, towards the head at the shore end (D46)', () => {
    // No module lengths: joints every 12 m (12 and 24 m); 2 + 2 · 4 = 10 legs at ±45° and ±135°.
    expect(seabed).toHaveLength(10);
    expect(seabed.filter((l) => l.splay === 'head')).toHaveLength(6);
    expect(seabed.filter((l) => l.splay === 'shore')).toHaveLength(4);
    expect([...new Set(seabed.map((l) => Math.round(l.dirDeg)))].sort((a, b) => a - b)).toEqual([-135, -45, 45, 135]);
    expect(evenJoints(30, 12)).toEqual([12, 24]);
  });

  it('every case is shared by the legs anchored opposite the load (spec §4)', () => {
    for (const c of r.loads[0]!.cases) {
      const d = distributeToLegs(c.F_uls, c.dir, seabed.map((l) => ({ dirDeg: l.dirDeg })));
      if (!d.ok) throw new Error(d.error);
      seabed.forEach((l, i) => {
        const own = l.loadCases.find((x) => x.case === c.id && x.waterLevel === 'HW');
        if (d.Th[i]! > 0) expect(own!.Th, `${l.id} ${c.id}`).toBeCloseTo(d.Th[i]!, 9);
        else expect(own).toBeUndefined();
      });
    }
    for (const l of seabed) expect(l.horizontalKn).toBeCloseTo(Math.max(...l.loadCases.map((x) => x.Th)), 9);
  });

  it('chain: the cheapest with factor of safety ≥ 3 at low and high water, 5 × the depth at high water', () => {
    for (const l of seabed) {
      expect(l.chainLength).toBeCloseTo(5 * (4 + 1.5), 9);
      expect(l.chainFoS!).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(new Set(l.loadCases.map((x) => x.waterLevel))).toEqual(new Set(['LW', 'HW']));
      const d = LIST.products.find((p) => p.id === l.chainId)!.chainDiameterMm!;
      // No cheaper chain of the list would hold: a smaller diameter fails somewhere.
      if (d > 13) expect(l.chainFoS! < 3 * (190 / 98.1)).toBe(true);
    }
    expect(codes(r)).not.toContain('CHAIN_BELOW_5_DEPTHS');
  });

  it('anchor: concrete blocks of at least the required dry mass of the spec (5.4)', () => {
    for (const l of seabed) {
      const req = Math.max(...l.loadCases.map((x) => requiredAnchorMassFriction(x.Th, x.Fv, 0.55, 1.5, 2400, 1025)));
      expect(l.requiredAnchorKg).toBeCloseTo(req, 6);
      expect(l).toMatchObject({ status: 'OK', anchorKind: 'block', anchorCount: 1, pileReason: null });
      expect(LIST.products.find((p) => p.id === l.anchorId)!.anchorMassKg!).toBeGreaterThanOrEqual(req);
      expect(l.governing!.anchorFoS!).toBeGreaterThanOrEqual(1.5 - 1e-9);
    }
    expect(anchoringStatus(r.lines)).toEqual({ ok: 10, piles: 0 });
    expect(anchoringStatusText(anchoringStatus(r.lines))).toBe('10 lines with concrete anchors, 0 lines with pile anchors');
  });

  it('heavier needs than 5 t take a pile anchor at the end of the chain (D64)', () => {
    const clay = plan();
    const sb = clay.lines.filter((l) => l.fixing === 'seabed');
    for (const l of sb) {
      expect(l.requiredAnchorKg).toBeGreaterThan(5000);
      expect(l).toMatchObject({ status: 'PILE', anchorKind: 'pile', anchorId: null, anchorCount: 1 });
      expect(l.pileReason).toBe(`block: needs ${groupThousands(l.requiredAnchorKg)} kg, max product 5 000 kg`);
      // The factor of safety shown is the heaviest block's (5 t; the 10 t block is beyond the limit).
      expect(l.governing!.anchorFoS!).toBeLessThan(1.5);
    }
    expect(clay.issues.find((i) => i.code === 'PILE_ANCHORS')!.message).toMatch(/^P1: 10 of 10 anchor lines take a pile anchor at the end of the chain: no concrete anchor of at most 5 000 kg holds them/);
    // With a pile anchor in the price list, it is the line's product.
    const withPile = plan({}, { priceList: { ...LIST, products: [...LIST.products, product({ id: 'pile1', category: 'anchor', anchorKind: 'pile', price: 3000 })] } });
    expect(withPile.lines.filter((l) => l.fixing === 'seabed').every((l) => l.anchorId === 'pile1')).toBe(true);
    // A larger limit allows the 10 t block where it holds.
    expect(pileProduct(LIST, 25.5)).toBeNull();
  });

  it('soft clay / mud: no friction model, pile anchors until the cohesive model is given', () => {
    const mud = plan({ seabed: 'softClayMud' });
    expect(mud.lines.filter((l) => l.fixing === 'seabed').every((l) => l.status === 'PILE' && Number.isNaN(l.requiredAnchorKg))).toBe(true);
    expect(codes(mud)).toContain('NO_FRICTION_MODEL');
    // Cohesive model (spec 5.3) of a 3 t block: 20 · 3 + (2 · 10 · 0.5 + ½ · 6 · 0.25) · 1.5 = 76.1 kN.
    const cohesive = { Su_z: 20, Su_a: 10, A: 3, B: 1.5, z: 0.5, gammaB: 6, massDryKg: 3000 };
    const held = plan({ seabed: 'softClayMud', cohesive, windSpeed: 15, waveMin: 0.5 });
    for (const l of held.lines.filter((x) => x.fixing === 'seabed')) {
      expect(l).toMatchObject({ status: 'OK', anchorId: 'a3000' });
      expect(l.governing!.anchorCapacity).toBeCloseTo(76.125, 9);
    }
    expect(codes(held)).not.toContain('NO_FRICTION_MODEL');
  });

  it('a capacity factor above 1 needs a documented basis; it divides the required mass', () => {
    const cf = plan({ seabed: 'gravelCoarseSand', windSpeed: 15, waveMin: 0.5, capacityFactor: 2 });
    expect(codes(cf)).toContain('CAPACITY_FACTOR_WITHOUT_SOURCE');
    expect(codes(plan({ seabed: 'gravelCoarseSand', capacityFactor: 2, capacityFactorSource: 'pull test 2026' }))).not.toContain('CAPACITY_FACTOR_WITHOUT_SOURCE');
    const l1 = seabed[0]!;
    const l2 = cf.lines.find((l) => l.id === l1.id)!;
    expect(l2.requiredAnchorKg).toBeLessThan(l1.requiredAnchorKg);
  });

  it('two blocks per line only as the user’s tandem choice, with a warning', () => {
    const t = plan({ seabed: 'stiffClay', windSpeed: 15, waveMin: 0.5, maxAnchorsPerLine: 2, maxAnchorMass: 3000 });
    const pairs = t.lines.filter((l) => l.anchorCount === 2);
    expect(pairs.length).toBeGreaterThan(0);
    expect(codes(t)).toContain('TANDEM_ANCHORS');
    expect(codes(plan({ seabed: 'stiffClay', windSpeed: 15, waveMin: 0.5, maxAnchorMass: 3000 }))).not.toContain('TANDEM_ANCHORS');
  });

  it('square legs (0°) leave the load along the pier unresisted: an error', () => {
    const square = plan({ splayAngle: 0 });
    const errs = square.issues.filter((i) => i.code === 'NO_LEG_FOR_DIRECTION');
    expect(errs.map((e) => e.severity)).toEqual(['error', 'error']);
    expect(errs.map((e) => e.message.slice(0, 7))).toEqual(['P1 par+', 'P1 par-']);
  });

  it('a 4 × depth chain is flagged against the FCG / Top Marine rule', () => {
    expect(codes(plan({ chainLengthFactor: 4.5 }))).toContain('CHAIN_BELOW_5_DEPTHS');
    expect(codes(plan({ chainLengthFactor: 3 }))).toContain('CHAIN_BELOW_4_DEPTHS');
  });

  it('warnings: winter use (D17), boats outside Table 4.4, over 25 m, waves above the criteria', () => {
    expect(codes(r)).toContain('WINTER_IN_WATER');
    expect(codes(plan({ winterInWater: false }))).not.toContain('WINTER_IN_WATER');
    const small = { ...boat, length: 6 };
    expect(codes(plan({}, { classes: [small] }))).toContain('VESSEL_OUTSIDE_TABLE_4_4');
    expect(codes(plan({}, { classes: [{ ...boat, length: 30 }] }))).toContain('VESSEL_OVER_25M_TODO');
    expect(plan({}, { waves: { exceeding: ['E'] } }).issues.find((i) => i.code === 'WAVE_LOAD_ABOVE_CRITERIA')!.message).toMatch(/^The waves from E exceed/);
  });

  it('the spec’s required text and notes', () => {
    expect(MOORING_DISCLAIMER).toBe("Preliminary sizing. Does not replace the designer's calculation, a geotechnical survey or the manufacturer's (e.g. Seaflex/JFlex) design. Ice loads are not designed.");
    const text = MOORING_NOTES.map((n) => n.text).join(' ');
    for (const s of ['lower-bound estimate', 'OTC 6033', 'several small anchors', 'Tobiasson & Kollmeyer', 'Parainen', 'JFlex', 'TODO']) expect(text).toContain(s);
  });

  it('is deterministic', () => {
    expect(plan()).toEqual(plan());
  });
});

describe('the layout of other legs', () => {
  it('tip chains: a pier of 10 m or more gets two crossed chains at its head, splayed outwards (D30)', () => {
    const r = plan({ tipAnchorMinLength: 10 });
    const tips = r.lines.filter((l) => l.role === 'tip');
    expect(tips.map((l) => l.id)).toEqual(['P1-T1', 'P1-T2']);
    expect(tips.every((l) => l.splay === 'head' && l.fix.y === 30)).toBe(true);
  });

  it('a pier reached by a gangway: two shore chains crossed under it to the wall (D49), holding it towards the head', () => {
    const near: Site = { ...site, shoreline: [{ x: -100, y: -4 }, { x: 100, y: -4 }] };
    const r = plan({}, { site: near });
    const shore = r.lines.filter((l) => l.fixing === 'wall');
    expect(shore.map((l) => l.id)).toEqual(['P1-S1', 'P1-S2']);
    for (const l of shore) {
      expect(l.anchorKind).toBeNull();
      expect(l.chainLength).toBeCloseTo(4 / Math.SQRT1_2 + 1.5 + 0.9, 9);
      // They hold the pier towards its head (par+) and, splayed, one side each; never towards the shore.
      expect(l.loadCases.some((c) => c.case === 'par+')).toBe(true);
      expect(l.loadCases.some((c) => c.case === 'par-')).toBe(false);
    }
    expect(new Set(shore.flatMap((l) => l.loadCases.map((c) => c.case)))).toEqual(new Set(['par+', 'perp+', 'perp-']));
  });

  it('an access pontoon in front of the wall: chains on the water side and shore chains at its gangway (D28)', () => {
    const wall: Site = { ...site, shoreline: [{ x: -100, y: 0 }, { x: 100, y: 0 }], accessPontoons: [{ id: 'AP1', start: { x: -20, y: 2 }, end: { x: 20, y: 2 }, width: 3 }] };
    const r = anchoringPlan({ ...base(), layout: { piers: [], berths: [] }, site: wall, classes: [] });
    const own = r.lines.filter((l) => l.holdsId === 'AP1');
    const water = own.filter((l) => l.fixing === 'seabed');
    expect(water.length).toBeGreaterThan(0);
    // The water side is +y; every seabed leg points there.
    expect(water.every((l) => l.anchor.y > l.fix.y)).toBe(true);
    expect(own.filter((l) => l.fixing === 'wall')).toHaveLength(2);
    expect(codes(r)).toContain('ACCESS_PONTOON_SHORE_CHAINS');
    const alone = anchoringPlan({ ...base(), layout: { piers: [], berths: [] }, site: { ...wall, shoreline: [] }, classes: [] });
    expect(alone.lines.some((l) => l.anchor.y < l.fix.y)).toBe(true);
    expect(alone.issues.map((i) => i.code)).toContain('ACCESS_PONTOON_NO_SHORE');
  });

  it('a breakwater: outward pairs at both ends, sized as a wave attenuator with the FCG 2022 rules (D58)', () => {
    const bw: Site = { ...site, breakwaters: [{ id: 'BW1', start: { x: -40, y: 80 }, end: { x: 40, y: 80 }, product: '4300K' }] };
    const r = anchoringPlan({ ...base(), layout: { piers: [], berths: [] }, site: bw, classes: [] });
    const own = r.lines.filter((l) => l.holdsId === 'BW1');
    expect(own.filter((l) => l.role === 'tip')).toHaveLength(4);
    expect(r.loads[0]!.kind).toBe('breakwater');
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['BREAKWATER_ANCHORING', 'FCG_CHAIN', 'FCG_ANCHOR_MASS_PER_METRE']));
  });

  it('a finger longer than the limit gets an end pile: half the full broadside wind of its boats (D31)', () => {
    // A thin finger between P1-L1 (ends at y 5) and P1-L2 (starts at y 5).
    const finger = { id: 'F1', pierId: 'P1', shape: [{ x: -1.5, y: 5 }, { x: -1.5, y: 5.02 }, { x: -15, y: 5.02 }, { x: -15, y: 5 }] };
    const big = { ...boat, length: 14 };
    const r = plan({}, { layout: { piers: [pier], berths, fingers: [finger] }, classes: [big] });
    expect(r.piles).toHaveLength(1);
    // The berths each side of the finger (P1-L1 ends at y 5, P1-L2 starts at 5): 2 boats.
    const q = windPressure(22);
    expect(r.piles[0]!.loadKn).toBeCloseTo((2 * q * 1.1 * vesselWindArea('motor', 14).beam) / 2, 9);
    expect(choosePileGuide(15)).toBe('G200');
    expect(choosePileGuide(71)).toBeNull();
  });

  it('anchors outside the water area are reported', () => {
    const tight: Site = { ...site, water: [{ x: -5, y: -40 }, { x: 5, y: -40 }, { x: 5, y: 100 }, { x: -5, y: 100 }] };
    expect(codes(plan({}, { site: tight }))).toContain('ANCHOR_OUTSIDE_WATER');
  });
});

describe('the block of one line (D62, D64)', () => {
  const opts = { maxPerLine: 1, maxBlockMassKg: 5000, seabed: 'mediumClay' };
  it('the cheapest block heavy enough, one per line; never several; none above the limit', () => {
    expect(chooseBlock(900, opts, LIST, 25.5)).toEqual({ pick: { product: LIST.products[4], count: 1, cost: 300 }, heaviestKg: 5000, reason: null });
    expect(chooseBlock(4000, opts, LIST, 25.5).pick!.product.id).toBe('a5000');
    expect(chooseBlock(8737, opts, LIST, 25.5)).toEqual({ pick: null, heaviestKg: 5000, reason: 'block: needs 8 737 kg, max product 5 000 kg' });
    expect(chooseBlock(8737, { ...opts, maxPerLine: 2 }, LIST, 25.5).pick).toMatchObject({ product: { id: 'a5000' }, count: 2 });
    expect(chooseBlock(12000, { ...opts, maxPerLine: 2 }, LIST, 25.5).reason).toBe('block: needs 12 000 kg, max product 2 × 5 000 kg');
    expect(chooseBlock(Infinity, opts, LIST, 25.5).reason).toBe('block: no friction capacity (the seabed slope leaves none)');
  });

  it('a block without a price only when no priced block holds', () => {
    const withUnpriced: PriceList = { ...LIST, products: [...LIST.products, product({ id: 'a4000-noprice', category: 'anchor', price: null, anchorMassKg: 4000 })] };
    expect(chooseBlock(3500, opts, withUnpriced, 25.5).pick!.product.id).toBe('a5000');
    const onlyUnpriced: PriceList = { ...LIST, products: LIST.products.filter((p) => p.category !== 'anchor').concat(product({ id: 'u', category: 'anchor', price: null, anchorMassKg: 4000 })) };
    expect(chooseBlock(3500, opts, onlyUnpriced, 25.5).pick).toEqual({ product: onlyUnpriced.products.at(-1), count: 1, cost: null });
  });

  it('the cost compared includes the installation when the price is the supply price', () => {
    const rates: PriceList = {
      ...LIST,
      products: [...LIST.products, product({ id: 'rate-diving-team', category: 'labour', unit: 'h', price: 180 }), product({ id: 'rate-work-boat', category: 'plant', unit: 'day', price: 800 })],
      parameters: [
        { key: 'diver_h_per_anchor', value: 1, unit: 'h', description: '', source: 'Assumption.' },
        { key: 'diver_h_per_tonne', value: 0.5, unit: 'h', description: '', source: 'Assumption.' },
        { key: 'anchors_per_boat_day', value: 8, unit: 'pcs', description: '', source: 'Assumption.' },
      ],
    };
    // 700 € + (1 h + 0.5 h/t · 3 t) · 180 €/h + 800 € / 8 = 1 250 €.
    expect(anchorPieceCost(LIST.products[6]!, rates, 25.5)).toBeCloseTo(1250, 9);
    expect(anchorPieceCost({ ...LIST.products[6]!, installedPrice: 999 }, rates, 25.5)).toBe(999);
  });

  it('older price lists: the per-line installation keys stand in', () => {
    const old: PriceList = { ...LIST, parameters: [{ key: 'diver_h_per_anchor_line', value: 2, unit: 'h', description: '', source: '' }, { key: 'boat_days_per_10_anchor_lines', value: 2, unit: 'day', description: '', source: '' }] };
    expect(installParams(old)).toEqual({ diverHoursPerAnchor: 2, diverHoursPerTonne: 0, anchorsPerBoatDay: 5, workBoatMaxLiftKg: 3000, legacyKeys: ['diver_h_per_anchor_line', 'boat_days_per_10_anchor_lines'] });
  });
});

describe('friction sensitivity (D62)', () => {
  it('block masses for μ 0.2 / 0.3 / 0.5 over every load case of each line', () => {
    const r = plan();
    const s = frictionSensitivity(r.lines, DEFAULT_ANCHORING, LIST);
    expect(s.rows.map((x) => [x.friction, x.current])).toEqual([
      [0.2, false],
      [0.3, true],
      [0.5, false],
    ]);
    const mid = s.rows[1]!;
    expect(mid.maxKg).toBeCloseTo(Math.max(...r.lines.filter((l) => l.fixing === 'seabed').map((l) => l.requiredAnchorKg)), 6);
    expect(s.rows[0]!.maxKg).toBeGreaterThan(mid.maxKg);
    expect(s.rows[2]!.maxKg).toBeLessThan(mid.maxKg);
    expect(s.heaviestBlockKg).toBe(5000);
    expect(SOFT_CLAY_NOTE).toBe('Gravity block capacity in soft clay is highly uncertain; requires geotechnical data.');
  });
});
