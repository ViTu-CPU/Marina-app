import { describe, expect, it } from 'vitest';
import { RECT_BASIN_SITE } from '../demos';
import {
  bearingToVector,
  boxPolygon,
  clipSegmentToRegion,
  convexInsideRegion,
  convexIntersectsRegion,
  convexOverlapDepth,
  convexPolygonsOverlap,
  distancePointToSegment,
  insetConvexPolygon,
  isCounterClockwise,
  orientedRect,
  pointInRegion,
  pointInRing,
  polygonArea,
  regionArea,
  regionFromPolygon,
  rotate,
  segmentIntersectionParam,
  signedArea,
  vectorToBearing,
  type Region,
} from '../geometry';
import { bufferRegion, differenceRegions, intersectRegions, unionRegions } from '../geometryOps';
import type { Polygon } from '../model';

const rect = (x0: number, y0: number, x1: number, y1: number): Polygon =>
  boxPolygon({ minX: x0, minY: y0, maxX: x1, maxY: y1 });

/** L-shape: 20 × 10 base with a 10 × 10 block on top of its left half. Area 300 m². */
const L_SHAPE: Polygon = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 20 },
  { x: 0, y: 20 },
];

describe('rings', () => {
  it('signed area is positive for counter-clockwise rings', () => {
    expect(signedArea(rect(0, 0, 4, 3))).toBe(12);
    expect(signedArea([...rect(0, 0, 4, 3)].reverse())).toBe(-12);
    expect(polygonArea(L_SHAPE)).toBe(300);
  });

  it('distance from a point to a segment', () => {
    expect(distancePointToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    // Beyond the end of the segment the nearest point is the end point: 3-4-5 triangle.
    expect(distancePointToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
});

describe('angles', () => {
  it('bearings are degrees clockwise from north', () => {
    expect(bearingToVector(0).x).toBeCloseTo(0, 12);
    expect(bearingToVector(0).y).toBeCloseTo(1, 12);
    expect(bearingToVector(90).x).toBeCloseTo(1, 12);
    expect(bearingToVector(90).y).toBeCloseTo(0, 12);
    expect(vectorToBearing({ x: 0, y: -1 })).toBeCloseTo(180, 12);
    expect(vectorToBearing({ x: -1, y: 0 })).toBeCloseTo(270, 12);
  });

  it('rotate turns counter-clockwise', () => {
    const p = rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
  });
});

describe('rectangles', () => {
  it('orientedRect spans along the direction and to its left', () => {
    // From (0,0) heading north for 10 m, 3 m to the left (west).
    const r = orientedRect({ x: 0, y: 0 }, { x: 0, y: 1 }, 10, 3);
    expect(polygonArea(r)).toBeCloseTo(30, 9);
    expect(isCounterClockwise(r)).toBe(true);
    expect(Math.min(...r.map((p) => p.x))).toBeCloseTo(-3, 9);
    expect(Math.max(...r.map((p) => p.y))).toBeCloseTo(10, 9);
  });

  it('insetting a 10 × 4 rectangle by 1 m gives 8 × 2', () => {
    const inner = insetConvexPolygon(rect(0, 0, 10, 4), 1);
    expect(polygonArea(inner)).toBeCloseTo(16, 9);
    expect(inner[0]).toEqual({ x: 1, y: 1 });
  });
});

describe('overlap of convex polygons (SPEC §6: tolerance 1 cm)', () => {
  it('reports the penetration depth', () => {
    expect(convexOverlapDepth(rect(0, 0, 2, 2), rect(1.5, 0, 4, 2))).toBeCloseTo(0.5, 12);
    expect(convexOverlapDepth(rect(0, 0, 2, 2), rect(2, 0, 4, 2))).toBeCloseTo(0, 12);
    expect(convexOverlapDepth(rect(0, 0, 2, 2), rect(3, 0, 4, 2))).toBeLessThan(0);
  });

  it('touching or overlapping by 5 mm is not an overlap; 2 cm is', () => {
    expect(convexPolygonsOverlap(rect(0, 0, 2, 2), rect(2, 0, 4, 2))).toBe(false);
    expect(convexPolygonsOverlap(rect(0, 0, 2, 2), rect(1.995, 0, 4, 2))).toBe(false);
    expect(convexPolygonsOverlap(rect(0, 0, 2, 2), rect(1.98, 0, 4, 2))).toBe(true);
  });

  it('works for rotated rectangles', () => {
    const diamond = orientedRect({ x: 0, y: 0 }, bearingToVector(45), 2, 2);
    expect(convexPolygonsOverlap(diamond, rect(-1, 0.5, 1, 1.5))).toBe(true);
    expect(convexPolygonsOverlap(diamond, rect(3, 3, 4, 4))).toBe(false);
  });
});

describe('point and segment predicates', () => {
  it('point in ring', () => {
    expect(pointInRing({ x: 5, y: 15 }, L_SHAPE)).toBe(true);
    expect(pointInRing({ x: 15, y: 15 }, L_SHAPE)).toBe(false);
  });

  it('segment intersection parameter', () => {
    expect(segmentIntersectionParam({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: -1 }, { x: 4, y: 1 })).toBe(0.4);
    expect(segmentIntersectionParam({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 1 }, { x: 4, y: 2 })).toBeNull();
    expect(segmentIntersectionParam({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBeNull();
  });
});

describe('regions', () => {
  const lRegion = regionFromPolygon(L_SHAPE);
  // 20 × 20 square with a 4 × 4 hole in the middle.
  const donut: Region = [{ outer: rect(0, 0, 20, 20), holes: [[...rect(8, 8, 12, 12)].reverse()] }];

  it('area subtracts holes', () => {
    expect(regionArea(donut)).toBe(400 - 16);
    expect(pointInRegion({ x: 10, y: 10 }, donut)).toBe(false);
    expect(pointInRegion({ x: 2, y: 2 }, donut)).toBe(true);
  });

  it('convexInsideRegion: inside, across the concave corner, outside', () => {
    expect(convexInsideRegion(rect(1, 1, 9, 19), lRegion)).toBe(true);
    // Spans the notch at (10..20, 10..20): corners at y=12 on the right are outside.
    expect(convexInsideRegion(rect(5, 8, 15, 12), lRegion)).toBe(false);
    expect(convexInsideRegion(rect(5, 5, 9, 9), lRegion)).toBe(true);
    expect(convexInsideRegion(rect(30, 30, 31, 31), lRegion)).toBe(false);
  });

  it('convexInsideRegion: touching the boundary is allowed, crossing by 2 cm is not', () => {
    expect(convexInsideRegion(rect(0, 0, 5, 5), lRegion)).toBe(true);
    expect(convexInsideRegion(rect(-0.005, 0, 5, 5), lRegion)).toBe(true);
    expect(convexInsideRegion(rect(-0.02, 0, 5, 5), lRegion)).toBe(false);
  });

  it('convexInsideRegion: all corners inside but an edge leaves the region', () => {
    // U-shape: 30 × 20 with a 10 m wide slot cut from the top down to y = 5.
    const u = regionFromPolygon([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 20 },
      { x: 0, y: 20 },
    ]);
    // Corners at x = 5 and x = 25 are in the two arms; the rectangle bridges the slot.
    expect(convexInsideRegion(rect(5, 10, 25, 12), u)).toBe(false);
    expect(convexInsideRegion(rect(5, 1, 25, 4), u)).toBe(true);
  });

  it('convexInsideRegion: a rectangle that surrounds a hole is not inside', () => {
    expect(convexInsideRegion(rect(6, 6, 14, 14), donut)).toBe(false);
    expect(convexInsideRegion(rect(1, 1, 7, 7), donut)).toBe(true);
  });

  it('convexIntersectsRegion: overlap, touch, containment either way', () => {
    const block = regionFromPolygon(rect(10, 10, 12, 12));
    expect(convexIntersectsRegion(rect(11, 11, 15, 15), block)).toBe(true);
    expect(convexIntersectsRegion(rect(12, 10, 15, 12), block)).toBe(false); // touching edge
    expect(convexIntersectsRegion(rect(10.5, 10.5, 11.5, 11.5), block)).toBe(true); // inside the block
    expect(convexIntersectsRegion(rect(5, 5, 20, 20), block)).toBe(true); // swallows the block
    expect(convexIntersectsRegion(rect(0, 0, 5, 5), block)).toBe(false);
  });

  it('clipSegmentToRegion returns the inside intervals', () => {
    // Horizontal line at y = 15 from x = -10 to x = 30 crosses the L only for x ∈ [0, 10].
    const one = clipSegmentToRegion({ x: -10, y: 15 }, { x: 30, y: 15 }, lRegion);
    expect(one).toHaveLength(1);
    expect(one[0]![0]).toBeCloseTo(10 / 40, 12);
    expect(one[0]![1]).toBeCloseTo(20 / 40, 12);
    // Through the donut at y = 10: inside for x ∈ [0, 8] and [12, 20].
    const two = clipSegmentToRegion({ x: 0, y: 10 }, { x: 20, y: 10 }, donut);
    expect(two.map(([a, b]) => [a * 20, b * 20])).toEqual([
      [0, 8],
      [12, 20],
    ]);
    expect(clipSegmentToRegion({ x: 30, y: 0 }, { x: 30, y: 20 }, lRegion)).toEqual([]);
  });
});

describe('set operations (JSTS)', () => {
  const square = regionFromPolygon(rect(0, 0, 10, 10));

  it('buffer by +2 m: 100 + 4·(10·2) + quarter circles (π·2² ≈ 12.57) ≈ 192.6 m²', () => {
    const area = regionArea(bufferRegion(square, 2));
    // Round corners are polygonal (8 segments per quadrant), so slightly below the exact value.
    expect(area).toBeLessThanOrEqual(100 + 80 + Math.PI * 4);
    expect(area).toBeGreaterThan(100 + 80 + Math.PI * 4 - 0.1);
  });

  it('buffer by −2 m shrinks a 10 m square to 6 m', () => {
    expect(regionArea(bufferRegion(square, -2))).toBeCloseTo(36, 9);
    expect(bufferRegion(square, -6)).toEqual([]);
  });

  it('difference with an interior square leaves a clockwise hole', () => {
    const result = differenceRegions(square, regionFromPolygon(rect(4, 4, 6, 6)));
    expect(result).toHaveLength(1);
    expect(result[0]!.holes).toHaveLength(1);
    expect(isCounterClockwise(result[0]!.outer)).toBe(true);
    expect(isCounterClockwise(result[0]!.holes[0]!)).toBe(false);
    expect(regionArea(result)).toBeCloseTo(96, 9);
  });

  it('difference can split a region into parts', () => {
    const result = differenceRegions(square, regionFromPolygon(rect(4, -1, 6, 11)));
    expect(result).toHaveLength(2);
    expect(regionArea(result)).toBeCloseTo(80, 9);
  });

  it('union merges overlapping and touching squares', () => {
    const merged = unionRegions([square, regionFromPolygon(rect(5, 0, 15, 10)), regionFromPolygon(rect(15, 0, 20, 10))]);
    expect(merged).toHaveLength(1);
    expect(regionArea(merged)).toBeCloseTo(200, 9);
    const apart = unionRegions([square, regionFromPolygon(rect(20, 0, 30, 10))]);
    expect(apart).toHaveLength(2);
  });

  it('intersection area', () => {
    expect(regionArea(intersectRegions(square, regionFromPolygon(rect(5, 5, 15, 15))))).toBeCloseTo(25, 9);
    expect(intersectRegions(square, regionFromPolygon(rect(20, 20, 30, 30)))).toEqual([]);
  });

  it('demo basin minus the rock buffered by 2 m removes roughly a Ø 16 m disc', () => {
    const water = regionFromPolygon(RECT_BASIN_SITE.water);
    const rock = regionFromPolygon(RECT_BASIN_SITE.obstacles[0]!.shape);
    const feasible = differenceRegions(water, bufferRegion(rock, 2));
    const removed = 30800 - regionArea(feasible);
    // Lower bound: disc of radius 8 m = π·64 ≈ 201.1 m² (minus arc approximation).
    // Upper bound: 16-gon area 114.6 + perimeter 38.2 × 2 + π·4 ≈ 203.5 m².
    expect(removed).toBeGreaterThan(200.5);
    expect(removed).toBeLessThan(203.6);
    expect(feasible).toHaveLength(1);
    expect(feasible[0]!.holes).toHaveLength(1);
  });
});
