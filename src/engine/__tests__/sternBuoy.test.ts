import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS } from '../demos';
import { movePier, setBerthClass, type EditContext } from '../edit';
import { generateLayouts } from '../generate';
import { convexInsideRegion, convexPolygonsOverlap, pointInRing } from '../geometry';
import { anchoringPlan, buoyChainLength, buoyTableRow, DEFAULT_ANCHORING, estimateBoatWeight, type AnchoringParams } from '../anchoring';
import { costEstimate } from '../bom';
import type { PriceList, Product } from '../catalog';
import type { Berth, BoatClass, MainPier, Params, Site } from '../model';
import { sternBuoyDistance, sternBuoyPattern } from '../patterns/sternBuoy';
import { pierPolygon, prepareSite } from '../site';

const boat = (id: string): BoatClass => DEFAULT_BOAT_CLASSES.find((c) => c.id === id)!;
const SB: Params = { ...DEFAULT_PARAMS, berthType: 'sternBuoy', waterDepth: 4 };

describe('stern-buoy berths (D35), hand-calculated', () => {
  it('buoy at boat length + water depth; the slot reaches beyond it', () => {
    // 5 m boat in 4 m of water: buoy 9.0 m from the pier edge; slot 9.0 + 0.5 = 9.5 m.
    expect(sternBuoyDistance(boat('c5'), SB)).toBe(9);
    expect(sternBuoyPattern.slotLength(boat('c5'), SB)).toBe(9.5);
    // 12 m boat: 16.0 m and 16.5 m.
    expect(sternBuoyPattern.slotLength(boat('c12'), SB)).toBe(16.5);
  });

  it('one boat per bay, side by side, no fingers', () => {
    expect(sternBuoyPattern.boatsPerBay(SB)).toBe(1);
    const bay = sternBuoyPattern.bay([boat('c5')], 0, SB);
    expect(bay.dividers).toEqual([]);
    expect(bay.advance).toBeCloseTo(2.5, 12); // 2.0 + 0.5
    expect(bay.footprint).toBeCloseTo(2.5, 12);
    expect(bay.berths[0]!.buoy).toEqual({ s: 1.25, d: 9 });
    expect(bay.berths[0]!.boat).toEqual({ s0: 0.25, s1: 2.25, d0: 0.2, d1: 5.2 });
  });
});

describe('stern-buoy layouts on the demo projects', () => {
  for (const demo of DEMO_PROJECTS) {
    const project = demo.create();
    const params: Params = { ...project.params, berthType: 'sternBuoy', waterDepth: project.anchoring.depth };
    const result = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params, objective: project.objective });
    const prepared = prepareSite(project.site, params);

    it(`${demo.id}: every berth has its buoy inside its slot, no fingers, no overlaps, no errors`, () => {
      expect(result.layouts.length).toBeGreaterThan(0);
      for (const layout of result.layouts) {
        expect(layout.fingers).toEqual([]);
        for (const b of layout.berths) {
          expect(b.type).toBe('sternBuoy');
          expect(b.buoy).toBeDefined();
          expect(pointInRing(b.buoy!, b.slot)).toBe(true);
        }
        const shapes = [...layout.piers.map((p) => pierPolygon(p.start, p.end, p.width)), ...layout.berths.map((b) => b.slot)];
        for (const s of shapes) expect(convexInsideRegion(s, prepared.water)).toBe(true);
        let overlaps = 0;
        for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) if (convexPolygonsOverlap(shapes[i]!, shapes[j]!)) overlaps++;
        expect(overlaps).toBe(0);
        expect(layout.stats.issueCounts.error).toBe(0);
      }
    });
  }

  it('moving a pier moves its buoys; a new class moves the buoy with the boat length', () => {
    const project = DEMO_PROJECTS[0]!.create();
    const params: Params = { ...project.params, berthType: 'sternBuoy', waterDepth: 4 };
    const layout = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params, objective: project.objective }).layouts[0]!;
    const ctx: EditContext = { prepared: prepareSite(project.site, params), classes: project.boatClasses, params };
    const pier = layout.piers.find((p) => !p.locked)!;
    const berth = layout.berths.find((b) => b.pierId === pier.id)!;
    const moved = movePier(layout, pier.id, { x: 0, y: 1 }, ctx);
    const after = moved.berths.find((b) => b.id === berth.id)!;
    expect(after.buoy!.y - berth.buoy!.y).toBeCloseTo(1, 6);
    expect(after.buoy!.x - berth.buoy!.x).toBeCloseTo(0, 6);
    // From its class to the 12 m class: the buoy moves out by the difference in boat length.
    const from = project.boatClasses.find((c) => c.id === berth.boatClassId)!;
    const changed = setBerthClass(layout, berth.id, 'c12', ctx).berths.find((b) => b.id === berth.id)!;
    const shift = Math.hypot(changed.buoy!.x - berth.buoy!.x, changed.buoy!.y - berth.buoy!.y);
    expect(shift).toBeGreaterThanOrEqual(12 - from.length - 1e-6);
  });
});

