import { describe, expect, it } from 'vitest';
import type { WaterTile } from '../../engine/waterRays';
import { tangentPlane } from '../overpass';
import { decodeWaterTile, fromTiles, lookupWaterFetch, SiteOnLandError, toTiles, versatilesLoader, VT_TILE_URL, ZOOM_BANDS, type TileLoader } from '../vectorTiles';
import { encodeTile } from './mvtEncode';

// A test position (Helsinki) with a lake of 2 × 4 km around it; the rest of the world is land.
const LAT = 60.15;
const LON = 24.95;
const LAKE = { south: 60.14, north: 60.16, west: 24.92, east: 24.99 };

/** Tiles of a world that is land except for the LAKE rectangle (and, optionally, an island in it). */
function lakeWorld(island?: typeof LAKE): { load: TileLoader; asked: string[] } {
  const asked: string[] = [];
  const rect = (r: typeof LAKE, z: number, x: number, y: number) => {
    const sw = toTiles(r.south, r.west, z);
    const ne = toTiles(r.north, r.east, z);
    const clamp = (v: number) => Math.max(-0.05, Math.min(1.05, v));
    const x0 = clamp(sw.x - x);
    const x1 = clamp(ne.x - x);
    const y0 = clamp(ne.y - y);
    const y1 = clamp(sw.y - y);
    if (x1 <= x0 || y1 <= y0) return null;
    return [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
  };
  const load: TileLoader = async (z, x, y) => {
    asked.push(`${z}/${x}/${y}`);
    const outer = rect(LAKE, z, x, y);
    if (!outer) return { polygons: [] };
    const hole = island ? rect(island, z, x, y) : null;
    return { polygons: [hole ? [outer, hole] : [outer]] } satisfies WaterTile;
  };
  return { load, asked };
}

describe('Web Mercator tiles (I113)', () => {
  it('position in tiles and back; the owner’s position lies in tile 14/9324/4743', () => {
    const t = toTiles(60.15675259478073, 24.8878111390905, 14);
    expect([Math.floor(t.x), Math.floor(t.y)]).toEqual([9324, 4743]);
    const back = fromTiles(t.x, t.y, 14);
    expect(back.lat).toBeCloseTo(60.15675259478073, 10);
    expect(back.lon).toBeCloseTo(24.8878111390905, 10);
  });

  it('zoom bands: detailed near the site, coarser farther out', () => {
    expect(ZOOM_BANDS.map((b) => b.z)).toEqual([14, 13, 12, 11]);
  });
});

describe('water polygons from a vector tile (I113)', () => {
  it('ocean and water_polygons are water, glaciers and other layers are not; coordinates 0…1 across the tile', () => {
    const data = encodeTile({
      ocean: [{ rings: [[[2048, 0], [4096, 0], [4096, 4096], [2048, 4096], [2048, 0]]] }],
      water_polygons: [
        { rings: [[[0, 0], [1024, 0], [1024, 1024], [0, 1024], [0, 0]]], properties: { kind: 'water' } },
        { rings: [[[0, 2048], [1024, 2048], [1024, 3072], [0, 3072], [0, 2048]]], properties: { kind: 'glacier' } },
      ],
      land: [{ rings: [[[0, 0], [4096, 0], [4096, 4096], [0, 4096], [0, 0]]], properties: { kind: 'forest' } }],
    });
    const tile = decodeWaterTile(data);
    expect(tile.polygons).toHaveLength(2);
    expect(tile.polygons[0]![0]![0]).toEqual({ x: 0.5, y: 0 });
    expect(tile.polygons[1]![0]![2]).toEqual({ x: 0.25, y: 0.25 });
  });
});

describe('fetch from water polygons (I113)', () => {
  const plane = tangentPlane(LAT, LON);
  const north = plane.toLocal(LAKE.north, LON).y;
  const east = plane.toLocal(LAT, LAKE.east).x;
  const west = -plane.toLocal(LAT, LAKE.west).x;
  const south = -plane.toLocal(LAKE.south, LON).y;

  it('each ray ends at the first land; sectors from the longest rays; tiles read once each', async () => {
    const world = lakeWorld();
    const progress: number[] = [];
    const r = await lookupWaterFetch(LAT, LON, 20000, { loadTile: world.load, onProgress: (n) => progress.push(n) });
    expect(r.distances).toHaveLength(72);
    // The lake edges are parallels and meridians: lines of constant y and x in Mercator. In the tangent
    // plane they bend very slightly; the rays meet them within a metre of the plane distances.
    expect(r.distances[0]).toBeCloseTo(north, -0.3);
    expect(r.distances[18]).toBeCloseTo(east, -0.3);
    expect(r.distances[36]).toBeCloseTo(south, -0.3);
    expect(r.distances[54]).toBeCloseTo(west, -0.3);
    expect(r.hits).toBe(72);
    expect(new Set(world.asked).size).toBe(world.asked.length);
    expect(r.tiles).toBe(world.asked.length);
    expect(progress.at(-1)).toBe(r.tiles);
    // The lake is about 2 × 4 km: the rays need z14 tiles (to 2 km) and z13 tiles (to 5 km) only.
    expect(new Set(world.asked.map((k) => k.split('/')[0]))).toEqual(new Set(['14', '13']));
    // E sector: rays 70°–110°; the longest reaches a corner region of the lake.
    expect(r.sectors[2]!.fetch).toBeGreaterThan(east);
    expect(r.sectors.every((s) => !s.open)).toBe(true);
  });

  it('an island stops the rays that meet it; a radius shorter than the shore leaves rays open', async () => {
    const island = { south: 60.153, north: 60.155, west: 24.949, east: 24.951 };
    const r = await lookupWaterFetch(LAT, LON, 20000, { loadTile: lakeWorld(island).load });
    expect(r.distances[0]).toBeCloseTo(plane.toLocal(island.south, LON).y, -0.3);
    expect(r.distances[18]).toBeCloseTo(east, -0.3);
    const short = await lookupWaterFetch(LAT, LON, 500, { loadTile: lakeWorld().load });
    expect(short.distances.every((d) => d === 500)).toBe(true);
    expect(short.hits).toBe(0);
    expect(short.sectors.every((s) => s.open)).toBe(true);
  });

  it('a position on land is an error, not a fetch', async () => {
    await expect(lookupWaterFetch(60.2, LON, 5000, { loadTile: lakeWorld().load })).rejects.toThrow(SiteOnLandError);
    await expect(lookupWaterFetch(60.2, LON, 5000, { loadTile: lakeWorld().load })).rejects.toThrow(/on land in the map data/);
  });

  it('never more tiles in flight than the limit; cancelling stops the lookup', async () => {
    let inFlight = 0;
    let most = 0;
    const world = lakeWorld();
    const slow: TileLoader = async (z, x, y) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight--;
      return world.load(z, x, y);
    };
    await lookupWaterFetch(LAT, LON, 20000, { loadTile: slow, concurrency: 2 });
    expect(most).toBe(2);
    const user = new AbortController();
    const never: TileLoader = (_z, _x, _y, signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(signal.reason)));
    const pending = lookupWaterFetch(LAT, LON, 20000, { loadTile: never, signal: user.signal });
    user.abort();
    await expect(pending).rejects.toThrow();
  });
});

