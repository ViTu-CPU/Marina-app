import { describe, expect, it } from 'vitest';
import { IRREGULAR_BAY_SITE, RECT_BASIN_SITE } from '../demos';
import { polygonArea, regionArea } from '../geometry';
import type { Site } from '../model';
import { pierPolygon, placePiersOnLine, prepareSite, type PierPlacementOptions } from '../site';

const NORTH = { x: 0, y: 1 };
const EAST = { x: 1, y: 0 };

const options: PierPlacementOptions = { width: 3, maxLength: 150, headClearance: 18, minLength: 6.6 };

describe('prepareSite (SPEC §5.1)', () => {
  it('rectangular basin: structure region is water minus the buffered rock', () => {
    const prepared = prepareSite(RECT_BASIN_SITE, { obstacleClearance: 2 });
    expect(regionArea(prepared.water)).toBe(30800);
    const removed = 30800 - regionArea(prepared.structureRegion);
    expect(removed).toBeGreaterThan(200.5); // ≈ disc of radius 6 + 2 m
    expect(removed).toBeLessThan(203.6);
    // No zones: both regions are the same.
    expect(regionArea(prepared.navigableRegion)).toBeCloseTo(regionArea(prepared.structureRegion), 6);
  });

  it('irregular bay: a noNavigation zone limits boats but not structures', () => {
    const prepared = prepareSite(IRREGULAR_BAY_SITE, { obstacleClearance: 2 });
    // Zone is 45 × 35 = 1575 m², well away from the old pier buffer.
    expect(regionArea(prepared.structureRegion) - regionArea(prepared.navigableRegion)).toBeCloseTo(1575, 6);
  });

  it('zero clearance removes exactly the obstacle', () => {
    const prepared = prepareSite(IRREGULAR_BAY_SITE, { obstacleClearance: 0 });
    // Old pier: 40 × 4 = 160 m².
    expect(36600 - regionArea(prepared.structureRegion)).toBeCloseTo(160, 6);
  });

  it('noStructures and protected zones', () => {
    const site: Site = {
      ...RECT_BASIN_SITE,
      obstacles: [],
      zones: [
        { id: 'a', kind: 'noStructures', shape: [{ x: 0, y: 100 }, { x: 10, y: 100 }, { x: 10, y: 110 }, { x: 0, y: 110 }] },
        { id: 'b', kind: 'protected', shape: [{ x: 50, y: 100 }, { x: 70, y: 100 }, { x: 70, y: 110 }, { x: 50, y: 110 }] },
      ],
    };
    const prepared = prepareSite(site, { obstacleClearance: 2 });
    expect(30800 - regionArea(prepared.structureRegion)).toBeCloseTo(100 + 200, 6);
    expect(30800 - regionArea(prepared.navigableRegion)).toBeCloseTo(200, 6);
  });
});

describe('placePiersOnLine (SPEC §5.4), hand-calculated', () => {
  const basin = prepareSite(RECT_BASIN_SITE, { obstacleClearance: 2 });

  it('pier from the south shore: 140 m of water − 18 m head clearance = 122 m', () => {
    const piers = placePiersOnLine(basin, { x: 50, y: 0 }, NORTH, options);
    expect(piers).toHaveLength(1);
    expect(piers[0]!.start.x).toBeCloseTo(50, 9);
    expect(piers[0]!.start.y).toBeCloseTo(0, 9);
    expect(piers[0]!.end.y).toBeCloseTo(122, 9);
  });

  it('is capped at the maximum pier length', () => {
    const piers = placePiersOnLine(basin, { x: 50, y: 0 }, NORTH, { ...options, maxLength: 100 });
    expect(piers[0]!.end.y).toBeCloseTo(100, 9);
  });

  it('the base point may be anywhere on the line', () => {
    const piers = placePiersOnLine(basin, { x: 50, y: 500 }, NORTH, options);
    expect(piers[0]!.start.y).toBeCloseTo(0, 9);
    expect(piers[0]!.end.y).toBeCloseTo(122, 9);
  });

  it('stops before the rock: buffer starts at y ≈ 61.88, minus 18 m → ≈ 43.88', () => {
    // Rock 16-gon has a vertex straight below the centre at 70 − 6/cos(π/16) = 63.8825;
    // the 2 m buffer reaches down to 61.8825 on the centreline x = 150.
    const piers = placePiersOnLine(basin, { x: 150, y: 0 }, NORTH, options);
    expect(piers).toHaveLength(1);
    const expected = 70 - 6 / Math.cos(Math.PI / 16) - 2 - 18;
    expect(Math.abs(piers[0]!.end.y - expected)).toBeLessThan(0.02);
  });

  it('a line that only reaches non-shore edges gives no pier', () => {
    // East–west line at y = 50 runs from the west wall to the east wall; neither is shoreline.
    expect(placePiersOnLine(basin, { x: 0, y: 50 }, EAST, options)).toEqual([]);
  });

  it('the full pier width must be in the water', () => {
    // Centreline 1.0 m from the west wall: the 3 m wide pier would stick out by 0.5 m.
    expect(placePiersOnLine(basin, { x: 1.0, y: 0 }, NORTH, options)).toEqual([]);
    // 1.5 m from the wall: the pier edge lies exactly on the wall, which is allowed.
    expect(placePiersOnLine(basin, { x: 1.5, y: 0 }, NORTH, options)).toHaveLength(1);
    expect(placePiersOnLine(basin, { x: -10, y: 0 }, NORTH, options)).toEqual([]);
  });

  it('drops piers shorter than the minimum length', () => {
    // 140 − 18 = 122 m available; require more than that.
    expect(placePiersOnLine(basin, { x: 50, y: 0 }, NORTH, { ...options, minLength: 123 })).toEqual([]);
  });

  it('a pier can run against the line direction when the shore is at the far end', () => {
    const site: Site = { ...RECT_BASIN_SITE, obstacles: [], shoreline: [{ x: 0, y: 140 }, { x: 220, y: 140 }] };
    const piers = placePiersOnLine(prepareSite(site, { obstacleClearance: 2 }), { x: 50, y: 0 }, NORTH, options);
    expect(piers).toHaveLength(1);
    expect(piers[0]!.start.y).toBeCloseTo(140, 9);
    expect(piers[0]!.end.y).toBeCloseTo(18, 9);
  });

  it('irregular bay: piers from the south shore in the east arm and from the west shore in the north arm', () => {
    const bay = prepareSite(IRREGULAR_BAY_SITE, { obstacleClearance: 2 });
    // East arm is 90 m deep: 90 − 18 = 72 m.
    const south = placePiersOnLine(bay, { x: 200, y: 0 }, NORTH, options);
    expect(south).toHaveLength(1);
    expect(south[0]!.end.y).toBeCloseTo(72, 9);
    // North arm is 120 m wide: pier from the west shore at y = 150, 120 − 18 = 102 m.
    const west = placePiersOnLine(bay, { x: 0, y: 150 }, EAST, options);
    expect(west).toHaveLength(1);
    expect(west[0]!.start.x).toBeCloseTo(0, 9);
    expect(west[0]!.end.x).toBeCloseTo(102, 9);
  });

  it('pierPolygon is a rectangle of length × width', () => {
    const poly = pierPolygon({ x: 50, y: 0 }, { x: 50, y: 122 }, 3);
    expect(polygonArea(poly)).toBeCloseTo(366, 9);
  });
});
