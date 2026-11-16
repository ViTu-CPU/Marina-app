/**
 * Fetch from the map by OpenStreetMap water polygons in vector tiles (DECISIONS I113): rays from the
 * position every few degrees, each ending where it first leaves the water. The water is the
 * `ocean` layer (the sea, from the OSM coastline) and the `water_polygons` layer (lakes, rivers,
 * reservoirs, docks, canals; not glaciers) of the Shortbread schema (shortbread-tiles.org/schema/1.0,
 * read 2026-11-16), served by the VersaTiles demo server.
 *
 * VersaTiles (docs.versatiles.org/guides/use_tiles_versatiles_org.html, read 2026-11-16): *"You can
 * access tiles directly via the URL pattern https://tiles.versatiles.org/tiles/<tileset>/{z}/{x}/{y}"*;
 * free and open to everyone without guarantees; *"Requests are rate-limited per IP address. The limit
 * is far above what normal map use needs; requests beyond it are answered with 429 Too Many Requests
 * and a Retry-After header."* Attribution for the OSM tileset: © OpenStreetMap contributors (ODbL);
 * the Shortbread schema is CC-0. Answers carry `access-control-allow-origin: *`.
 */
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { RAY_STEP_DEG, sectorFetches, type SectorFetch } from '../engine/fetchRays';
import { firstLand, tilesAlong, type TilePolygon, type WaterTile } from '../engine/waterRays';
import { tangentPlane } from './overpass';

export const VT_TILE_URL = 'https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}';
export const VT_SOURCE = 'OpenStreetMap water areas (VersaTiles vector tiles, tiles.versatiles.org), © OpenStreetMap contributors, ODbL';
/** Tiles fetched at once (I113; OpenFreeMap's terms allow 4 parallel requests for offline downloads, used here as a polite limit). */
export const TILE_CONCURRENCY = 4;
/**
 * Zoom level by distance from the position (I113): z14 (tiles about 1.2 km at 60° N, the most
 * detailed) near the site, coarser farther out so that a 20 km lookup needs tens of tiles, not
 * hundreds. Coarser tiles may drop small islands, which makes a far fetch longer (on the safe side
 * for wave heights). Assumption.
 */
export const ZOOM_BANDS: readonly { until: number; z: number }[] = [
  { until: 2000, z: 14 },
  { until: 5000, z: 13 },
  { until: 12000, z: 12 },
  { until: Infinity, z: 11 },
];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Web Mercator position in tiles at zoom z (e.g. x = 9324.67 means 67 % across tile 9324). */
export function toTiles(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.asinh(Math.tan(rad(lat))) / Math.PI) / 2) * n };
}
export function fromTiles(x: number, y: number, z: number): { lat: number; lon: number } {
  const n = 2 ** z;
  return { lat: deg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)))), lon: (x / n) * 360 - 180 };
}

/** The water polygons of a vector tile, in tile-local coordinates 0…1. */
export function decodeWaterTile(data: ArrayBuffer | Uint8Array): WaterTile {
  const tile = new VectorTile(new PbfReader(data instanceof Uint8Array ? data : new Uint8Array(data)));
  const polygons: TilePolygon[] = [];
  for (const name of ['ocean', 'water_polygons']) {
    const layer = tile.layers[name];
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 3 || f.properties.kind === 'glacier') continue;
      polygons.push(f.loadGeometry().map((ring) => ring.map((p) => ({ x: p.x / layer.extent, y: p.y / layer.extent }))));
    }
  }
  return { polygons };
}

export type TileLoader = (z: number, x: number, y: number, signal?: AbortSignal) => Promise<WaterTile>;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('aborted', 'AbortError'));
    });
  });

/**
 * One tile from the VersaTiles server. 404 = a tile without features = no water (the server: *"A
 * tile that does not exist is answered with 404"*). After 429 it waits Retry-After (at most 30 s)
 * and tries again, three times at most.
 */
