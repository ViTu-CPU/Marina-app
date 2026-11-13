import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS, IRREGULAR_BAY_SITE, RECT_BASIN_SITE } from '../demos';
import {
  distance,
  distancePointToPolyline,
  distancePointToRing,
  EPS,
  isCounterClockwise,
  polygonArea,
} from '../geometry';
import type { Site } from '../model';

const sites: [string, Site][] = [
  ['rectangular basin', RECT_BASIN_SITE],
  ['irregular bay', IRREGULAR_BAY_SITE],
];

describe('demo sites (SPEC §9)', () => {
  it('rectangular basin is 220 m × 140 m = 30 800 m²', () => {
    expect(polygonArea(RECT_BASIN_SITE.water)).toBe(30800);
  });

  it('irregular bay is 260 × 90 + 120 × 110 = 36 600 m² and concave', () => {
    expect(polygonArea(IRREGULAR_BAY_SITE.water)).toBe(36600);
    expect(IRREGULAR_BAY_SITE.water.length).toBe(6);
  });

  it('rock approximates a Ø 12 m circle from the outside', () => {
    const rock = RECT_BASIN_SITE.obstacles[0]!;
    expect(rock.kind).toBe('rock');
    const centre = { x: 150, y: 70 };
    // Every edge is at least the radius away from the centre: the polygon contains the circle.
    expect(distancePointToRing(centre, rock.shape)).toBeGreaterThanOrEqual(6 - 0.001);
    // Circle area is π·6² ≈ 113.1 m²; a circumscribed 16-gon is 16·6²·tan(π/16) ≈ 114.6 m².
    expect(polygonArea(rock.shape)).toBeCloseTo(16 * 36 * Math.tan(Math.PI / 16), 1);
  });

  it('irregular bay has an existing pier obstacle and a noNavigation zone', () => {
    expect(IRREGULAR_BAY_SITE.obstacles.map((o) => o.kind)).toEqual(['pier']);
    expect(IRREGULAR_BAY_SITE.zones.map((z) => z.kind)).toEqual(['noNavigation']);
  });

  it.each(sites)('%s: all rings are counter-clockwise', (_name, site) => {
    expect(isCounterClockwise(site.water)).toBe(true);
    for (const o of site.obstacles) expect(isCounterClockwise(o.shape)).toBe(true);
    for (const z of site.zones) expect(isCounterClockwise(z.shape)).toBe(true);
  });

  it.each(sites)('%s: shoreline and entrance lie on the water boundary', (_name, site) => {
    for (const p of site.shoreline) expect(distancePointToRing(p, site.water)).toBeLessThan(EPS);
    expect(distancePointToRing(site.entrance.a, site.water)).toBeLessThan(EPS);
    expect(distancePointToRing(site.entrance.b, site.water)).toBeLessThan(EPS);
    expect(distance(site.entrance.a, site.entrance.b)).toBeGreaterThan(0);
  });

  it.each(sites)('%s: the entrance is not on the shoreline', (_name, site) => {
    const mid = {
      x: (site.entrance.a.x + site.entrance.b.x) / 2,
      y: (site.entrance.a.y + site.entrance.b.y) / 2,
    };
    expect(distancePointToPolyline(mid, site.shoreline)).toBeGreaterThan(1);
  });
});

describe('defaults', () => {
  it('default boat mix is the SPEC §9 mix and the shares sum to 1', () => {
    expect(DEFAULT_BOAT_CLASSES.map((c) => [c.length, c.beam, c.share])).toEqual([
      [5.0, 2.0, 0.3],
      [7.0, 2.5, 0.35],
      [9.0, 3.0, 0.25],
      [12.0, 3.5, 0.1],
    ]);
    expect(DEFAULT_BOAT_CLASSES.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 12);
  });

  it('default parameters match SPEC §4', () => {
    expect(DEFAULT_PARAMS).toEqual({
      mainPierWidth: 3.0,
      fingerWidth: 0.8,
      fingerLengthRatio: 0.8,
      boatsPerBay: 2,
      beamClearance: 0.5,
      lengthClearance: 0.5,
      fairwayFactor: 1.5,
      fairwayMin: 8.0,
      obstacleClearance: 2.0,
      maxMainPierLength: 150,
      orientation: 'auto',
      shoreOffset: 0,
    });
  });
});

describe('demo projects', () => {
  it('are plain JSON and independent copies', () => {
    for (const demo of DEMO_PROJECTS) {
      const a = demo.create();
      const b = demo.create();
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
      a.site.water[0]!.x = 999;
      expect(b.site.water[0]!.x).toBe(0);
      expect(demo.create().site.water[0]!.x).toBe(0);
    }
  });
});
