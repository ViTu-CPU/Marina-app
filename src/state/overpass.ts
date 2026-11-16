/**
 * Shorelines from OpenStreetMap for the automatic fetch (DECISIONS D47, I94, I112): the Overpass API
 * returns the water areas (lakes, rivers, reservoirs) and the sea coastline that the rays from the
 * site cross; a boundary shared by two water areas (e.g. two named basins of one lake) is not a
 * shore and is dropped, the sea coastline always is one. Data © OpenStreetMap contributors, ODbL.
 *
 * Overpass API usage (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html and the
 * OSM wiki "Overpass API", read 2026-11-15 and 2026-11-16): free for moderate use, about 10 000
 * queries and 1 GB a day on the main instance, which the wiki now calls overloaded (*"do not expect
 * high reliability. Use alternatives if possible"*); overpass.private.coffee (formerly
 * overpass.kumi.systems): *"Feel free to use our service in any project, there is no rate limit in
 * place."* One query per lookup; the next server only when the previous one fails (I112).
 */
import { castRays, RAY_STEP_DEG, sectorFetches, type SectorFetch } from '../engine/fetchRays';
import type { Segment, Vec2 } from '../engine/model';
import { WGS84_A, WGS84_E2 } from './geo';

/** Overpass instances tried in this order (I112): the next only when the previous one fails. */
export const OVERPASS_URLS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'] as const;
/** The source line kept with the project: which Overpass instance answered. */
export const osmSource = (server: string): string => `OpenStreetMap (Overpass API, ${new URL(server).host}), © OpenStreetMap contributors, ODbL`;

const rad = (d: number): number => (d * Math.PI) / 180;

/**
 * Local metres around (lat0, lon0) on the WGS 84 ellipsoid (east = x, north = y): the radii of
 * curvature at the site, i.e. an equirectangular plane tangent at the site. Over 50 km the error
 * is well under 0.1 %.
 */
export function tangentPlane(lat0: number, lon0: number): { toLocal: (lat: number, lon: number) => Vec2; toLatLon: (p: Vec2) => { lat: number; lon: number } } {
  const s = Math.sin(rad(lat0));
  const w = Math.sqrt(1 - WGS84_E2 * s * s);
  const n = WGS84_A / w;
  const m = (WGS84_A * (1 - WGS84_E2)) / w ** 3;
  const kx = rad(1) * n * Math.cos(rad(lat0));
  const ky = rad(1) * m;
  return {
    toLocal: (lat, lon) => ({ x: (lon - lon0) * kx, y: (lat - lat0) * ky }),
    toLatLon: (p) => ({ lat: lat0 + p.y / ky, lon: lon0 + p.x / kx }),
  };
}

/** The Overpass QL query for the water areas and coastline that the rays cross. */
export function fetchQuery(lat: number, lon: number, radius: number, stepDeg = RAY_STEP_DEG): string {
  const plane = tangentPlane(lat, lon);
  const coords: string[] = [];
  const centre = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  for (let b = 0; b < 360; b += stepDeg) {
    const end = plane.toLatLon({ x: radius * Math.sin(rad(b)), y: radius * Math.cos(rad(b)) });
    coords.push(centre, `${end.lat.toFixed(6)},${end.lon.toFixed(6)}`);
  }
  coords.push(centre);
  const near = `around:2,${coords.join(',')}`;
  return [
    '[out:json][timeout:120];',
    `way(${near})->.near;`,
    '(way.near[natural=coastline];way.near[natural=water];way.near[waterway=riverbank];way.near[landuse=reservoir];)->.tagged;',
    '(rel(bw.near)[natural=water];rel(bw.near)[waterway=riverbank];rel(bw.near)[landuse=reservoir];)->.rels;',
    'way.near(r.rels)->.members;',
    '(.tagged;.members;)->.ways;',
    '.ways out geom;',
    '.rels out skel;',
  ].join('');
}

interface OsmWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: ({ lat: number; lon: number } | null)[];
}
interface OsmRelation {
  type: 'relation';
  id: number;
  members?: { type: string; ref: number; role?: string }[];
}
export interface OverpassResponse {
  elements?: (OsmWay | OsmRelation | { type: string; id: number })[];
  remark?: string;
}

const isWaterArea = (tags: Record<string, string> | undefined): boolean =>
  tags?.natural === 'water' || tags?.waterway === 'riverbank' || tags?.landuse === 'reservoir';

/** What an Overpass answer held, for the diagnosis when no shore is found (I112). */
export interface ShoreStats {
  /** Ways in the answer (coastline, water-area ways and members of water relations). */
  ways: number;
  /** Water relations (multipolygons) in the answer. */
  relations: number;
  /** Segments kept as shore. */
  shore: number;
  /** Segments dropped because they bound two water areas (water on both sides). */
  waterWater: number;
}

/**
 * Shore segments in local metres around the site: every segment of a coastline way, and every
 * segment of a water area's boundary that bounds exactly one water feature (a water area way or a
 * water relation). Segments bounding two features (the same nodes in both) separate water from
 * water. The coastline is always a shore (land on its left, water on its right; OSM wiki
 * "Tag:natural=coastline"), also where a water area (a bay, a lagoon) is drawn against it (I112).
 */
