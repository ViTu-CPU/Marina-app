import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS } from '../demos';
import { generateLayouts } from '../generate';
import type { BoatClass, Params, Site } from '../model';
import { berthCaps, effectiveObjective, mixClasses, targetShortfall, targetTotal } from '../targets';

const COUNTS: Params = { ...DEFAULT_PARAMS, berthTarget: 'count' };

describe('berth targets as counts (D20)', () => {
  const classes: BoatClass[] = DEFAULT_BOAT_CLASSES.map((c, i) => ({ ...c, count: [10, 20, 0, 10][i]! }));

  it('shares follow the counts; with shares nothing changes', () => {
    expect(mixClasses(classes, COUNTS).map((c) => c.share)).toEqual([0.25, 0.5, 0, 0.25]);
    expect(mixClasses(classes, DEFAULT_PARAMS)).toBe(classes);
  });

  it('caps, total and shortfall', () => {
    expect(berthCaps(classes, COUNTS)).toEqual({ c5: 10, c7: 20, c9: 0, c12: 10 });
    expect(berthCaps(classes, DEFAULT_PARAMS)).toBeUndefined();
    expect(targetTotal(classes, COUNTS)).toBe(40);
    expect(targetTotal(classes, DEFAULT_PARAMS)).toBeNull();
    // 10 − 8 = 2 short of 5 m, 20 − 20 = 0, 10 − 4 = 6 short of 12 m; extra 9 m boats do not offset it.
    expect(targetShortfall(classes, COUNTS, { c5: 8, c7: 20, c9: 3, c12: 4 })).toBe(8);
    expect(targetShortfall(classes, DEFAULT_PARAMS, { c5: 0 })).toBe(0);
  });

  it("'minInfrastructure' measures against the total of the counts", () => {
    expect(effectiveObjective({ ...DEFAULT_OBJECTIVE, targetBerths: 99 }, classes, COUNTS).targetBerths).toBe(40);
    expect(effectiveObjective({ ...DEFAULT_OBJECTIVE, targetBerths: 99 }, classes, DEFAULT_PARAMS).targetBerths).toBe(99);
  });
});

describe('generateLayouts with target counts, hand-calculated', () => {
  /**
   * The basin of the hand-calculated generator test: 60 m × 80 m, shore along the south
   * edge, 5.0 × 2.0 m boats only, two per bay; piers square to the shore (orientation 0).
   * Bay geometry: finger 0.8 m + 2 × slot 2.5 m = 5.8 m per double bay, 0.8 + 2.5 = 3.3 m
   * for a single-boat bay, 0.8 m closing finger. Target: 30 berths.
   *
   *   Strategy A: the first pier with rows on both sides could take 2 × 24 = 48 berths.
   *   The targets run out on it, so it gets the shortest length (0.1 m steps) that still
   *   takes 30, i.e. 15 per row: 7 double bays + 1 single bay + closing finger
   *   = 7 × 5.8 + 3.3 + 0.8 = 44.7 m (at 44.6 m the single bay does not fit: 28 berths).
   *   Fingers: 9 per row × 2 rows × 4.0 m = 72 m. No second pier.
   *   Strategy D (one row along the 60 m shore): 20 berths at most → 10 short of the target.
   */
  const site: Site = {
    water: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 0, y: 80 }],
    shoreline: [{ x: 0, y: 0 }, { x: 60, y: 0 }],
    entrance: { a: { x: 0, y: 80 }, b: { x: 60, y: 80 } },
    obstacles: [],
    zones: [],
  };
  const classes = DEFAULT_BOAT_CLASSES.map((c) => ({ ...c, count: c.id === 'c5' ? 30 : 0 }));
  const params: Params = { ...COUNTS, orientation: 0 };
  const result = generateLayouts({ site, boatClasses: classes, params, objective: DEFAULT_OBJECTIVE });

  it('strategy A: one pier of 44.7 m with exactly 30 berths, 15 on each side', () => {
    const a = result.layouts.find((l) => l.strategy === 'A');
    expect(a).toBeDefined();
    expect(a!.stats.totalBerths).toBe(30);
    expect(a!.stats.targetShortfall).toBe(0);
    expect(a!.piers).toHaveLength(1);
    expect(a!.stats.mainPierLength).toBeCloseTo(44.7, 6);
    expect(a!.stats.fingerLength).toBeCloseTo(72, 6);
    expect(a!.berths.filter((b) => b.side === 'left')).toHaveLength(15);
    expect(a!.berths.filter((b) => b.side === 'right')).toHaveLength(15);
    expect(a!.feasibility).toBe('operationalOK');
  });

  it('strategy D: 20 berths, 10 short of the target', () => {
    const d = result.layouts.find((l) => l.strategy === 'D');
    expect(d).toBeDefined();
    expect(d!.stats.totalBerths).toBe(20);
    expect(d!.stats.targetShortfall).toBe(10);
  });

  it('no layout has more berths than asked for', () => {
    for (const l of result.layouts) expect(l.stats.totalBerths).toBeLessThanOrEqual(30);
  });

  it('a zero target for every class is reported, not generated', () => {
    const none = generateLayouts({
      site,
      boatClasses: classes.map((c) => ({ ...c, count: 0 })),
      params,
      objective: DEFAULT_OBJECTIVE,
    });
    expect(none.layouts).toHaveLength(0);
    expect(none.diagnostics[0]!.code).toBe('NO_BOAT_CLASSES');
  });
});

describe('generateLayouts with target counts on the demo projects', () => {
  for (const demo of DEMO_PROJECTS) {
    const project = demo.create();
    const targets = project.boatClasses.map((c, i) => ({ ...c, count: [12, 16, 8, 4][i] ?? 0 }));
    const result = generateLayouts({
      site: project.site,
      boatClasses: targets,
      params: { ...project.params, berthTarget: 'count' },
      objective: project.objective,
    });

    it(`${demo.id}: every class stays within its count, and the best layout meets all of them`, () => {
      expect(result.layouts.length).toBeGreaterThan(0);
      for (const l of result.layouts) {
        for (const c of targets) expect(l.stats.berthsByClass[c.id] ?? 0).toBeLessThanOrEqual(c.count);
        const short = targets.reduce((sum, c) => sum + Math.max(0, c.count - (l.stats.berthsByClass[c.id] ?? 0)), 0);
        expect(l.stats.targetShortfall).toBe(short);
      }
      expect(result.layouts[0]!.stats.totalBerths).toBe(40);
      expect(result.layouts[0]!.stats.targetShortfall).toBe(0);
    });

    it(`${demo.id}: deterministic`, () => {
      const again = generateLayouts({
        site: project.site,
        boatClasses: targets,
        params: { ...project.params, berthTarget: 'count' },
        objective: project.objective,
      });
      expect(JSON.stringify(again)).toBe(JSON.stringify(result));
    });
  }
});
