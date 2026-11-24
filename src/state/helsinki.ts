/**
 * City of Helsinki open map data (U34): base maps and the up-to-date detailed plan as WMS images in
 * the Web Mercator tile grid of the OpenStreetMap layer, and the areas of the detailed plans in force
 * (WFS) for choosing a plan area as the site.
 *
 * Service: https://kartta.hel.fi/ws/geoserver/avoindata/{wms,wfs} (GeoServer; GetCapabilities read
 * 2026-11-23: Fees NONE, AccessConstraints NONE, EPSG:3857 offered; answers carry
 * `access-control-allow-origin: *`, which the PNG export needs). Layers used:
 * `avoindata:Opaskartta_Helsinki`, `avoindata:Kantakartta`, `avoindata:Ortoilmakuva`,
 * `avoindata:Ajantasa_asemakaava` (WMS) and `avoindata:Kaavahakemisto_alue_kaava_voimassa` (WFS).
 *
 * Licence (hel.fi, "Avoimet paikkatiedot", read 2026-11-23): map and geodata by the City of
 * Helsinki, Urban Environment Division, City Survey Services, are licensed CC BY 4.0; suggested
 * attribution *"Data ja kartat (c) Helsingin kaupunki, kaupunkimittauspalvelut"*. The service
 * covers the City of Helsinki only.
 */
import type { Box, Region } from '../engine/geometry';
import type { MapBackground } from '../engine/model';
import { regionFromPolygons, regionFromTileRings } from '../engine/planSite';
import { unionRegions } from '../engine/geometryOps';
import { latLonToLocal, localToLatLon, osmTileUrl, tileSpan, WGS84_A, type GeoOrigin, type Tile } from './geo';
import { fromTiles, TILE_CONCURRENCY, toTiles, versatilesLoader, type TileLoader } from './vectorTiles';

export const HEL_WMS = 'https://kartta.hel.fi/ws/geoserver/avoindata/wms';
export const HEL_WFS = 'https://kartta.hel.fi/ws/geoserver/avoindata/wfs';
export const HEL_ATTRIBUTION = 'Data ja kartat © Helsingin kaupunki, kaupunkimittauspalvelut (CC BY 4.0)';
export const HEL_SOURCE = 'City of Helsinki, City Survey Services, open data (kartta.hel.fi, CC BY 4.0)';

export type MapProvider = MapBackground['provider'];
export const MAP_PROVIDERS: readonly MapProvider[] = ['osm', 'helsinki-guide', 'helsinki-base', 'helsinki-ortho'];

/** The WMS layer of each Helsinki base map. */
export const HEL_BASE_LAYERS: Record<Exclude<MapProvider, 'osm'>, string> = {
  'helsinki-guide': 'avoindata:Opaskartta_Helsinki',
  'helsinki-base': 'avoindata:Kantakartta',
  'helsinki-ortho': 'avoindata:Ortoilmakuva',
};
export const HEL_PLAN_LAYER = 'avoindata:Ajantasa_asemakaava';
export const HEL_PLAN_AREAS = 'avoindata:Kaavahakemisto_alue_kaava_voimassa';

/** Bounds of a tile in Web Mercator metres (EPSG:3857): west, south, east, north. */
export function tileBounds(tile: Tile): [number, number, number, number] {
  const span = tileSpan(tile.z);
  const west = -Math.PI * WGS84_A + tile.x * span;
  const north = Math.PI * WGS84_A - tile.y * span;
  return [west, north - span, west + span, north];
}

/** A 256 × 256 WMS GetMap image exactly covering the tile, so it sits in the OSM tile grid. */
export function wmsTileUrl(layer: string, tile: Tile, transparent: boolean): string {
  const bbox = tileBounds(tile).map((v) => v.toFixed(3)).join(',');
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: layer,
    styles: '',
    crs: 'EPSG:3857',
    bbox,
    width: '256',
    height: '256',
    format: 'image/png',
    transparent: String(transparent),
  });
  return `${HEL_WMS}?${q.toString()}`;
}

/** The base-map image of a tile for the chosen provider. */
export const baseTileUrl = (provider: MapProvider, tile: Tile): string => (provider === 'osm' ? osmTileUrl(tile) : wmsTileUrl(HEL_BASE_LAYERS[provider], tile, false));
/** The up-to-date detailed plan over the base map (transparent). */
export const planTileUrl = (tile: Tile): string => wmsTileUrl(HEL_PLAN_LAYER, tile, true);

/** Attribution lines the map on the canvas needs. */
export function mapAttributions(map: MapBackground): string[] {
  const out: string[] = [];
  if (map.provider === 'osm') out.push('© OpenStreetMap contributors');
  if (map.provider !== 'osm' || map.planOverlay) out.push(HEL_ATTRIBUTION);
  return out;
}

/** One detailed-plan area in force. */
export interface PlanArea {
  id: number;
  /** Plan number (kaavatunnus). */
  code: string;
  /** Area given by the service, m² (pintaala). */
  serviceArea: number | null;
  /** Date the plan came into force, or its approval date, YYYY-MM-DD; null if neither is given. */
  inForce: string | null;
  /** Polygons as [lat, lon] rings: outer ring first, then holes. */
  polygons: { lat: number; lon: number }[][][];
}

