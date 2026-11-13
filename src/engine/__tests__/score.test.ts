import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { RECT_BASIN_SITE } from '../demos';
import { fillPier, newMixState, rowDesign } from '../fill';
import { evaluateLayout } from '../layout';
import type { BoatClass, Layout, MainPier, ObjectiveSettings, Site, Stats } from '../model';
import { fingerPierPattern } from '../patterns';
import { compareLayouts, OBJECTIVES, rankLayouts, scoreReference } from '../score';
import { prepareSite } from '../site';

const OPEN_BASIN: Site = { ...RECT_BASIN_SITE, obstacles: [] };
const params = DEFAULT_PARAMS;

function singlePierLayout(classes: BoatClass[], x: number, length: number, site: Site = OPEN_BASIN): Layout {
  const prepared = prepareSite(site, params);
  const pier: MainPier = { id: 'P1', start: { x, y: 0 }, end: { x, y: length }, width: 3, locked: false, origin: 'generated' };
  const design = rowDesign(classes, params, fingerPierPattern)!;
  const fill = fillPier(pier, { prepared, classes, params, pattern: fingerPierPattern, design }, newMixState(classes));
  return evaluateLayout(
    { id: 'L1', name: 'Test', strategy: 'test', piers: [pier], fingers: fill.fingers, berths: fill.berths, modified: false },
    prepared,
    classes,
    params,
  );
}

const FIVE_M_ONLY: BoatClass[] = DEFAULT_BOAT_CLASSES.map((c) => ({ ...c, share: c.id === 'c5' ? 1 : 0 }));

describe('computeStats, hand-calculated (SPEC §7)', () => {
  /**
   * One 60 m pier (3 m wide) at x = 110 in the 220 × 140 m basin, 5.0 × 2.0 m boats, two
   * per bay → 40 berths and 22 fingers (fill.test.ts case 1). Row depth 5.5 m, fairway 8 m.
   */
  const layout = singlePierLayout(FIVE_M_ONLY, 110, 60);
  const s = layout.stats;

  it('counts', () => {
    expect(s.totalBerths).toBe(40);
    expect(s.berthsByClass).toEqual({ c5: 40, c7: 0, c9: 0, c12: 0 });
    expect(s.mixDeviation).toBe(0);
    expect(s.issueCounts).toEqual({ error: 0, warning: 0 });
    expect(layout.feasibility).toBe('operationalOK');
  });

  it('pontoon lengths and deck area', () => {
    expect(s.mainPierLength).toBeCloseTo(60, 9);
    expect(s.fingerLength).toBeCloseTo(22 * 4.0, 6); // 88 m
    expect(s.pontoonLength).toBeCloseTo(148, 6);
    // 60 × 3 = 180 m² plus 22 fingers of 4.0 × 0.8 = 3.2 m² → 250.4 m².
    expect(s.pontoonDeckArea).toBeCloseTo(250.4, 6);
    expect(s.pontoonPerBerth).toBeCloseTo(3.7, 6); // 148 / 40
  });

  it('water areas', () => {
    // Fairways: two row strips 60 × 8 = 480 m² each, head strip (3 + 2 × 13.5) × 8 = 240 m².
    expect(s.fairwayArea).toBeCloseTo(1200, 3);
    // Slots: 40 × 2.5 × 5.5 = 550 m².
    expect(s.marinaWaterArea).toBeCloseTo(1750, 3);
    // 30 800 − 250.4 − 1750 = 28 799.6 m².
    expect(s.freeWaterArea).toBeCloseTo(28799.6, 3);
    // 40 berths on 30.8 thousand m².
    expect(s.berthsPer1000m2).toBeCloseTo(40 / 30.8, 9);
  });

  it('removed berths are not counted', () => {
    const prepared = prepareSite(OPEN_BASIN, params);
    const edited = evaluateLayout(
      { ...layout, berths: layout.berths.map((b, i) => (i < 4 ? { ...b, removed: true } : b)), modified: true },
      prepared,
      FIVE_M_ONLY,
      params,
    );
    expect(edited.stats.totalBerths).toBe(36);
    expect(edited.stats.pontoonLength).toBeCloseTo(148, 6); // structures stay
    expect(edited.stats.marinaWaterArea).toBeCloseTo(1750 - 4 * 13.75, 3);
    expect(edited.modified).toBe(true);
  });

  it('obstacles are not free water', () => {
    // The rock 16-gon is 16 × 6² × tan(π/16) ≈ 114.6 m².
    const withRock = singlePierLayout(FIVE_M_ONLY, 60, 60, RECT_BASIN_SITE);
    // Tolerance 0.05 m²: the rock's vertices are stored rounded to millimetres.
    expect(withRock.stats.freeWaterArea).toBeCloseTo(28799.6 - 16 * 36 * Math.tan(Math.PI / 16), 1);
  });

  it('mix deviation: half the sum of absolute share differences', () => {
    // Target 30/35/25/10 %, actual 100 % of one class at 30 % → (0.7 + 0.35 + 0.25 + 0.1) / 2 = 0.7.
    const prepared = prepareSite(OPEN_BASIN, params);
    const again = evaluateLayout({ ...layout }, prepared, DEFAULT_BOAT_CLASSES, params);
    expect(again.stats.mixDeviation).toBeCloseTo(0.7, 9);
  });
});