describe('stern-buoy sizing (D36), hand-calculated', () => {
  const product = (p: Partial<Product> & Pick<Product, 'id' | 'category'>): Product => ({
    supplier: '', series: '', name: p.id, code: '', unit: 'pcs', price: 1, priceIncludesVat: false, marginPct: 0, lengthM: null, widthM: null,
    weightKg: null, capacityKg: null, freeboardM: null, chainDiameterMm: null, chainGrade: '', breakingLoadKn: null, massKgPerM: null,
    anchorMassKg: null, shackleMm: null, sourceUrl: '', sourceDate: '', note: '', ...p,
  });
  const LIST: PriceList = {
    title: 'test',
    parameters: [],
    products: [
      product({ id: 'c13', category: 'chain', unit: 'm', price: 10, chainDiameterMm: 13, breakingLoadKn: 61.8, massKgPerM: 3.1 }),
      product({ id: 'c16', category: 'chain', unit: 'm', price: 12, chainDiameterMm: 16, breakingLoadKn: 98.1, massKgPerM: 4.5 }),
      product({ id: 'a1000', category: 'anchor', price: 300, anchorMassKg: 1000 }),
      product({ id: 'a3000', category: 'anchor', price: 700, anchorMassKg: 3000 }),
      product({ id: 'f40', category: 'buoy', price: 130, capacityKg: 31 }),
      product({ id: 'f60', category: 'buoy', price: 160, capacityKg: 48 }),
      product({ id: 's16', category: 'shackle', price: 4, shackleMm: 16 }),
      product({ id: 's20', category: 'shackle', price: 6, shackleMm: 20 }),
    ],
  };
  const pier: MainPier = { id: 'P1', start: { x: 0, y: 0 }, end: { x: 0, y: 20 }, width: 3, locked: false, origin: 'manual' };
  const berth: Berth = {
    id: 'B1', pierId: 'P1', side: 'left', boatClassId: 'k9', slot: [{ x: -1.5, y: 1 }, { x: -1.5, y: 4.5 }, { x: -15, y: 4.5 }, { x: -15, y: 1 }],
    boat: [], type: 'sternBuoy', buoy: { x: -14.5, y: 2.75 }, removed: false, issues: [],
  };
  const k9 = (weight?: number): BoatClass => ({ id: 'k9', name: '9 m', length: 9, beam: 3, color: '#000', share: 1, count: 0, ...(weight === undefined ? {} : { weight }) });
  const site: Site = { water: [], shoreline: [], entrance: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }, obstacles: [], zones: [] };
  const plan = (classes: BoatClass[], p: Partial<AnchoringParams> = {}) =>
    anchoringPlan({ layout: { piers: [pier], berths: [berth] }, site, classes, params: { ...DEFAULT_ANCHORING, ...p }, priceList: LIST, vatPct: 0 });
  const buoyLine = (r: ReturnType<typeof plan>) => r.lines.find((l) => l.role === 'buoy')!;

  it('weight estimate and table row (Top Marine)', () => {
    // Between 7.6 m (3.3 t) and 9.1 m (4.8 t): 9 m → 3.3 + 1.5 · 1.4 / 1.5 = 4.7 t.
    expect(estimateBoatWeight(9)).toBeCloseTo(4.7, 9);
    expect(estimateBoatWeight(4.6)).toBeCloseTo(1, 9);
    expect(estimateBoatWeight(2.3)).toBeCloseTo(0.5, 9);
    // Beyond 13.7 m the last segment continues: 10.8 + 2.3 · (10.8 − 8.5) / 1.5 = 12.793 t.
    expect(estimateBoatWeight(15)).toBeCloseTo(12.7933, 3);
    expect(buoyTableRow(4).row).toMatchObject({ weightT: 4.8, buoyL: 60, anchorKg: 1000, chainMm: 16, shackleMm: 20 });
    expect(buoyTableRow(1).row.weightT).toBe(1);
    expect(buoyTableRow(11)).toMatchObject({ beyond: true, row: { weightT: 10.8 } });
    expect(buoyChainLength(5.5, DEFAULT_ANCHORING)).toBe(11);
    expect(buoyChainLength(0.5, DEFAULT_ANCHORING)).toBe(1.5); // at least depth + 1 m
  });

  it('9 m boat of 4 t, factor 3: one line from the buoy, 4 × 3 000 kg, 16 mm chain 11.0 m', () => {
    const r = plan([k9(4)]);
    const l = buoyLine(r);
    // H = ½ · 1.25 · 22² · 1.6 · (3 · 0.15 · 9) = 484 · 4.05 = 1 960.2 N (stern-on).
    expect(l.horizontalKn).toBeCloseTo(1.9602, 4);
    expect(l).toMatchObject({ id: 'B1-B', holdsId: 'B1', fixing: 'seabed', fix: berth.buoy, anchor: berth.buoy, chainId: 'c16', anchorId: 'a3000', anchorCount: 4 });
    // Chain 2 × (4 + 1.5) = 11.0 m; the table asks for 16 mm, so 13 mm is not used.
    expect(l.chainLength).toBe(11);
    // Sinker 3 × 4 t = 12 000 kg → 4 × 3 000 kg (heaviest piece 3 000 kg).
    expect(l.requiredAnchorKg).toBe(12000);
    // Float: the table's 60 l (48 kg) vs. chain in water 4.5 · 11 · (1 − 1000/7850) = 43.2 kg.
    expect(l.buoy).toMatchObject({ boatWeightT: 4, weightEstimated: false, floatCapacityKg: 48, shackleMm: 20 });
    // Friction method: a = H / w = 50.9 m, the chain hangs (touching length 24.3 m > 11 m);
    // uplift V = H · sinh(atanh(5.5/11) − X / 2a) = 924.8 N;
    // mass = 1.5 · (1 960.2 / 0.3 + 924.8) / (9.81 · (1 − 1000/2400)) = 1 955 kg.
    expect(l.upliftKn).toBeCloseTo(0.9248, 3);
    expect(l.buoy!.windAnchorKg).toBeCloseTo(1955.1, 0);
    expect(r.issues.map((i) => i.code)).toContain('STERN_BUOYS');
    expect(r.issues.map((i) => i.code)).not.toContain('BUOY_SINKER_BELOW_WIND_METHOD');
    expect(r.issues.map((i) => i.code)).not.toContain('BOAT_WEIGHT_ESTIMATED');
    // The pier itself is anchored as before (side lines); its lines are not 'buoy' lines.
    expect(r.lines.filter((x) => x.role === 'buoy')).toHaveLength(1);
  });

  it("Top Marine's table: 1 000 kg sinker, lighter than the friction method → warning", () => {
    const r = plan([k9(4)], { buoySinkerMethod: 'table' });
    const l = buoyLine(r);
    expect(l).toMatchObject({ requiredAnchorKg: 1000, anchorId: 'a1000', anchorCount: 1 });
    expect(r.issues.find((i) => i.code === 'BUOY_SINKER_BELOW_WIND_METHOD')!.message).toContain('1000 kg, the method gives 1955 kg');
  });

  it('no weight: estimated from the length and flagged', () => {
    const r = plan([k9()]);
    expect(buoyLine(r).buoy).toMatchObject({ weightEstimated: true });
    expect(buoyLine(r).buoy!.boatWeightT).toBeCloseTo(4.7, 9);
    expect(buoyLine(r).requiredAnchorKg).toBeCloseTo(14100, 6);
    expect(r.issues.find((i) => i.code === 'BOAT_WEIGHT_ESTIMATED')!.message).toContain('9 m (estimated 4.7 t)');
  });

  it('deep water: the float carries the chain when it is heavier than the table float', () => {
    // Depth 8.5 + 1.5 = 10 m → chain 20 m, in water 4.5 · 20 · 0.8726 = 78.5 kg > 48 kg.
    const l = buoyLine(plan([k9(4)], { depth: 8.5 }));
    expect(l.chainLength).toBe(20);
    expect(l.buoy!.floatCapacityKg).toBeCloseTo(4.5 * 20 * (1 - 1000 / 7850), 9);
  });

  it('bill of materials: float, sinkers, chain and one shackle of at least the table size; no spring or anode', () => {
    const r = plan([k9(4)]);
    const line = buoyLine(r);
    const anchoring = { ...r, lines: [line] };
    const list: PriceList = { ...LIST, parameters: [{ key: 'shackles_per_buoy_line', value: 1, unit: '', description: '', source: '' }] };
    const est = costEstimate({
      layout: { piers: [], fingers: [], berths: [] },
      site,
      priceList: list,
      choices: { pontoonSeries: null, fingerSeries: null, boomSeries: null, gangwaySeries: null, pontoonFreeboard: null },
      anchoring,
    });
    const qty = Object.fromEntries(est.lines.map((x) => [x.productId, x.orderQuantity]));
    // Float of at least 48 kg → f60; shackle ≥ max(16 mm chain, 20 mm table) → s20.
    expect(qty).toEqual({ c16: 11, a3000: 4, f60: 1, s20: 1 });
    // A float too small for the need: the largest is used and noted.
    const big = { ...anchoring, lines: [{ ...line, buoy: { ...line.buoy!, floatCapacityKg: 100 } }] };
    const est2 = costEstimate({ layout: { piers: [], fingers: [], berths: [] }, site, priceList: list, choices: est2Choices(), anchoring: big });
    expect(est2.lines.find((x) => x.productId === 'f60')).toBeDefined();
    expect(est2.notes.join(' ')).toContain('1 stern buoys need more buoyancy than the largest float');
  });
  const est2Choices = () => ({ pontoonSeries: null, fingerSeries: null, boomSeries: null, gangwaySeries: null, pontoonFreeboard: null });

  it('the buoy distance factor moves the buoy: length + factor × depth (I78)', () => {
    expect(sternBuoyDistance(boat('c5'), { ...SB, buoyDepthFactor: 3 })).toBe(17); // 5 + 3 · 4 (Top Marine)
  });
});