type Json = Record<string, unknown>;

/**
 * Plan areas from a WFS GetFeature answer (GeoJSON, srsName EPSG:4326). GeoServer gives the
 * coordinates as [lon, lat] (checked 2026-11-23: [24.948, 60.170] for plan 461); a pair whose
 * first value lies in Finland's latitudes (59–71) and second in its longitudes (19–32) is taken as
 * [lat, lon] instead, so an axis-order change of the server cannot misplace the area.
 */
export function parsePlanAreas(json: unknown): PlanArea[] {
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) throw new Error('the plan service did not answer with GeoJSON features');
  return features.flatMap((f: Json) => {
    const g = f.geometry as { type?: string; coordinates?: unknown } | null;
    const p = (f.properties ?? {}) as Json;
    if (!g || !Array.isArray(g.coordinates)) return [];
    const raw = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as number[][][][];
    const latLon = (c: number[]) => {
      const [a, b] = c as [number, number];
      const latFirst = a >= 59 && a <= 71 && b >= 19 && b <= 32;
      return latFirst ? { lat: a, lon: b } : { lat: b, lon: a };
    };
    const polygons = raw.map((poly) => poly.map((ring) => ring.map(latLon)));
    const date = (k: string) => (typeof p[k] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p[k] as string) ? (p[k] as string).slice(0, 10) : null);
    return [
      {
        id: typeof p.id === 'number' ? p.id : 0,
        code: String(p.kaavatunnus ?? '?'),
        serviceArea: typeof p.pintaala === 'number' ? p.pintaala : null,
        inForce: date('voimaantulopvm') ?? date('vahvistamispvm') ?? date('lainvoimaisuuspvm'),
        polygons,
      },
    ];
  });
}

/** The WFS query for the plan areas in force at a point. */
export function planQueryUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: HEL_PLAN_AREAS,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: '10',
    CQL_FILTER: `INTERSECTS(geom,SRID=4326;POINT(${lon.toFixed(7)} ${lat.toFixed(7)}))`,
  });
  return `${HEL_WFS}?${q.toString()}`;
}

/** The plan areas in force at a point, smallest first (the most specific plan); empty outside them. */
export async function lookupPlanAt(lat: number, lon: number, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<PlanArea[]> {
  const r = await fetchImpl(planQueryUrl(lat, lon), signal ? { signal } : {});
  if (!r.ok) throw new Error(`kartta.hel.fi answered ${r.status}`);
  return parsePlanAreas(await r.json()).sort((a, b) => (a.serviceArea ?? Infinity) - (b.serviceArea ?? Infinity));
}

/** A plan area in local metres. */
export const planRegion = (plan: PlanArea, origin: GeoOrigin): Region =>
  regionFromPolygons(plan.polygons.map((poly) => poly.map((ring) => ring.map((p) => latLonToLocal(origin, p.lat, p.lon)))));

/** Most detailed zoom level of the water tiles (as in the fetch lookup, I113). */
export const WATER_ZOOM = 14;

/**
 * The water (OpenStreetMap water areas in vector tiles, as the fetch lookup, I113) over a box in
 * local metres, in local metres. Tiles at z14 (about 1.2 km at 60° N).
 */
export async function lookupWaterRegion(origin: GeoOrigin, box: Box, loader: TileLoader = versatilesLoader(), signal?: AbortSignal): Promise<{ water: Region; tiles: number }> {
  const sw = localToLatLon(origin, { x: box.minX, y: box.minY });
  const ne = localToLatLon(origin, { x: box.maxX, y: box.maxY });
  const a = toTiles(sw.lat, sw.lon, WATER_ZOOM);
  const b = toTiles(ne.lat, ne.lon, WATER_ZOOM);
  const tiles: Tile[] = [];
  for (let y = Math.floor(b.y); y <= Math.floor(a.y); y++) for (let x = Math.floor(a.x); x <= Math.floor(b.x); x++) tiles.push({ z: WATER_ZOOM, x, y });
  if (tiles.length > 64) throw new Error(`the plan area is too large for a water lookup (${tiles.length} map tiles)`);
  const regions: Region[] = [];
  for (let i = 0; i < tiles.length; i += TILE_CONCURRENCY) {
    const batch = tiles.slice(i, i + TILE_CONCURRENCY);
    const loaded = await Promise.all(batch.map((t) => loader(t.z, t.x, t.y, signal)));
    loaded.forEach((tile, k) => {
      const t = batch[k]!;
      for (const polygon of tile.polygons) {
        const rings = polygon.map((ring) =>
          ring.map((p) => {
            const g = fromTiles(t.x + p.x, t.y + p.y, t.z);
            return latLonToLocal(origin, g.lat, g.lon);
          }),
        );
        regions.push(regionFromTileRings(rings));
      }
    });
  }
  return { water: unionRegions(regions), tiles: tiles.length };
}
