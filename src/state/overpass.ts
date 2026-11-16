/**
 * Shorelines from OpenStreetMap for the automatic fetch (DECISIONS D47, I94): the Overpass API
 * returns the water areas (lakes, rivers, reservoirs) and the sea coastline that the rays from the
 * site cross; a boundary shared by two water areas (e.g. two named basins of one lake) is not a
 * shore and is dropped. Data © OpenStreetMap contributors, ODbL.
 *
 * Overpass API usage (https://dev.overpass-api.de/overpass-doc/en/preface/commons.html and the
 * OSM wiki "Overpass API", read 2026-11-15): free for moderate use, about 10 000 queries and 1 GB
 * a day; one query per lookup here.
 */
import { castRays, RAY_STEP_DEG, sectorFetches, type SectorFetch } from '../engine/fetchRays';
import type { Segment, Vec2 } from '../engine/model';
import { WGS84_A, WGS84_E2 } from './geo';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OSM_SOURCE = 'OpenStreetMap (Overpass API), © OpenStreetMap contributors, ODbL';

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

/**
 * Shore segments in local metres around the site: every segment of a coastline way or of a water
 * area's boundary that bounds exactly one water feature (a coastline, a water area way, or a water
 * relation). Segments bounding two features (the same nodes in both) separate water from water.
 */
export function shoreSegments(response: OverpassResponse, lat0: number, lon0: number): Segment[] {
  const plane = tangentPlane(lat0, lon0);
  const elements = response.elements ?? [];
  const parents = new Map<number, number[]>();
  for (const e of elements) {
    if (e.type !== 'relation') continue;
    for (const m of (e as OsmRelation).members ?? []) {
      if (m.type !== 'way') continue;
      parents.set(m.ref, [...(parents.get(m.ref) ?? []), e.id]);
    }
  }
  const key = (p: { lat: number; lon: number }) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const features = new Map<string, { a: { lat: number; lon: number }; b: { lat: number; lon: number }; of: Set<string> }>();
  for (const e of elements) {
    if (e.type !== 'way') continue;
    const way = e as OsmWay;
    const geometry = way.geometry ?? [];
    const of: string[] = (parents.get(way.id) ?? []).map((r) => `r${r}`);
    const closed = geometry.length > 3 && geometry[0] && geometry[geometry.length - 1] && key(geometry[0]) === key(geometry[geometry.length - 1]!);
    if (way.tags?.natural === 'coastline') of.push('coast');
    else if (isWaterArea(way.tags) && closed) of.push(`w${way.id}`);
    if (of.length === 0) continue;
    for (let i = 1; i < geometry.length; i++) {
      const a = geometry[i - 1];
      const b = geometry[i];
      if (!a || !b) continue;
      const ka = key(a);
      const kb = key(b);
      if (ka === kb) continue;
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const entry = features.get(k) ?? { a, b, of: new Set<string>() };
      of.forEach((f) => entry.of.add(f));
      features.set(k, entry);
    }
  }
  const out: Segment[] = [];
  for (const { a, b, of } of features.values()) {
    if (of.size === 1) out.push({ a: plane.toLocal(a.lat, a.lon), b: plane.toLocal(b.lat, b.lon) });
  }
  return out;
}

export interface FetchLookup {
  distances: number[];
  sectors: SectorFetch[];
  segments: number;
}

/** Rays and sector fetches for the site from an Overpass answer. */
export function fetchFromResponse(response: OverpassResponse, lat: number, lon: number, radius: number, stepDeg = RAY_STEP_DEG): FetchLookup {
  const segments = shoreSegments(response, lat, lon);
  const distances = castRays(segments, radius, stepDeg);
  return { distances, sectors: sectorFetches(distances, radius, stepDeg), segments: segments.length };
}

/** Looks the shoreline up around (lat, lon) and measures the fetch of every sector. Throws with the server's reason. */
export async function lookupFetch(lat: number, lon: number, radius: number, options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {}): Promise<FetchLookup> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: fetchQuery(lat, lon, radius) }).toString(),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!response.ok) throw new Error(`Overpass API answered ${response.status}${response.status === 429 ? ' (too many requests; try again in a minute)' : ''}`);
  const body = (await response.json()) as OverpassResponse;
  if (body.remark && /error|timed out|runtime/i.test(body.remark)) throw new Error(body.remark);
  return fetchFromResponse(body, lat, lon, radius);
}
