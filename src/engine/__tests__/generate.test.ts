import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS, IRREGULAR_BAY_SITE, RECT_BASIN_SITE } from '../demos';
import { setBerthRemoved } from '../edit';
import {
  candidateOrientations,
  generateLayouts,
  isNearDuplicate,
  mainShorelineBearing,
  type GenerateInput,
} from '../generate';
import {
  convexInsideRegion,
  convexIntersectsRegion,
  convexPolygonsOverlap,
  regionFromPolygon,
  vectorToBearing,
} from '../geometry';
import type { BoatClass, Layout, Site } from '../model';
import { pierPolygon, prepareSite } from '../site';

const inputFor = (site: Site, over: Partial<GenerateInput> = {}): GenerateInput => ({
  site,
  boatClasses: DEFAULT_BOAT_CLASSES,
  params: DEFAULT_PARAMS,
  objective: DEFAULT_OBJECTIVE,
  ...over,
});

const FIVE_M_ONLY: BoatClass[] = DEFAULT_BOAT_CLASSES.map((c) => ({ ...c, share: c.id === 'c5' ? 1 : 0 }));
const byStrategy = (layouts: Layout[], strategy: string) => layouts.filter((l) => l.strategy === strategy);

describe('candidate orientations (SPEC §5.2)', () => {
  it('main shoreline direction is the length-weighted mean axis', () => {
    expect(mainShorelineBearing(RECT_BASIN_SITE.shoreline)).toBe(90); // runs east–west
    // Bay: west leg 200 m (north–south), south leg 260 m (east–west) → the longer leg wins.
    expect(mainShorelineBearing(IRREGULAR_BAY_SITE.shoreline)).toBe(90);
    expect(mainShorelineBearing([{ x: 0, y: 0 }])).toBeNull();
  });

  it("'auto' tests the shore-perpendicular, the longest edges and a 5° sweep, without duplicates", () => {
    const { all, shorePerpendicular } = candidateOrientations(RECT_BASIN_SITE, DEFAULT_PARAMS);
    expect(shorePerpendicular).toBe(0);
    expect(all).toHaveLength(36); // 0, 5, …, 175; the special directions coincide with them
    expect(new Set(all).size).toBe(36);
  });

  it('a fixed orientation is the only candidate', () => {
    const { all } = candidateOrientations(RECT_BASIN_SITE, { ...DEFAULT_PARAMS, orientation: 200 });
    expect(all).toEqual([20]); // pier axes are the same 180° apart
  });
});