export function shoreAnalysis(response: OverpassResponse, lat0: number, lon0: number): { segments: Segment[]; stats: ShoreStats } {
  const plane = tangentPlane(lat0, lon0);
  const elements = response.elements ?? [];
  const parents = new Map<number, number[]>();
  let relations = 0;
  let ways = 0;
  for (const e of elements) {
    if (e.type !== 'relation') continue;
    relations++;
    for (const m of (e as OsmRelation).members ?? []) {
      if (m.type !== 'way') continue;
      parents.set(m.ref, [...(parents.get(m.ref) ?? []), e.id]);
    }
  }
  const key = (p: { lat: number; lon: number }) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const features = new Map<string, { a: { lat: number; lon: number }; b: { lat: number; lon: number }; of: Set<string>; coast: boolean }>();
  for (const e of elements) {
    if (e.type !== 'way') continue;
    ways++;
    const way = e as OsmWay;
    const geometry = way.geometry ?? [];
    const of: string[] = (parents.get(way.id) ?? []).map((r) => `r${r}`);
    const closed = geometry.length > 3 && geometry[0] && geometry[geometry.length - 1] && key(geometry[0]) === key(geometry[geometry.length - 1]!);
    const coast = way.tags?.natural === 'coastline';
    if (!coast && isWaterArea(way.tags) && closed) of.push(`w${way.id}`);
    if (of.length === 0 && !coast) continue;
    for (let i = 1; i < geometry.length; i++) {
      const a = geometry[i - 1];
      const b = geometry[i];
      if (!a || !b) continue;
      const ka = key(a);
      const kb = key(b);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const entry = features.get(k) ?? { a, b, of: new Set<string>(), coast: false };
      of.forEach((f) => entry.of.add(f));
      entry.coast ||= coast;
      features.set(k, entry);
    }
  }
  const segments: Segment[] = [];
  let waterWater = 0;
  for (const { a, b, of, coast } of features.values()) {
    if (coast || of.size === 1) segments.push({ a: plane.toLocal(a.lat, a.lon), b: plane.toLocal(b.lat, b.lon) });
    else if (of.size > 1) waterWater++;
  }
  return { segments, stats: { ways, relations, shore: segments.length, waterWater } };
}

/** Shore segments in local metres around the site (see shoreAnalysis). */
export function shoreSegments(response: OverpassResponse, lat0: number, lon0: number): Segment[] {
  return shoreAnalysis(response, lat0, lon0).segments;
}

export interface FetchLookup {
  distances: number[];
  sectors: SectorFetch[];
  segments: number;
  /** Rays that met a shore within the radius. */
  hits: number;
  stats: ShoreStats;
  /** The Overpass instance that answered (set by lookupFetch). */
  server?: string;
}

/** Rays and sector fetches for the site from an Overpass answer. */
export function fetchFromResponse(response: OverpassResponse, lat: number, lon: number, radius: number, stepDeg = RAY_STEP_DEG): FetchLookup {
  const { segments, stats } = shoreAnalysis(response, lat, lon);
  const distances = castRays(segments, radius, stepDeg);
  const hits = distances.filter((d) => d < radius).length;
  return { distances, sectors: sectorFetches(distances, radius, stepDeg), segments: segments.length, hits, stats };
}

/**
 * The answer held no shore in any direction within the radius (I112). A marina lies at a shore, so
 * this means the map data did not arrive as expected, not that the water is open all round; the
 * caller keeps the fetches it had.
 */
export class NoShoreError extends Error {
  constructor(
    readonly radius: number,
    readonly stats: ShoreStats,
  ) {
    super(
      `no shore in any direction within ${Math.round(radius / 100) / 10} km; the answer held ${stats.ways} ways, ${stats.relations} water areas (relations), ` +
        `${stats.shore} shore segments and ${stats.waterWater} segments between two water areas`,
    );
    this.name = 'NoShoreError';
  }
}

async function queryServer(server: string, lat: number, lon: number, radius: number, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<FetchLookup> {
  const response = await fetchImpl(server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: fetchQuery(lat, lon, radius) }).toString(),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`answered ${response.status}${response.status === 429 ? ' (too many requests; try again in a minute)' : ''}`);
  const body = (await response.json()) as OverpassResponse;
  if (body.remark && /error|timed out|runtime/i.test(body.remark)) throw new Error(body.remark);
  const r = fetchFromResponse(body, lat, lon, radius);
  if (r.hits === 0) throw new NoShoreError(radius, r.stats);
  return { ...r, server };
}

/**
 * Looks the shoreline up around (lat, lon) and measures the fetch of every sector. The Overpass
 * instances are tried in turn (OVERPASS_URLS) until one answers with a shore; when none does, the
 * error names every server and its reason (I112), e.g. "no shore in any direction" (NoShoreError).
 */
export async function lookupFetch(
  lat: number,
  lon: number,
  radius: number,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; servers?: readonly string[] } = {},
): Promise<FetchLookup> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const failures: string[] = [];
  for (const server of options.servers ?? OVERPASS_URLS) {
    try {
      return await queryServer(server, lat, lon, radius, fetchImpl, options.signal);
    } catch (e) {
      if (options.signal?.aborted) throw e;
      failures.push(`${new URL(server).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(failures.join('; '));
}