describe('objectives (SPEC §7)', () => {
  const stats = (over: Partial<Stats>): Stats => ({
    totalBerths: 100,
    berthsByClass: {},
    mainPierLength: 200,
    fingerLength: 200,
    pontoonLength: 400,
    pontoonDeckArea: 800,
    fairwayArea: 5000,
    marinaWaterArea: 7000,
    freeWaterArea: 20000,
    berthsPer1000m2: 3.2,
    pontoonPerBerth: 4,
    mixDeviation: 0,
    issueCounts: { error: 0, warning: 0 },
    ...over,
  });
  const layout = (id: string, over: Partial<Stats>, feasibility: Layout['feasibility'] = 'operationalOK'): Layout => ({
    id,
    name: id,
    strategy: 'test',
    piers: [],
    fingers: [],
    berths: [],
    fairways: [],
    feasibility,
    issues: [],
    stats: stats(over),
    score: 0,
    modified: false,
  });
  const settings = (over: Partial<ObjectiveSettings>): ObjectiveSettings => ({ ...DEFAULT_OBJECTIVE, ...over });
  const noRef = { maxBerths: 0, minPontoonLength: 0, maxFairwayArea: 0 };

  it('max capacity and space efficiency read the stats directly', () => {
    expect(OBJECTIVES.maxCapacity(layout('a', {}), settings({}), noRef)).toBe(100);
    expect(OBJECTIVES.spaceEfficiency(layout('a', {}), settings({}), noRef)).toBe(3.2);
  });

  it('min infrastructure prefers fewer pontoon metres per berth, and penalises a shortfall', () => {
    const s = settings({ id: 'minInfrastructure', targetBerths: 90 });
    const lean = layout('lean', { totalBerths: 95, pontoonPerBerth: 3.5 });
    const rich = layout('rich', { totalBerths: 120, pontoonPerBerth: 4.5 });
    const small = layout('small', { totalBerths: 60, pontoonPerBerth: 2.0 });
    expect(OBJECTIVES.minInfrastructure(lean, s, noRef)).toBe(-3.5);
    expect(OBJECTIVES.minInfrastructure(rich, s, noRef)).toBe(-4.5);
    // 30 berths short of the target: −2.0 − 1000 × 30.
    expect(OBJECTIVES.minInfrastructure(small, s, noRef)).toBe(-30002);
    expect(rankLayouts([small, rich, lean], s).map((l) => l.id)).toEqual(['lean', 'rich', 'small']);
  });

  it('balanced: equal weights, each term scaled by the best alternative', () => {
    const a = layout('a', { totalBerths: 100, pontoonLength: 400, fairwayArea: 5000 });
    const b = layout('b', { totalBerths: 80, pontoonLength: 320, fairwayArea: 4000 });
    const reference = scoreReference([a, b]);
    expect(reference).toEqual({ maxBerths: 100, minPontoonLength: 320, maxFairwayArea: 5000 });
    const s = settings({ id: 'balanced' });
    // a: (100/100 + 320/400 + 5000/5000) / 3 = 2.8 / 3
    expect(OBJECTIVES.balanced(a, s, reference)).toBeCloseTo(2.8 / 3, 12);
    // b: (80/100 + 320/320 + 4000/5000) / 3 = 2.6 / 3
    expect(OBJECTIVES.balanced(b, s, reference)).toBeCloseTo(2.6 / 3, 12);
    // Weighting pontoon length only makes b the best.
    const pontoonOnly = settings({ id: 'balanced', weights: { capacity: 0, pontoon: 1, fairway: 0 } });
    expect(rankLayouts([a, b], pontoonOnly).map((l) => l.id)).toEqual(['b', 'a']);
  });

  it('a layout with geometric errors is never ranked above a valid one', () => {
    const big = layout('big-but-invalid', { totalBerths: 500 }, 'geometricFail');
    const ok = layout('ok', { totalBerths: 10 }, 'geometricOK');
    const ranked = rankLayouts([big, ok], settings({ id: 'maxCapacity' }));
    expect(ranked.map((l) => l.id)).toEqual(['ok', 'big-but-invalid']);
    expect(ranked[1]!.score).toBe(500);
  });

  it('ties are broken deterministically: berths, then pontoon length, then id', () => {
    const x = { ...layout('x', {}), score: 1 };
    const y = { ...layout('y', {}), score: 1 };
    const shorter = { ...layout('z', { pontoonLength: 300 }), score: 1 };
    expect([y, x, shorter].sort(compareLayouts).map((l) => l.id)).toEqual(['z', 'x', 'y']);
  });

  it('layouts without berths score below everything else', () => {
    const empty = layout('empty', { totalBerths: 0, pontoonPerBerth: 0, pontoonLength: 0, fairwayArea: 0 });
    expect(OBJECTIVES.minInfrastructure(empty, settings({}), noRef)).toBeLessThan(-1e6);
    expect(OBJECTIVES.balanced(empty, settings({}), noRef)).toBeLessThan(-1e6);
  });
});
