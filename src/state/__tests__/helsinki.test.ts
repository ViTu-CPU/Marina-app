import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { regionArea } from '../../engine/geometry';
import { latLonToLocal, mercatorX, mercatorY } from '../geo';
import {
  baseTileUrl,
  HEL_ATTRIBUTION,
  lookupPlanAt,
  lookupWaterRegion,
  mapAttributions,
  parsePlanAreas,
  planQueryUrl,
  planRegion,
  planTileUrl,
  tileBounds,
  wmsTileUrl,
} from '../helsinki';
import { toTiles } from '../vectorTiles';

/** A real answer of kartta.hel.fi for the point 60.1640 N, 24.9525 E (plan 461), fetched 2026-11-23. */
const answer = JSON.parse(readFileSync('src/state/__tests__/fixtures/hel-plan-461.json', 'utf8'));

describe('City of Helsinki map data (U34)', () => {
  it('WMS images cover exactly the Web Mercator tile of the OSM grid', () => {
    const tile = { z: 16, x: 37298, y: 18965 };
    const [w, s, e, n] = tileBounds(tile);
    // 2π·a / 2^16 = 611.496 m per tile at z16.
    expect(e - w).toBeCloseTo((2 * Math.PI * 6378137) / 2 ** 16, 6);
    expect(n - s).toBeCloseTo(e - w, 6);
    const url = new URL(wmsTileUrl('avoindata:Kantakartta', tile, false));
    expect(url.origin + url.pathname).toBe('https://kartta.hel.fi/ws/geoserver/avoindata/wms');
    expect(url.searchParams.get('crs')).toBe('EPSG:3857');
    expect(url.searchParams.get('bbox')).toBe([w, s, e, n].map((v) => v.toFixed(3)).join(','));
    expect([url.searchParams.get('width'), url.searchParams.get('height'), url.searchParams.get('layers')]).toEqual(['256', '256', 'avoindata:Kantakartta']);
    // The tile holding a point contains it.
    const p = toTiles(60.164, 24.9525, 16);
    const t = { z: 16, x: Math.floor(p.x), y: Math.floor(p.y) };
    const [w2, s2, e2, n2] = tileBounds(t);
    expect(mercatorX(24.9525)).toBeGreaterThan(w2);
    expect(mercatorX(24.9525)).toBeLessThan(e2);
    expect(mercatorY(60.164)).toBeGreaterThan(s2);
    expect(mercatorY(60.164)).toBeLessThan(n2);
  });

  it('base maps and the plan overlay, with the attributions their licences ask for', () => {
    const tile = { z: 15, x: 1, y: 2 };
    expect(baseTileUrl('osm', tile)).toBe('https://tile.openstreetmap.org/15/1/2.png');
    expect(new URL(baseTileUrl('helsinki-ortho', tile)).searchParams.get('layers')).toBe('avoindata:Ortoilmakuva');
    expect(new URL(baseTileUrl('helsinki-guide', tile)).searchParams.get('layers')).toBe('avoindata:Opaskartta_Helsinki');
    const plan = new URL(planTileUrl(tile));
    expect([plan.searchParams.get('layers'), plan.searchParams.get('transparent')]).toEqual(['avoindata:Ajantasa_asemakaava', 'true']);
    const at = { lat: 60.16, lon: 24.95, opacity: 1 };
    expect(mapAttributions({ provider: 'osm', ...at })).toEqual(['© OpenStreetMap contributors']);
    expect(mapAttributions({ provider: 'osm', ...at, planOverlay: true })).toEqual(['© OpenStreetMap contributors', HEL_ATTRIBUTION]);
    expect(mapAttributions({ provider: 'helsinki-base', ...at })).toEqual([HEL_ATTRIBUTION]);
  });

  it('the WFS query asks for the plans in force at the point, longitude first', () => {
    const url = new URL(planQueryUrl(60.164, 24.9525));
    expect(url.searchParams.get('typeNames')).toBe('avoindata:Kaavahakemisto_alue_kaava_voimassa');
    expect(url.searchParams.get('CQL_FILTER')).toBe('INTERSECTS(geom,SRID=4326;POINT(24.9525000 60.1640000))');
    expect(url.searchParams.get('srsName')).toBe('EPSG:4326');
  });

  it('reads the real answer: plan 461, its 14 polygons, and an area that matches the service within 0.5 %', () => {
    const [plan, ...rest] = parsePlanAreas(answer);
    expect(rest).toHaveLength(0);
    expect(plan!.code).toBe('461');
    expect(plan!.inForce).toBe('1836-08-23');
    expect(plan!.polygons).toHaveLength(14);
    // [lon, lat] in the answer → lat 60.17, lon 24.95.
    expect(plan!.polygons[0]![0]![0]!.lat).toBeCloseTo(60.1707, 3);
    expect(plan!.polygons[0]![0]![0]!.lon).toBeCloseTo(24.9484, 3);
    const region = planRegion(plan!, { lat: 60.165, lon: 24.95 });
    // The service gives 129 385.7 m² (pintaala); the local metric plane must agree closely.
    const ratio = regionArea(region) / plan!.serviceArea!;
    expect(Math.abs(ratio - 1)).toBeLessThan(0.005);
  });

  it('a [lat, lon] answer gives the same place', () => {
    const swapped = JSON.parse(JSON.stringify(answer));
    for (const poly of swapped.features[0].geometry.coordinates) for (const ring of poly) for (const c of ring) c.reverse();
    const a = parsePlanAreas(answer)[0]!.polygons[3]![0]![2]!;
    const b = parsePlanAreas(swapped)[0]!.polygons[3]![0]![2]!;
    expect(b).toEqual(a);
  });

  it('lookupPlanAt: smallest plan first; an error status is an error', async () => {
    const big = JSON.parse(JSON.stringify(answer.features[0]));
    big.properties.kaavatunnus = '9999';
    big.properties.pintaala = 1e7;
    const fake = (async () => new Response(JSON.stringify({ ...answer, features: [big, answer.features[0]] }))) as unknown as typeof fetch;
    expect((await lookupPlanAt(60.164, 24.9525, fake)).map((p) => p.code)).toEqual(['461', '9999']);
    const failing = (async () => new Response('x', { status: 503 })) as unknown as typeof fetch;
    await expect(lookupPlanAt(60.164, 24.9525, failing)).rejects.toThrow('kartta.hel.fi answered 503');
  });

  it('water over a box from vector tiles, in local metres', async () => {
    const origin = { lat: 60.164, lon: 24.9525 };
    // A loader whose every tile is water in its left half (x < 0.5).
    const asked: string[] = [];
    const loader = async (z: number, x: number, y: number) => {
      asked.push(`${z}/${x}/${y}`);
      const ring = [
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 0.5, y: 1 },
        { x: 0, y: 1 },
      ]; // clockwise with y down = an exterior ring
      return { polygons: [[ring]] };
    };
    const { water, tiles } = await lookupWaterRegion(origin, { minX: -100, minY: -100, maxX: 100, maxY: 100 }, loader);
    expect(tiles).toBe(asked.length);
    expect(asked.every((k) => k.startsWith('14/'))).toBe(true);
    expect(regionArea(water)).toBeGreaterThan(0);
    // The origin's own tile: is the origin in water? It is iff it lies in the tile's left half.
    const p = toTiles(origin.lat, origin.lon, 14);
    const inLeft = p.x - Math.floor(p.x) < 0.5;
    const o = latLonToLocal(origin, origin.lat, origin.lon);
    const { pointInPart } = await import('../../engine/geometry');
    expect(water.some((part) => pointInPart(o, part))).toBe(inLeft);
  });
});