describe('generateLayouts, hand-calculated (SPEC §10)', () => {
  /**
   * Basin 60 m wide (x) and 80 m deep (y), shore along the south edge, entrance along the
   * whole north edge, 5.0 × 2.0 m boats only, two per bay.
   *
   *   slot 2.5 × 5.5 m, fairway max(8, 1.5 × 5) = 8 m, pitch 3 + 2 × 5.5 + 8 = 22 m
   *   pier length = 80 − 8 (head clearance) = 72 m
   *   bays per row: n × 5.8 + 0.8 ≤ 72 → n = 12 (70.4 m); 72 − 69.6 = 2.4 m left < 4.1 m
   *   → 24 berths per row
   *   a row needs 5.5 + 8 = 13.5 m of water beside the pier edge
   */
  const site: Site = {
    water: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 0, y: 80 }],
    shoreline: [{ x: 0, y: 0 }, { x: 60, y: 0 }],
    entrance: { a: { x: 0, y: 80 }, b: { x: 60, y: 80 } },
    obstacles: [],
    zones: [],
  };
  const result = generateLayouts(inputFor(site, { boatClasses: FIVE_M_ONLY }));

  it('strategy A: 4 rows fit across 60 m → 96 berths on 2 piers of 72 m', () => {
    // Two piers 22 m apart with rows on both sides need 13.5 + 3 + 11 + 8 + 11 + 3 + 13.5
    // = 63 m > 60 m … but the outer rows only need their own 13.5 m: with pier centres at
    // x = 15 … 16 and x + 22, both piers keep both rows (15 − 1.5 = 13.5 and
    // 38 + 1.5 + 13.5 = 53 ≤ 60). A third pier never adds a row, so the fewest pontoon
    // metres for 4 rows is 2 piers: 4 × 24 = 96 berths.
    const [a] = byStrategy(result.layouts, 'A');
    expect(a).toBeDefined();
    expect(a!.stats.totalBerths).toBe(96);
    expect(a!.piers).toHaveLength(2);
    expect(a!.stats.mainPierLength).toBeCloseTo(144, 6);
    // 13 fingers per row × 4 rows × 4.0 m = 208 m.
    expect(a!.stats.fingerLength).toBeCloseTo(208, 6);
    expect(a!.feasibility).toBe('operationalOK');
    for (const p of a!.piers) {
      expect(p.start.y).toBeCloseTo(0, 6);
      expect(p.end.y).toBeCloseTo(72, 6);
    }
  });

  it('strategy B: at every other pitch (44 m) only one pier keeps both rows → 48 berths', () => {
    // Two piers 44 m apart: the first needs x ≥ 15 for its west row, the second then
    // stands at x ≥ 59, outside the 60 m basin. Either way two rows remain; one pier with
    // both rows uses the least pontoon.
    const [b] = byStrategy(result.layouts, 'B');
    expect(b).toBeDefined();
    expect(b!.stats.totalBerths).toBe(48);
    expect(b!.piers).toHaveLength(1);
  });

  it('strategy D: one pier along the 60 m shore with a single row → 20 berths', () => {
    // n × 5.8 + 0.8 ≤ 60 → n = 10 (58.8 m); 2.0 m left over.
    const [d] = byStrategy(result.layouts, 'D');
    expect(d).toBeDefined();
    expect(d!.stats.totalBerths).toBe(20);
    expect(d!.piers).toHaveLength(1);
    expect(d!.stats.mainPierLength).toBeCloseTo(60, 6);
    expect(new Set(d!.berths.map((x) => x.side)).size).toBe(1);
    expect(d!.feasibility).toBe('operationalOK');
  });

  it('nothing is unreachable in an open basin', () => {
    for (const layout of result.layouts) {
      expect(layout.unreachableRemoved).toBe(0);
      expect(layout.stats.unreachableRemoved).toBe(0);
    }
  });

  it('the alternatives are ranked by capacity and A is the best', () => {
    const berths = result.layouts.map((l) => l.stats.totalBerths);
    expect(berths).toEqual([...berths].sort((x, y) => y - x));
    expect(result.layouts[0]!.stats.totalBerths).toBe(96);
    expect(result.layouts.map((l) => l.score)).toEqual(berths);
  });
});

