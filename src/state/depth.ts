/**
 * Mean depth along the wave fetches (DECISIONS I110; AS 3962-2001 2.3.2.2: "average depths along
 * each of the major fetch directions"):
 *  - Sea: EMODnet Bathymetry REST service `depth_profile` (1 000 samples along a line, metres, negative
 *    under water, positive on land; in Finnish waters from the FINCHART survey data). Response checked
 *    2026-11-16; sends access-control-allow-origin. EMODnet data: CC BY 4.0.
 *  - Lakes: SYKE's INSPIRE elevation WFS (paikkatiedot.ymparisto.fi/geoserver/inspire_el), feature type
 *    EL.Syvyysalue: depth zones of the surveyed lakes in ETRS-TM35FIN with the depth band as text
 *    (`syvyysvali_m`, e.g. "0-1,5", "1,5-3", "3-6"; "Saari" = island). Not every lake is surveyed.
 *    Licence CC BY 4.0 (SYKE); sends access-control-allow-origin: *.
 * The depths refer to each source's own datum (chart datum at sea, the lake's reference level).
 */
import { DEFAULT_SITE_DEPTH } from '../engine/defaults';
import type { SectorFetch } from '../engine/fetchRays';
import { tangentPlane } from './overpass';
import { toTm35fin } from './waterLevels';

export const EMODNET_PROFILE = 'https://rest.emodnet-bathymetry.eu/depth_profile';
export const SYKE_EL_WFS = 'https://paikkatiedot.ymparisto.fi/geoserver/inspire_el/wfs';
export const DEPTH_SOURCES = {
  emodnet: 'EMODnet Bathymetry DTM (rest.emodnet-bathymetry.eu), CC BY 4.0',
  syke: 'SYKE, depth zones of lakes (EL.Syvyysalue), CC BY 4.0',
} as const;
/** A ray counts only when at least this share of its samples has a depth (Assumption). */
export const MIN_DEPTH_COVERAGE = 0.5;
/** Samples along a ray for the lake depth zones. */
const LAKE_SAMPLES = 200;

export type DepthSource = keyof typeof DEPTH_SOURCES;
export interface RayDepth {
  /** Mean depth of the samples that have one, m. */
  depth: number;
  source: DepthSource;
  /** Share of the ray's samples with a depth (0–1). */
  coverage: number;
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function get(url: string, o: FetchOptions): Promise<Response> {
  const r = await (o.fetchImpl ?? fetch)(url, o.signal ? { signal: o.signal } : {});
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** End of a ray of `length` m on `bearing` from (lat, lon). */
export function rayEnd(lat: number, lon: number, bearing: number, length: number): { lat: number; lon: number } {
  return tangentPlane(lat, lon).toLatLon({ x: length * Math.sin(rad(bearing)), y: length * Math.cos(rad(bearing)) });
}

/** Sea: mean of the samples under water (negative values) and their share; null below the coverage limit. */
export function seaMeanDepth(values: readonly (number | null)[]): RayDepth | null {
  if (values.length === 0) return null;
  const water = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v < 0);
  const coverage = water.length / values.length;
  if (coverage < MIN_DEPTH_COVERAGE) return null;
  return { depth: -water.reduce((a, b) => a + b, 0) / water.length, source: 'emodnet', coverage };
}

export const emodnetProfileUrl = (from: { lat: number; lon: number }, to: { lat: number; lon: number }): string =>
  `${EMODNET_PROFILE}?geom=${encodeURIComponent(`LINESTRING(${from.lon.toFixed(5)} ${from.lat.toFixed(5)},${to.lon.toFixed(5)} ${to.lat.toFixed(5)})`)}`;

/** A lake depth zone: its depth band (m) and polygons (rings in TM35FIN, [easting, northing]). */
export interface DepthZone {
  band: [number, number] | null;
  polygons: [number, number][][][];
}

/** "0-1,5" → [0, 1.5]; "20" or ">20" → [20, 20]; "Saari" (island) or anything else → null. */
export function parseBand(text: string): [number, number] | null {
  const nums = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(',', '.')));
  if (nums.length >= 2) return [nums[0]!, nums[1]!];
  if (nums.length === 1) return [nums[0]!, nums[0]!];
  return null;
}

