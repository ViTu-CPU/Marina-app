import { describe, expect, it } from 'vitest';
import { polygonArea, regionArea, signedArea } from '../geometry';
import { planSite, regionFromPolygons, regionFromTileRings } from '../planSite';

const rect = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('site from a detailed-plan area (U34)', () => {
  // Plan 100 × 100 m; water everywhere north of y = 40 with a 4 × 4 m island, and a small pond in the land.
  const plan = regionFromPolygons([[rect(0, 0, 100, 100)]]);
  const water = regionFromPolygons([[rect(-50, 40, 200, 200), rect(50, 60, 54, 64)], [rect(10, 5, 20, 15)]]);

  it('water = plan ∩ water: the largest part, its island, and the parts left out', () => {
    const s = planSite(plan, water)!;
    // Hand calculation: 100 m × (100 − 40) m = 6 000 m², less the island 4 × 4 = 16 m².
    expect(polygonArea(s.water)).toBeCloseTo(6000, 6);
    expect(s.area).toBeCloseTo(5984, 6);
    expect(s.islands).toHaveLength(1);
    expect(polygonArea(s.islands[0]!)).toBeCloseTo(16, 6);
    expect(signedArea(s.water)).toBeGreaterThan(0);
    expect(signedArea(s.islands[0]!)).toBeGreaterThan(0);
    // The pond (10 × 10 m) is a second water part of the plan.
    expect(s.otherParts).toBe(1);
  });

  it('the shoreline is the edge of the water that is not the plan boundary', () => {
    const s = planSite(plan, water)!;
    // Only the edge y = 40 from x = 0 to x = 100 is shore; the other three sides are the plan boundary.
    expect(s.shoreline).toHaveLength(2);
    const xs = s.shoreline.map((p) => p.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 100]);
    expect(s.shoreline.every((p) => p.y === 40)).toBe(true);
  });

  it('a plan without water gives nothing', () => {
    expect(planSite(plan, regionFromPolygons([[rect(300, 300, 400, 400)]]))).toBeNull();
  });

  it('a lake wholly inside the plan: all its edge is shore (a closed shoreline)', () => {
    const s = planSite(plan, regionFromPolygons([[rect(20, 20, 60, 50)]]))!;
    expect(polygonArea(s.water)).toBeCloseTo(1200, 6);
    expect(s.shoreline).toHaveLength(5);
    expect(s.shoreline[0]).toEqual(s.shoreline[4]);
  });

  it('vector-tile rings: exterior clockwise in the tile (y down) = negative area with y up; positive = hole', () => {
    // A 10 × 10 exterior and a 2 × 2 hole, as they come from the tile after flipping y.
    const outer = rect(0, 0, 10, 10).reverse(); // clockwise with y up
    const hole = rect(4, 4, 6, 6); // counter-clockwise with y up
    const r = regionFromTileRings([outer, hole]);
    expect(regionArea(r)).toBeCloseTo(96, 9);
    expect(r[0]!.holes).toHaveLength(1);
  });
});