describe('generateLayouts on the demo projects (SPEC §10)', () => {
  for (const demo of DEMO_PROJECTS) {
    const project = demo.create();
    const input = inputFor(project.site, {
      boatClasses: project.boatClasses,
      params: project.params,
      objective: project.objective,
    });

    describe(demo.id, () => {
      const result = generateLayouts(input);
      const prepared = prepareSite(project.site, project.params);

      it('produces at least 3 distinct alternatives and no more than 5', () => {
        expect(result.diagnostics).toEqual([]);
        expect(result.layouts.length).toBeGreaterThanOrEqual(3);
        expect(result.layouts.length).toBeLessThanOrEqual(5);
        for (let i = 0; i < result.layouts.length; i++) {
          for (let j = i + 1; j < result.layouts.length; j++) {
            expect(isNearDuplicate(result.layouts[i]!, result.layouts[j]!)).toBe(false);
          }
        }
        expect(new Set(result.layouts.map((l) => l.id)).size).toBe(result.layouts.length);
      });

      it('runs in under 2 seconds', () => {
        const t0 = performance.now();
        generateLayouts(input);
        expect(performance.now() - t0).toBeLessThan(2000);
      });

      it('is deterministic: two runs give identical JSON', () => {
        expect(JSON.stringify(generateLayouts(input))).toBe(JSON.stringify(result));
      });

      it('every alternative meets the configured constraints', () => {
        for (const layout of result.layouts) {
          expect(layout.issues).toEqual([]);
          expect(layout.feasibility).toBe('operationalOK');
          expect(layout.stats.totalBerths).toBeGreaterThan(0);
          expect(layout.modified).toBe(false);
        }
      });

      // Independent of validate.ts: the properties are re-checked directly on the geometry.
      it('property: everything is inside the water and clear of obstacle buffers', () => {
        for (const layout of result.layouts) {
          const shapes = [
            ...layout.piers.map((p) => pierPolygon(p.start, p.end, p.width)),
            ...layout.fingers.map((f) => f.shape),
            ...layout.berths.map((b) => b.slot),
          ];
          for (const shape of shapes) {
            expect(convexInsideRegion(shape, prepared.water)).toBe(true);
            expect(convexIntersectsRegion(shape, prepared.obstacleBuffer)).toBe(false);
          }
        }
      });

      it('property: no overlaps between piers, fingers and slots', () => {
        for (const layout of result.layouts) {
          const shapes = [
            ...layout.piers.map((p) => pierPolygon(p.start, p.end, p.width)),
            ...layout.fingers.map((f) => f.shape),
            ...layout.berths.map((b) => b.slot),
          ];
          let overlaps = 0;
          for (let i = 0; i < shapes.length; i++) {
            for (let j = i + 1; j < shapes.length; j++) {
              if (convexPolygonsOverlap(shapes[i]!, shapes[j]!)) overlaps++;
            }
          }
          expect(overlaps).toBe(0);
        }
      });

      it('property: every boat is inside its slot', () => {
        for (const layout of result.layouts) {
          for (const b of layout.berths) {
            expect(convexInsideRegion(b.boat, regionFromPolygon(b.slot))).toBe(true);
          }
        }
      });

      it('property: the class mix is close to the target and stats agree with the elements', () => {
        const best = result.layouts[0]!;
        expect(best.stats.mixDeviation).toBeLessThan(0.05);
        for (const layout of result.layouts) {
          expect(layout.stats.totalBerths).toBe(layout.berths.length);
          expect(Object.values(layout.stats.berthsByClass).reduce((a, b) => a + b, 0)).toBe(layout.berths.length);
          const ids = [...layout.piers, ...layout.fingers, ...layout.berths].map((e) => e.id);
          expect(new Set(ids).size).toBe(ids.length);
        }
      });

      it('includes the perpendicular strategy and ranks by the objective', () => {
        expect(byStrategy(result.layouts, 'A')).toHaveLength(1);
        const scores = result.layouts.map((l) => l.score);
        expect(scores).toEqual([...scores].sort((x, y) => y - x));
      });
    });
  }
});

