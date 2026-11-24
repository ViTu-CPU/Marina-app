/**
 * Strategy F (D67, D68): groups of piers in different directions, each square to its own stretch of
 * shore, with shared fairways and every berth reachable from the entrance; uniform modules or every
 * row sized by its own boats.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { IRREGULAR_BAY_SITE, RECT_BASIN_SITE } from '../demos';
import { generateLayouts, shoreSections } from '../generate';
import { convexPolygonsOverlap, distance, vectorToBearing } from '../geometry';
import type { Layout, Site } from '../model';
import { pierPolygon } from '../site';
import { IssueCode } from '../validate';

const run = (site: Site, params = DEFAULT_PARAMS) => generateLayouts({ site, boatClasses: DEFAULT_BOAT_CLASSES, params, objective: DEFAULT_OBJECTIVE });
const axis = (l: Layout['piers'][number]) => Math.round(vectorToBearing({ x: l.end.x - l.start.x, y: l.end.y - l.start.y })) % 180;

describe('shore sections', () => {
  it('an L-shaped shore is two sections, the longest first', () => {
    const s = shoreSections([{ x: 0, y: 200 }, { x: 0, y: 0 }, { x: 260, y: 0 }]);
    expect(s.map((x) => [Math.round(x.bearing), Math.round(x.length)])).toEqual([
      [90, 260],
      [0, 200],
    ]);
  });

  it('a gentle curve stays one section; a short stretch gets none', () => {
    const curve = Array.from({ length: 21 }, (_, i) => ({ x: 100 * Math.sin((i * Math.PI) / 180), y: 100 * Math.cos((i * Math.PI) / 180) }));
    expect(shoreSections(curve)).toHaveLength(1);
    expect(shoreSections([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 10 }])).toHaveLength(1);
  });
});

describe('strategy F: mixed directions', () => {
  const bay = run(IRREGULAR_BAY_SITE);
  const f = bay.layouts.find((l) => l.strategy === 'F')!;

  it('the L-shaped bay gets piers in two directions, square to each shore', () => {
    expect(f).toBeDefined();
    expect(new Set(f.piers.map(axis))).toEqual(new Set([0, 90]));
    expect(f.name).toMatch(/^F – Mixed directions(, sized by boat class)? \((0|90)° \/ (0|90)°\)$/);
  });

  it('meets the configured constraints: no overlaps, every berth reachable from the entrance', () => {
    expect(f.feasibility).not.toBe('geometricFail');
    expect(f.stats.issueCounts.error).toBe(0);
    // The only warning allowed: berths the search placed but the exact check found unreachable were
    // left out (D12); every berth kept is reachable.
    expect(f.issues.filter((i) => i.code !== IssueCode.BERTHS_LEFT_OUT_UNREACHABLE)).toEqual([]);
    expect(f.berths.every((b) => b.issues.length === 0)).toBe(true);
    const shapes = [...f.piers.map((p) => pierPolygon(p.start, p.end, p.width)), ...f.berths.map((b) => b.slot)];
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) expect(convexPolygonsOverlap(shapes[i]!, shapes[j]!)).toBe(false);
  });

  it('holds more berths than the single-direction layouts of the same module (A, C)', () => {
    const single = bay.layouts.filter((l) => l.strategy === 'A' || l.strategy === 'C').map((l) => l.stats.totalBerths);
    expect(f.stats.totalBerths).toBeGreaterThan(Math.max(...single));
  });

  it('every pier starts at the shore', () => {
    for (const p of f.piers) {
      const nearest = Math.min(...IRREGULAR_BAY_SITE.shoreline.slice(1).map((b, i) => {
        const a = IRREGULAR_BAY_SITE.shoreline[i]!;
        const t = Math.max(0, Math.min(1, ((p.start.x - a.x) * (b.x - a.x) + (p.start.y - a.y) * (b.y - a.y)) / distance(a, b) ** 2));
        return distance(p.start, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }));
      expect(nearest).toBeLessThanOrEqual(DEFAULT_PARAMS.shoreGap + DEFAULT_PARAMS.mainPierWidth);
    }
  });

  it('is deterministic', () => {
    const again = run(IRREGULAR_BAY_SITE).layouts.find((l) => l.strategy === 'F')!;
    expect(again.piers).toEqual(f.piers);
    expect(again.berths.map((b) => b.id)).toEqual(f.berths.map((b) => b.id));
  });

  it('sized by boat class (D68): in a basin with shore on three sides it beats every single direction', () => {
    const u: Site = {
      water: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 160 }, { x: 0, y: 160 }],
      shoreline: [{ x: 0, y: 160 }, { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 160 }],
      entrance: { a: { x: 70, y: 160 }, b: { x: 130, y: 160 } },
      obstacles: [],
      zones: [],
    };
    const r = run(u);
    const best = r.layouts[0]!;
    expect(best.strategy).toBe('F');
    expect(best.name).toContain('sized by boat class');
    expect(best.feasibility).toBe('operationalOK');
    expect(new Set(best.piers.map(axis)).size).toBe(2);
    const single = r.layouts.filter((l) => l.strategy !== 'F').map((l) => l.stats.totalBerths);
    expect(best.stats.totalBerths).toBeGreaterThan(Math.max(...single));
    // Rows of different depths: the size zoning is in use.
    const depths = new Set(best.berths.map((b) => Math.round(Math.hypot(b.slot[1]!.x - b.slot[0]!.x, b.slot[1]!.y - b.slot[0]!.y) * 10)));
    expect(depths.size).toBeGreaterThan(2);
  });

  it('not for one straight shore, nor for a fixed pier direction', () => {
    expect(run(RECT_BASIN_SITE).layouts.some((l) => l.strategy === 'F')).toBe(false);
    expect(run(IRREGULAR_BAY_SITE, { ...DEFAULT_PARAMS, orientation: 90 }).layouts.some((l) => l.strategy === 'F')).toBe(false);
  });
});