export function versatilesLoader(fetchImpl: typeof fetch = fetch): TileLoader {
  return async (z, x, y, signal) => {
    const url = VT_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
    for (let attempt = 0; ; attempt++) {
      const r = await fetchImpl(url, signal ? { signal } : {});
      if (r.status === 404) return { polygons: [] };
      if (r.status === 429 && attempt < 3) {
        const header = Number(r.headers.get('retry-after') ?? NaN);
        const wait = Number.isFinite(header) && header >= 0 ? Math.min(30, header) : 5;
        await sleep(wait * 1000, signal);
        continue;
      }
      if (!r.ok) throw new Error(`tiles.versatiles.org answered ${r.status} for tile ${z}/${x}/${y}`);
      return decodeWaterTile(await r.arrayBuffer());
    }
  };
}

/** The position is on land in the map data: the rays need a start in the water (I113). */
export class SiteOnLandError extends Error {
  constructor() {
    super('the position is on land in the map data; move it into the water (the centre of the site, or an entered position, must be in the water)');
    this.name = 'SiteOnLandError';
  }
}

export interface WaterFetchLookup {
  distances: number[];
  sectors: SectorFetch[];
  /** Rays that met a shore within the radius. */
  hits: number;
  /** Map tiles read. */
  tiles: number;
}

/**
 * The distance along each ray (bearings 0, step, … clockwise from north) from (lat, lon) to the first
 * point that is not water, at most `radius`; and the fetch of every sector (longest ray, I94).
 * Distances are measured in the plane tangent at the position (as I94). Throws SiteOnLandError when
 * the position itself is not in the water.
 */
export async function lookupWaterFetch(
  lat: number,
  lon: number,
  radius: number,
  options: { loadTile?: TileLoader; signal?: AbortSignal; stepDeg?: number; onProgress?: (tiles: number) => void; concurrency?: number } = {},
): Promise<WaterFetchLookup> {
  const load = options.loadTile ?? versatilesLoader();
  const stepDeg = options.stepDeg ?? RAY_STEP_DEG;
  const plane = tangentPlane(lat, lon);
  const cache = new Map<string, Promise<WaterTile>>();
  let loaded = 0;
  let running = 0;
  const queue: (() => void)[] = [];
  const limit = options.concurrency ?? TILE_CONCURRENCY;
  const tile = (z: number, x: number, y: number): Promise<WaterTile> => {
    const key = `${z}/${x}/${y}`;
    let p = cache.get(key);
    if (!p) {
      p = (async () => {
        if (running >= limit) await new Promise<void>((resolve) => queue.push(resolve));
        running++;
        try {
          const t = await load(z, x, y, options.signal);
          loaded++;
          options.onProgress?.(loaded);
          return t;
        } finally {
          running--;
          queue.shift()?.();
        }
      })();
      cache.set(key, p);
    }
    return p;
  };

  const ray = async (bearing: number): Promise<number> => {
    const dir = { x: Math.sin(rad(bearing)), y: Math.cos(rad(bearing)) };
    let from = 0;
    for (const band of ZOOM_BANDS) {
      if (from >= radius) break;
      const to = Math.min(band.until, radius);
      const p0 = plane.toLatLon({ x: dir.x * from, y: dir.y * from });
      const p1 = plane.toLatLon({ x: dir.x * to, y: dir.y * to });
      const a = toTiles(p0.lat, p0.lon, band.z);
      const b = toTiles(p1.lat, p1.lon, band.z);
      for (const piece of tilesAlong(a, b)) {
        options.signal?.throwIfAborted();
        const water = await tile(band.z, piece.tx, piece.ty);
        const local = (t: number) => ({ x: a.x + (b.x - a.x) * t - piece.tx, y: a.y + (b.y - a.y) * t - piece.ty });
        const hit = firstLand(water, local(piece.t0), local(piece.t1));
        if (hit.startsOnLand && from === 0 && piece.t0 === 0) throw new SiteOnLandError();
        if (hit.t !== null) {
          const s = piece.t0 + (piece.t1 - piece.t0) * hit.t;
          const g = fromTiles(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, band.z);
          const m = plane.toLocal(g.lat, g.lon);
          return Math.min(radius, Math.hypot(m.x, m.y));
        }
      }
      from = to;
    }
    return radius;
  };

  const bearings = Array.from({ length: Math.round(360 / stepDeg) }, (_, i) => i * stepDeg);
  const distances = await Promise.all(bearings.map(ray));
  return {
    distances,
    sectors: sectorFetches(distances, radius, stepDeg),
    hits: distances.filter((d) => d < radius).length,
    tiles: loaded,
  };
}
