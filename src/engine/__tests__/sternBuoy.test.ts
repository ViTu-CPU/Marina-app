import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS } from '../demos';
import { movePier, setBerthClass, type EditContext } from '../edit';
import { generateLayouts } from '../generate';
import { convexInsideRegion, convexPolygonsOverlap, pointInRing } from '../geometry';
import { anchoringPlan, buoyChainLength, buoyTable, buoyTableRow, DEFAULT_ANCHORING, estimateBoatWeight, type AnchoringParams } from '../anchoring';
import { costEstimate } from '../bom';
import type { PriceList, Product } from '../catalog';
import type { Berth, BoatClass, MainPier, Params, Site } from '../model';
import { sternBuoyDistance, sternBuoyPattern } from '../patterns/sternBuoy';
import { fairwayWidthFor, rowDesign } from '../fill';
import { layoutRows } from '../rows';
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

describe('fairway in front of stern-buoy rows (D38, Båtunionen)', () => {
  it('2.5 × boat length, at least 20 m, never less than the general rule', () => {
    // 12 m: max(1.75 · 12 = 21, 8; 2.5 · 12 = 30, 20) = 30 m; 6 m: max(10.5, 8; 15, 20) = 20 m.
    expect(fairwayWidthFor(12, SB, 'sternBuoy')).toBe(30);
    expect(fairwayWidthFor(6, SB, 'sternBuoy')).toBe(20);
    expect(fairwayWidthFor(12, SB, 'finger')).toBe(21);
    expect(fairwayWidthFor(12, SB)).toBe(21);
    // A smaller buoy factor than the general one leaves the general rule.
    expect(fairwayWidthFor(12, { ...SB, buoyFairwayFactor: 1, buoyFairwayMin: 5 }, 'sternBuoy')).toBe(21);
    // The row design of a stern-buoy pier uses it: pitch = 2.7 (D44) + 2 · 16.5 + 30 = 65.7 m.
    const design = rowDesign(DEFAULT_BOAT_CLASSES, SB, sternBuoyPattern)!;
    expect(design.fairwayWidth).toBe(30);
    expect(design.pitch).toBeCloseTo(65.7, 9);
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
        // D38: every stern-buoy row keeps Båtunionen's fairway in front of it.
        const longest = Math.max(...project.boatClasses.filter((c) => layout.berths.some((b) => b.boatClassId === c.id)).map((c) => c.length));
        for (const row of layoutRows(layout.piers, layout.fingers, layout.berths, project.boatClasses, params)) {
          expect(row.fairwayWidth).toBeGreaterThanOrEqual(20);
          expect(row.fairwayWidth).toBeLessThanOrEqual(Math.max(20, 2.5 * longest) + 1e-9);
        }
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

describe('stern-buoy sizing (D36, D37), hand-calculated', () => {
  const product = (p: Partial<Product> & Pick<Product, 'id' | 'category'>): Product => ({
    supplier: '', series: '', name: p.id, code: '', unit: 'pcs', price: 1, priceIncludesVat: false, marginPct: 0, lengthM: null, widthM: null,
    weightKg: null, capacityKg: null, freeboardM: null, chainDiameterMm: null, chainGrade: '', breakingLoadKn: null, massKgPerM: null,
    anchorMassKg: null, anchorKind: null, capacityHorizontalKn: null, capacityUpliftKn: null, capacityBasis: null, seabeds: [], installedPrice: null, shackleMm: null, sourceUrl: '', sourceDate: '', note: '', ...p,
  });
  const LIST: PriceList = {
    title: 'test',
    parameters: [],
    products: [
      product({ id: 'c13', category: 'chain', unit: 'm', price: 10, chainDiameterMm: 13, breakingLoadKn: 61.8, massKgPerM: 3.1 }),
      product({ id: 'c16', category: 'chain', unit: 'm', price: 12, chainDiameterMm: 16, breakingLoadKn: 98.1, massKgPerM: 4.5 }),
      product({ id: 'a1000', category: 'anchor', price: 300, anchorMassKg: 1000 }),
      product({ id: 'a2000', category: 'anchor', price: 480, anchorMassKg: 2000 }),
      product({ id: 'a3000', category: 'anchor', price: 700, anchorMassKg: 3000 }),
      product({ id: 'f40', category: 'buoy', price: 130, capacityKg: 31 }),
      product({ id: 'f60', category: 'buoy', price: 160, capacityKg: 48 }),
      product({ id: 'f120', category: 'buoy', price: 200, capacityKg: 104 }),
      product({ id: 's13', category: 'shackle', price: 3, shackleMm: 13 }),
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
  const plan = (classes: BoatClass[], p: Partial<AnchoringParams> = {}, buoyDepthFactor = 1) =>
    anchoringPlan({ layout: { piers: [pier], berths: [berth] }, site, classes, params: { ...DEFAULT_ANCHORING, ...p }, priceList: LIST, vatPct: 0, buoyDepthFactor });
  const buoyLine = (r: ReturnType<typeof plan>) => r.lines.find((l) => l.role === 'buoy')!;
  const codes = (r: ReturnType<typeof plan>) => r.issues.map((i) => i.code);
  const BU = buoyTable('batunionen', DEFAULT_ANCHORING);
  const TM = buoyTable('topMarine', DEFAULT_ANCHORING);

  it('weight estimate (Top Marine) and table rows', () => {
    // Between 7.6 m (3.3 t) and 9.1 m (4.8 t): 9 m → 3.3 + 1.5 · 1.4 / 1.5 = 4.7 t.
    expect(estimateBoatWeight(9)).toBeCloseTo(4.7, 9);
    expect(estimateBoatWeight(4.6)).toBeCloseTo(1, 9);
    expect(estimateBoatWeight(2.3)).toBeCloseTo(0.5, 9);
    // Beyond 13.7 m the last segment continues: 10.8 + 2.3 · (10.8 − 8.5) / 1.5 = 12.793 t.
    expect(estimateBoatWeight(15)).toBeCloseTo(12.7933, 3);
    // Båtunionen: 300 / 700 / 1000 / 1200 kg in water → ÷ (1 − 1000/2400) = 514 / 1200 / 1714 / 2057 kg in air.
    expect(BU.map((r) => Math.round(r.sinkerKg))).toEqual([514, 1200, 1714, 2057]);
    expect(buoyTableRow(BU, 4).row).toMatchObject({ weightT: 5, floatCapacityKg: 70, chainMm: 13 });
    expect(buoyTableRow(BU, 1).row.weightT).toBe(2);
    // Exposed: one row up ("Vid utsatt läge ökas angivna dimensioner ett steg").
    expect(buoyTableRow(BU, 4, true).row).toMatchObject({ weightT: 8, floatCapacityKg: 100, chainMm: 16 });
    expect(buoyTableRow(BU, 11)).toMatchObject({ beyond: true, row: { weightT: 10 } });
    expect(buoyTableRow(BU, 9, true)).toMatchObject({ beyond: true, row: { weightT: 10 } });
    expect(buoyTableRow(TM, 4).row).toMatchObject({ weightT: 4.8, sinkerKg: 1000, chainMm: 16, floatCapacityKg: 48 });
    // Chain: max(1.41 · 4 = 5.64, 5.5 + 0.8 = 6.3) = 6.3 m; deeper: 1.41 · 8 = 11.28 > 9.5 + 0.8.
    expect(buoyChainLength(4, 5.5, DEFAULT_ANCHORING)).toBeCloseTo(6.3, 9);
    expect(buoyChainLength(8, 9.5, DEFAULT_ANCHORING)).toBeCloseTo(11.28, 9);
  });

  it("9 m boat of 4 t, Båtunionen's table (default): 1 200 kg sinker, 13 mm chain 6.3 m, float ≥ 70 kg", () => {
    const r = plan([k9(4)]);
    const l = buoyLine(r);
    // H = ½ · 1.25 · 22² · 1.6 · (3 · 0.15 · 9) = 484 · 4.05 = 1 960.2 N (stern-on).
    expect(l.horizontalKn).toBeCloseTo(1.9602, 4);
    expect(l).toMatchObject({ id: 'B1-B', holdsId: 'B1', fixing: 'seabed', fix: berth.buoy, anchor: berth.buoy, chainId: 'c13', anchorId: 'a2000', anchorCount: 1 });
    expect(l.chainLength).toBeCloseTo(6.3, 9);
    // Row 5 t: 700 kg in water = 1 200 kg of concrete in air → the cheapest anchor of at least that, 2 000 kg.
    expect(l.requiredAnchorKg).toBeCloseTo(1200, 6);
    // Float: the table's 70 kg vs. the chain in water 3.1 · 6.3 · (1 − 1000/7850) = 17.0 kg.
    expect(l.buoy).toMatchObject({ boatWeightT: 4, weightEstimated: false, floatCapacityKg: 70, tableChainMm: 13 });
    // Friction method: a = H / w = 1 960.2 / 26.54 = 73.9 m; the short chain hangs between both
    // ends (6.3 m < touching length 29.0 m): uplift 3 426 N, mass 1.5 · (1 960.2 / 0.3 + 3 426) /
    // (9.81 · (1 − 1000/2400)) = 2 611 kg > 1 200 kg → warning.
    expect(l.upliftKn).toBeCloseTo(3.4261, 3);
    expect(l.buoy!.windAnchorKg).toBeCloseTo(2610.8, 0);
    expect(r.issues.find((i) => i.code === 'BUOY_SINKER_BELOW_WIND_METHOD')!.message).toContain('1200 kg, the method gives 2611 kg');
    expect(codes(r)).toContain('STERN_BUOYS');
    // High + low water 1.5 + 0.9 = 2.4 m > 1.3 m: the 1:1 slope needs checking.
    expect(codes(r)).toContain('BUOY_WATER_LEVEL_RANGE');
    expect(codes(r)).not.toContain('BUOY_DEEP_WATER');
    expect(codes(r)).not.toContain('BOAT_WEIGHT_ESTIMATED');
    expect(r.lines.filter((x) => x.role === 'buoy')).toHaveLength(1);
  });

  it('exposed harbour, Top Marine table and the factor method', () => {
    expect(buoyLine(plan([k9(4)], { buoyExposed: true }))).toMatchObject({ chainId: 'c16', anchorId: 'a2000', buoy: { floatCapacityKg: 100, tableChainMm: 16 } });
    expect(buoyLine(plan([k9(4)], { buoyExposed: true })).requiredAnchorKg).toBeCloseTo(1714.29, 1);
    expect(buoyLine(plan([k9(4)], { buoyTable: 'topMarine' }))).toMatchObject({ requiredAnchorKg: 1000, anchorId: 'a1000', chainId: 'c16', buoy: { floatCapacityKg: 48 } });
    // 3 × 4 t = 12 000 kg → 4 × 3 000 kg (heaviest piece 3 000 kg).
    expect(buoyLine(plan([k9(4)], { buoySinkerMethod: 'factor' }))).toMatchObject({ requiredAnchorKg: 12000, anchorId: 'a3000', anchorCount: 4 });
  });

  it('no weight: estimated from the length and flagged', () => {
    const r = plan([k9()]);
    expect(buoyLine(r).buoy).toMatchObject({ weightEstimated: true });
    expect(buoyLine(r).buoy!.boatWeightT).toBeCloseTo(4.7, 9);
    expect(r.issues.find((i) => i.code === 'BOAT_WEIGHT_ESTIMATED')!.message).toContain('9 m (estimated 4.7 t)');
  });

  it("Båtunionen's limits: deep water, boat–buoy distance over 1.4 × the boat length", () => {
    // Depth 5.5 m > 5 m.
    expect(codes(plan([k9(4)], { depth: 5.5 }))).toContain('BUOY_DEEP_WATER');
    // Factor 3 × 4.5 m = 13.5 m > 1.4 × 9 = 12.6 m.
    expect(codes(plan([k9(4)], { depth: 4.5 }, 3))).toContain('BUOY_FAR_FROM_BOAT');
    expect(codes(plan([k9(4)], { depth: 4 }, 3))).not.toContain('BUOY_FAR_FROM_BOAT');
    // Range within 1.3 m: no warning.
    expect(codes(plan([k9(4)], { highWater: 0.7, lowWater: 0.6 }))).not.toContain('BUOY_WATER_LEVEL_RANGE');
    // D50: with a gauge's normal range the check uses it, not the extremes (1.5 + 0.9 m).
    expect(codes(plan([k9(4)], { normalHighWater: 0.6, normalLowWater: 0.6 }))).not.toContain('BUOY_WATER_LEVEL_RANGE');
    const wide = plan([k9(4)], { normalHighWater: 0.8, normalLowWater: 0.7 }).issues.find((i) => i.code === 'BUOY_WATER_LEVEL_RANGE')!;
    expect(wide.message).toContain('Normal high + low water 1.5 m');
  });

  it('deep water: the float carries the chain when it is heavier than the table float', () => {
    // Depth 8 m → chain 1.41 · 8 = 11.28 m of 13 mm: 3.1 · 11.28 · 0.8726 = 30.5 kg < 70 kg; with
    // 16 mm (exposed): 4.5 · 11.28 · 0.8726 = 44.3 kg < 100 kg. Depth 20 m: 28.2 m · 4.5 · 0.8726 = 110.7 kg > 100 kg.
    const l = buoyLine(plan([k9(4)], { depth: 20, buoyExposed: true }));
    expect(l.chainLength).toBeCloseTo(28.2, 9);
    expect(l.buoy!.floatCapacityKg).toBeCloseTo(4.5 * 28.2 * (1 - 1000 / 7850), 9);
  });

  it('bill of materials: float, sinker, chain and one shackle a size above the chain; no spring or anode', () => {
    const r = plan([k9(4)]);
    const line = buoyLine(r);
    const anchoring = { ...r, lines: [line] };
    const list: PriceList = { ...LIST, parameters: [{ key: 'shackles_per_buoy_line', value: 1, unit: '', description: '', source: '' }] };
    const choices = { pontoonSeries: null, fingerSeries: null, boomSeries: null, gangwaySeries: null, pontoonFreeboard: null };
    const est = costEstimate({ layout: { piers: [], fingers: [], berths: [] }, site, priceList: list, choices, anchoring });
    const qty = Object.fromEntries(est.lines.map((x) => [x.productId, x.orderQuantity]));
    // Float of at least 70 kg → f120; shackle > 13 mm chain → s16.
    expect(qty).toEqual({ c13: 6.3, a2000: 1, f120: 1, s16: 1 });
    // A float too small for the need: the largest is used and noted.
    const big = { ...anchoring, lines: [{ ...line, buoy: { ...line.buoy!, floatCapacityKg: 120 } }] };
    const est2 = costEstimate({ layout: { piers: [], fingers: [], berths: [] }, site, priceList: list, choices, anchoring: big });
    expect(est2.lines.find((x) => x.productId === 'f120')).toBeDefined();
    expect(est2.notes.join(' ')).toContain('1 stern buoys need more buoyancy than the largest float');
  });

  it('the buoy distance factor moves the buoy: length + factor × depth (I78)', () => {
    expect(sternBuoyDistance(boat('c5'), { ...SB, buoyDepthFactor: 3 })).toBe(17); // 5 + 3 · 4 (Top Marine)
  });
});
