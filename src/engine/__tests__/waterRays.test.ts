import { describe, expect, it } from 'vitest';
import { firstLand, pointInWater, tilesAlong, waterCrossings, type WaterTile } from '../waterRays';

const square = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

describe('water polygons on a tile (I113)', () => {
  // Sea over the right half of the tile, with an island (hole) at x 0.7–0.8, y 0.4–0.6.
  const sea: WaterTile = { polygons: [[square(0.5, -0.1, 1.1, 1.1), square(0.7, 0.4, 0.8, 0.6)]] };

  it('a point is water inside a polygon and land in its holes', () => {
    expect(pointInWater(sea, 0.6, 0.5)).toBe(true);
    expect(pointInWater(sea, 0.75, 0.5)).toBe(false);
    expect(pointInWater(sea, 0.3, 0.5)).toBe(false);
  });

  it('crossings along a segment, sorted', () => {
    const t = waterCrossings(sea, { x: 0.2, y: 0.5 }, { x: 1, y: 0.5 });
    expect(t.map((x) => Math.round(x * 1000) / 1000)).toEqual([0.375, 0.625, 0.75]);
  });

  it('first land along a segment: the island; none when the segment stays in water; a start on land', () => {
    expect(firstLand(sea, { x: 0.55, y: 0.5 }, { x: 0.95, y: 0.5 })).toEqual({ t: expect.closeTo(0.375, 9), startsOnLand: false });
    expect(firstLand(sea, { x: 0.55, y: 0.1 }, { x: 0.95, y: 0.1 })).toEqual({ t: null, startsOnLand: false });
    expect(firstLand(sea, { x: 0.2, y: 0.5 }, { x: 0.9, y: 0.5 })).toEqual({ t: 0, startsOnLand: true });
  });

  it('a lake drawn against the sea is not a shore: the water state is tested between crossings', () => {
    const touching: WaterTile = { polygons: [[square(0, 0, 0.5, 1)], [square(0.5, 0, 1, 1)]] };
    expect(firstLand(touching, { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }).t).toBeNull();
    const overlapping: WaterTile = { polygons: [[square(0, 0, 0.6, 1)], [square(0.4, 0, 0.8, 1)]] };
    expect(firstLand(overlapping, { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }).t).toBeCloseTo(0.875, 9);
  });

  it('tiles along a segment, in order, with entry and exit parameters', () => {
    const tiles = tilesAlong({ x: 10.5, y: 20.5 }, { x: 12.5, y: 21.5 });
    expect(tiles.map((p) => [p.tx, p.ty])).toEqual([
      [10, 20],
      [11, 20],
      [11, 21],
      [12, 21],
    ]);
    expect(tiles[0]!.t0).toBe(0);
    expect(tiles[0]!.t1).toBeCloseTo(0.25, 12);
    expect(tiles[1]!.t1).toBeCloseTo(0.5, 12);
    expect(tiles[3]!.t1).toBe(1);
    // Inside one tile; going west and north.
    expect(tilesAlong({ x: 3.2, y: 4.2 }, { x: 3.8, y: 4.9 })).toEqual([{ tx: 3, ty: 4, t0: 0, t1: 1 }]);
    expect(tilesAlong({ x: 5.5, y: 5.5 }, { x: 4.5, y: 4.9 }).map((p) => [p.tx, p.ty])).toEqual([
      [5, 5],
      [4, 5],
      [4, 4],
    ]);
  });
});