describe('tiles from the VersaTiles server (I113)', () => {
  const tile = encodeTile({ ocean: [{ rings: [[[0, 0], [4096, 0], [4096, 4096], [0, 4096], [0, 0]]] }] });

  it('URL by the documented pattern; 404 = no water; 429 waits Retry-After and tries again; other errors say which tile', async () => {
    expect(VT_TILE_URL).toBe('https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}');
    const urls: string[] = [];
    const answers = [new Response(null, { status: 429, headers: { 'retry-after': '0' } }), new Response(tile.slice().buffer as ArrayBuffer, { status: 200 })];
    const load = versatilesLoader((async (url: string) => {
      urls.push(url);
      return answers.shift()!;
    }) as typeof fetch);
    const t = await load(14, 9324, 4743);
    expect(urls).toEqual(['https://tiles.versatiles.org/tiles/osm/14/9324/4743', 'https://tiles.versatiles.org/tiles/osm/14/9324/4743']);
    expect(t.polygons).toHaveLength(1);
    const missing = versatilesLoader((async () => new Response(null, { status: 404 })) as unknown as typeof fetch);
    expect(await missing(14, 1, 2)).toEqual({ polygons: [] });
    const broken = versatilesLoader((async () => new Response(null, { status: 500 })) as unknown as typeof fetch);
    await expect(broken(13, 4662, 2371)).rejects.toThrow('tiles.versatiles.org answered 500 for tile 13/4662/2371');
  });
});