describe('berths that cannot be reached from the entrance', () => {
  /**
   * Basin 46 m wide and 140 m deep with the entrance on the north edge, and a rock in the
   * middle. Default mix: one pier with one row fits (3 + 12.5 + 18 = 33.5 m of 46 m).
   * The rock with its 2 m clearance covers x = 16 … 30, leaving 16 m on either side:
   * wherever the 18 m fairway is put, it cannot pass the rock. Berths between the rock
   * and the shore are therefore cut off from the entrance.
   */
  const site: Site = {
    water: [{ x: 0, y: 0 }, { x: 46, y: 0 }, { x: 46, y: 140 }, { x: 0, y: 140 }],
    shoreline: [{ x: 0, y: 0 }, { x: 46, y: 0 }],
    entrance: { a: { x: 0, y: 140 }, b: { x: 46, y: 140 } },
    // 10 × 8 m rock in the middle of the basin, 60 m from the shore.
    obstacles: [{ id: 'rock', kind: 'rock', shape: [{ x: 18, y: 60 }, { x: 28, y: 60 }, { x: 28, y: 68 }, { x: 18, y: 68 }] }],
    zones: [],
  };
  const withRock = generateLayouts(inputFor(site));
  const open = generateLayouts(inputFor({ ...site, obstacles: [] }));
  const a = byStrategy(withRock.layouts, 'A')[0]!;
  // Without the rock the best layout is the same single pier (it may be listed under
  // another strategy name, because near-duplicates are removed).
  const best = open.layouts[0]!;

  it('are left out of the layout, and the number is recorded', () => {
    for (const layout of open.layouts) expect(layout.unreachableRemoved).toBe(0);
    expect(a.unreachableRemoved).toBeGreaterThan(0);
    expect(a.stats.unreachableRemoved).toBe(a.unreachableRemoved);
    // They are not part of the layout: not in the berth list, not in the totals.
    expect(a.stats.totalBerths).toBe(a.berths.length);
    expect(a.berths.every((b) => !b.removed)).toBe(true);
    expect(a.stats.totalBerths).toBeLessThan(best.stats.totalBerths);
  });

  it('the remaining berths all lie beyond the rock, towards the entrance', () => {
    // The rock's buffer reaches y = 70; nothing may remain in the pocket south of y = 58.
    const southmost = Math.min(...a.berths.flatMap((b) => b.slot.map((p) => p.y)));
    expect(southmost).toBeGreaterThan(58);
  });

  it('leaving berths out is not an issue of the layout: what remains meets the constraints', () => {
    expect(a.issues).toEqual([]);
    expect(a.feasibility).toBe('operationalOK');
  });

  it('the count survives a manual edit', () => {
    const ctx = { prepared: prepareSite(site, DEFAULT_PARAMS), classes: DEFAULT_BOAT_CLASSES, params: DEFAULT_PARAMS };
    const edited = setBerthRemoved(a, a.berths[0]!.id, true, ctx);
    expect(edited.unreachableRemoved).toBe(a.unreachableRemoved);
    expect(edited.stats.unreachableRemoved).toBe(a.unreachableRemoved);
    expect(edited.stats.totalBerths).toBe(a.stats.totalBerths - 1);
  });
});

describe('generateLayouts options', () => {
  it('a fixed orientation is respected by the parallel-pier strategies', () => {
    const result = generateLayouts(inputFor(IRREGULAR_BAY_SITE, { params: { ...DEFAULT_PARAMS, orientation: 90 } }));
    const parallel = result.layouts.filter((l) => l.strategy !== 'D');
    expect(parallel.length).toBeGreaterThan(0);
    for (const layout of parallel) {
      for (const p of layout.piers) {
        const bearing = vectorToBearing({ x: p.end.x - p.start.x, y: p.end.y - p.start.y }) % 180;
        expect(bearing).toBeCloseTo(90, 6);
      }
    }
  });

  it('topN limits the number of alternatives', () => {
    expect(generateLayouts(inputFor(RECT_BASIN_SITE, { topN: 2 })).layouts).toHaveLength(2);
  });

  it('the objective changes the ranking', () => {
    const lean = generateLayouts(
      inputFor(RECT_BASIN_SITE, { objective: { ...DEFAULT_OBJECTIVE, id: 'minInfrastructure', targetBerths: 100 } }),
    );
    const scores = lean.layouts.map((l) => l.score);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    // Layouts that reach the target come before those that do not.
    const reached = lean.layouts.map((l) => l.stats.totalBerths >= 100);
    expect(reached).toEqual([...reached].sort((x, y) => Number(y) - Number(x)));
    expect(lean.layouts[0]!.score).toBeCloseTo(-lean.layouts[0]!.stats.pontoonPerBerth, 9);
  });

  it('near-duplicate rule: berth and pier counts both within 2 %', () => {
    const fake = (berths: number, piers: number) =>
      ({ stats: { totalBerths: berths }, piers: Array(piers).fill(null) }) as unknown as Layout;
    expect(isNearDuplicate(fake(200, 5), fake(197, 5))).toBe(true); // 1.5 %
    expect(isNearDuplicate(fake(200, 5), fake(190, 5))).toBe(false); // 5 %
    expect(isNearDuplicate(fake(200, 5), fake(200, 4))).toBe(false); // different pier count
  });
});