interface ZoneFeature {
  properties?: { syvyysvali_m?: string };
  geometry?: { type: string; coordinates: unknown } | null;
}

export function parseZones(json: { features?: ZoneFeature[] }): DepthZone[] {
  const out: DepthZone[] = [];
  for (const f of json.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const polygons = g.type === 'Polygon' ? [g.coordinates as [number, number][][]] : g.type === 'MultiPolygon' ? (g.coordinates as [number, number][][][]) : [];
    if (polygons.length === 0) continue;
    out.push({ band: parseBand(f.properties?.syvyysvali_m ?? ''), polygons });
  }
  return out;
}

const inRing = (x: number, y: number, ring: readonly [number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** The zone a TM35FIN point lies in (outer ring, not in a hole), or null. */
function zoneAt(e: number, n: number, zones: readonly DepthZone[]): DepthZone | null {
  for (const z of zones) {
    for (const polygon of z.polygons) {
      if (polygon[0] && inRing(e, n, polygon[0]) && !polygon.slice(1).some((hole) => inRing(e, n, hole))) return z;
    }
  }
  return null;
}

/** Depth-band midpoints at `LAKE_SAMPLES` points along a ray (TM35FIN; islands and points outside the zones left out). */
function lakeSamples(lat: number, lon: number, bearing: number, length: number, zones: readonly DepthZone[]): number[] {
  const start = toTm35fin(lat, lon);
  const depths: number[] = [];
  for (let i = 0; i < LAKE_SAMPLES; i++) {
    const s = ((i + 0.5) / LAKE_SAMPLES) * length;
    const z = zoneAt(start.e + s * Math.sin(rad(bearing)), start.n + s * Math.cos(rad(bearing)), zones);
    if (z?.band) depths.push((z.band[0] + z.band[1]) / 2);
  }
  return depths;
}

/**
 * Lake: mean of the depth-band midpoints at `LAKE_SAMPLES` points along the ray (in TM35FIN; grid
 * north is taken as north, a few degrees off away from 27° E) and their share; islands and points
 * outside the zones have no depth. Null below the coverage limit.
 */
export function lakeMeanDepth(lat: number, lon: number, bearing: number, length: number, zones: readonly DepthZone[]): RayDepth | null {
  const depths = lakeSamples(lat, lon, bearing, length, zones);
  const coverage = depths.length / LAKE_SAMPLES;
  if (coverage < MIN_DEPTH_COVERAGE) return null;
  return { depth: depths.reduce((a, b) => a + b, 0) / depths.length, source: 'syke', coverage };
}

/** SYKE depth zones in a TM35FIN box around the rays. */
export function sykeZonesUrl(box: { minE: number; minN: number; maxE: number; maxN: number }): string {
  return `${SYKE_EL_WFS}?${new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: 'inspire_el:EL.Syvyysalue',
    outputFormat: 'application/json',
    propertyName: 'syvyysvali_m,geom',
    srsName: 'urn:ogc:def:crs:EPSG::3067',
    count: '20000',
    bbox: `${box.minE.toFixed(0)},${box.minN.toFixed(0)},${box.maxE.toFixed(0)},${box.maxN.toFixed(0)},urn:ogc:def:crs:EPSG::3067`,
  }).toString()}`;
}

/**
 * Mean depth along each sector's ray (its bearing and fetch): EMODnet at sea, else SYKE's lake depth
 * zones; null where neither covers the ray or the sector has no fetch.
 */
export async function lookupFetchDepths(lat: number, lon: number, rays: readonly Pick<SectorFetch, 'bearing' | 'fetch'>[], o: FetchOptions & { onProgress?: (done: number, total: number) => void } = {}): Promise<(RayDepth | null)[]> {
  const out: (RayDepth | null)[] = rays.map(() => null);
  const open = rays.map((r, k) => ({ ...r, k })).filter((r) => r.fetch > 0);
  let done = 0;
  for (const r of open) {
    const values = (await (await get(emodnetProfileUrl({ lat, lon }, rayEnd(lat, lon, r.bearing, r.fetch)), o)).json()) as (number | null)[];
    out[r.k] = seaMeanDepth(Array.isArray(values) ? values : []);
    o.onProgress?.(++done, open.length + 1);
  }
  const lake = open.filter((r) => out[r.k] === null);
  if (lake.length > 0) {
    const start = toTm35fin(lat, lon);
    const reach = Math.max(...lake.map((r) => r.fetch));
    const json = (await (await get(sykeZonesUrl({ minE: start.e - reach, minN: start.n - reach, maxE: start.e + reach, maxN: start.n + reach }), o)).json()) as { features?: ZoneFeature[] };
    const zones = parseZones(json);
    for (const r of lake) out[r.k] = lakeMeanDepth(lat, lon, r.bearing, r.fetch, zones);
  }
  o.onProgress?.(open.length + 1, open.length + 1);
  return out;
}

/** I121: bearings of the rays around the site position (the eight wave sectors). */
export const SITE_DEPTH_BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
/** I121: default length of the rays, m (Assumption, see DEFAULT_SITE_DEPTH). */
export const SITE_DEPTH_RADIUS = DEFAULT_SITE_DEPTH.radius;

export interface SiteDepth extends RayDepth {
  min: number;
  max: number;
}

/** Mean, extremes and share of the samples with a depth; null when none has one. */
function summary(depths: readonly number[], total: number, source: DepthSource): SiteDepth | null {
  if (depths.length === 0 || total === 0) return null;
  return { depth: depths.reduce((a, b) => a + b, 0) / depths.length, min: Math.min(...depths), max: Math.max(...depths), source, coverage: depths.length / total };
}

/**
 * I121: mean water depth around the site: the samples of eight rays of `radius` m from (lat, lon),
 * from EMODnet when at least `MIN_DEPTH_COVERAGE` of them are under water, else from SYKE's lake
 * depth zones when they cover that share. When neither does, the one with the larger share (the
 * share is shown with the result); null when neither has a depth.
 */
export async function lookupSiteDepth(lat: number, lon: number, radius: number, o: FetchOptions & { onProgress?: (done: number, total: number) => void } = {}): Promise<SiteDepth | null> {
  const steps = SITE_DEPTH_BEARINGS.length + 1;
  const sea: number[] = [];
  let seaTotal = 0;
  let done = 0;
  for (const bearing of SITE_DEPTH_BEARINGS) {
    const values = (await (await get(emodnetProfileUrl({ lat, lon }, rayEnd(lat, lon, bearing, radius)), o)).json()) as unknown;
    const list = Array.isArray(values) ? (values as unknown[]) : [];
    seaTotal += list.length;
    for (const v of list) if (typeof v === 'number' && Number.isFinite(v) && v < 0) sea.push(-v);
    o.onProgress?.(++done, steps);
  }
  const atSea = summary(sea, seaTotal, 'emodnet');
  if (atSea && atSea.coverage >= MIN_DEPTH_COVERAGE) {
    o.onProgress?.(steps, steps);
    return atSea;
  }
  const start = toTm35fin(lat, lon);
  const json = (await (await get(sykeZonesUrl({ minE: start.e - radius, minN: start.n - radius, maxE: start.e + radius, maxN: start.n + radius }), o)).json()) as { features?: ZoneFeature[] };
  const zones = parseZones(json);
  const lake = SITE_DEPTH_BEARINGS.flatMap((bearing) => lakeSamples(lat, lon, bearing, radius, zones));
  const inLake = summary(lake, LAKE_SAMPLES * SITE_DEPTH_BEARINGS.length, 'syke');
  o.onProgress?.(steps, steps);
  if (inLake && inLake.coverage >= MIN_DEPTH_COVERAGE) return inLake;
  const found = [atSea, inLake].filter((x): x is SiteDepth => x !== null).sort((a, b) => b.coverage - a.coverage);
  return found[0] ?? null;
}
