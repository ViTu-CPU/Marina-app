/**
 * Where a straight line leaves the water, from water polygons (DECISIONS I113). Pure geometry on
 * one map tile in tile-local coordinates (0…1 across the tile, x east, y south as in Web Mercator
 * tiles); the polygons come from OpenStreetMap vector tiles (src/state/vectorTiles.ts).
 *
 * A point is water when it lies inside any of the tile's water polygons (even–odd rule over each
 * polygon's rings, so islands as holes are land).
 */

export interface TilePoint {
  x: number;
  y: number;
}
/** One polygon: its rings (outer ring and holes), each a closed list of points. */
export type TilePolygon = TilePoint[][];
export interface WaterTile {
  polygons: TilePolygon[];
}

/** Inside the polygon by the even–odd rule over all its rings. */
function insidePolygon(polygon: TilePolygon, x: number, y: number): boolean {
  let inside = false;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

export function pointInWater(tile: WaterTile, x: number, y: number): boolean {
  return tile.polygons.some((p) => insidePolygon(p, x, y));
}

/** Parameters t in (0, 1) where segment a–b crosses an edge of any water polygon, sorted. */
export function waterCrossings(tile: WaterTile, a: TilePoint, b: TilePoint): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const out: number[] = [];
  for (const polygon of tile.polygons) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const p = ring[j]!;
        const q = ring[i]!;
        const ex = q.x - p.x;
        const ey = q.y - p.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-15) continue;
        const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
        const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) out.push(t);
      }
    }
  }
  return out.sort((m, n) => m - n);
}

/**
 * The first point of segment a–b that is not water, as a parameter t in [0, 1], or null when the
 * whole segment is water. `startsOnLand` tells that the segment's first point is already land.
 * Between two crossings the water state is tested at the middle, so polygons that overlap or
 * touch (a lake drawn against the sea) do not end the segment.
 */
export function firstLand(tile: WaterTile, a: TilePoint, b: TilePoint): { t: number | null; startsOnLand: boolean } {
  const at = (t: number): TilePoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const stops = [0, ...waterCrossings(tile, a, b), 1];
  // The start itself: a hair along the segment, so that a start exactly on an edge is judged by the side it goes to.
  const first = at(Math.min(1e-9, stops[1]! / 2));
  if (!pointInWater(tile, first.x, first.y)) return { t: 0, startsOnLand: true };
  for (let i = 1; i < stops.length; i++) {
    const lo = stops[i - 1]!;
    const hi = stops[i]!;
    if (hi - lo < 1e-12) continue;
    const mid = at((lo + hi) / 2);
    if (!pointInWater(tile, mid.x, mid.y)) return { t: lo, startsOnLand: false };
  }
  return { t: null, startsOnLand: false };
}

/**
 * The tiles a segment passes through on the tile grid (coordinates in tiles, e.g. 9324.67), in
 * order, each with the segment's parameters where it enters and leaves the tile.
 */
export function tilesAlong(a: TilePoint, b: TilePoint): { tx: number; ty: number; t0: number; t1: number }[] {
  const out: { tx: number; ty: number; t0: number; t1: number }[] = [];
  let tx = Math.floor(a.x);
  let ty = Math.floor(a.y);
  const endX = Math.floor(b.x);
  const endY = Math.floor(b.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? tx + 1 : tx) - a.x) / dx;
  let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? ty + 1 : ty) - a.y) / dy;
  let t0 = 0;
  for (let guard = 0; guard < 100_000; guard++) {
    const done = tx === endX && ty === endY;
    const t1 = done ? 1 : Math.min(tMaxX, tMaxY, 1);
    if (t1 > t0 || done) out.push({ tx, ty, t0, t1 });
    if (done || t1 >= 1) break;
    if (tMaxX < tMaxY) {
      tx += stepX;
      tMaxX += tDeltaX;
    } else {
      ty += stepY;
      tMaxY += tDeltaY;
    }
    t0 = t1;
  }
  return out;
}