describe('generateLayouts when nothing fits (SPEC §5, diagnostics)', () => {
  it('a channel narrower than one pier module', () => {
    // 200 m long, 20 m wide, shore along one long side. Default mix: a pier module needs
    // pier 3.0 + row 12.5 + fairway 18.0 = 33.5 m; a pier across the channel could be at
    // most 20 − 18 = 2 m long.
    const site: Site = {
      water: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 20 }, { x: 0, y: 20 }],
      shoreline: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      entrance: { a: { x: 200, y: 0 }, b: { x: 200, y: 20 } },
      obstacles: [],
      zones: [],
    };
    const result = generateLayouts(inputFor(site));
    expect(result.layouts).toEqual([]);
    const narrow = result.diagnostics.find((d) => d.code === 'WATER_NARROWER_THAN_MODULE');
    expect(narrow).toBeDefined();
    // "available" = pier 3.0 m + the deepest bay-wide box beside a pier along the shore,
    // 20 − 3 = 17.0 m → 20.0 m.
    expect(narrow!.message).toBe('Water area narrower than one pier module (needs 33.5 m, available 20.0 m).');
    expect(result.diagnostics.map((d) => d.code)).toEqual(['WATER_NARROWER_THAN_MODULE']);
  });

  it('no pier can reach the shoreline', () => {
    // The shoreline is drawn 50 m away from the water.
    const site: Site = { ...RECT_BASIN_SITE, shoreline: [{ x: 0, y: -50 }, { x: 220, y: -50 }] };
    const result = generateLayouts(inputFor(site));
    expect(result.layouts).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['NO_PIER_REACHES_SHORE']);
    expect(result.diagnostics[0]!.message).toBe('No pier can reach the shoreline.');
  });

  it('water too short for a pier', () => {
    // 20 m of water in front of the shore; a pier needs one bay (4.1 m) + 18 m at its head.
    // The shore is too short (3 m) for a shore-parallel pier.
    const site: Site = {
      water: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 20 }, { x: 0, y: 20 }],
      shoreline: [{ x: 0, y: 0 }, { x: 3, y: 0 }],
      entrance: { a: { x: 0, y: 20 }, b: { x: 3, y: 20 } },
      obstacles: [],
      zones: [],
    };
    const result = generateLayouts(inputFor(site));
    expect(result.layouts).toEqual([]);
    const short = result.diagnostics.find((d) => d.code === 'WATER_TOO_SHORT_FOR_PIER');
    expect(short?.message).toContain('22.1 m is needed');
  });

  it('missing inputs are reported before any search', () => {
    const noClasses = generateLayouts(inputFor(RECT_BASIN_SITE, { boatClasses: [] }));
    expect(noClasses.diagnostics.map((d) => d.code)).toEqual(['NO_BOAT_CLASSES']);
    const noShore = generateLayouts(inputFor({ ...RECT_BASIN_SITE, shoreline: [] }));
    expect(noShore.diagnostics.map((d) => d.code)).toEqual(['NO_SHORELINE']);
    const noEntrance = generateLayouts(inputFor({ ...RECT_BASIN_SITE, entrance: { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } } }));
    expect(noEntrance.diagnostics.map((d) => d.code)).toEqual(['NO_ENTRANCE']);
    const noWater = generateLayouts(inputFor({ ...RECT_BASIN_SITE, water: [] }));
    expect(noWater.diagnostics.map((d) => d.code)).toEqual(['NO_WATER_AREA']);
  });
});
