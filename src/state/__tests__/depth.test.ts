import { describe, expect, it } from 'vitest';
import { emodnetProfileUrl, lakeMeanDepth, lookupFetchDepths, lookupSiteDepth, parseBand, parseZones, rayEnd, seaMeanDepth, SITE_DEPTH_BEARINGS, SITE_DEPTH_RADIUS, sykeZonesUrl, type DepthZone } from '../depth';
import { toTm35fin } from '../waterLevels';

describe('depth along the fetches (I110)', () => {
  it('sea: mean of the samples under water; land samples count against the coverage', () => {
    expect(seaMeanDepth([-2, -4, -6, 5])).toEqual({ depth: 4, source: 'emodnet', coverage: 0.75 });
    expect(seaMeanDepth([-2, 3, 4, 5])).toBeNull(); // a quarter under water
    expect(seaMeanDepth([])).toBeNull();
  });

  it('depth bands: "0-1,5" → 0–1.5, one number, island none', () => {
    expect(parseBand('0-1,5')).toEqual([0, 1.5]);
    expect(parseBand('10-15')).toEqual([10, 15]);
    expect(parseBand('>20')).toEqual([20, 20]);
    expect(parseBand('Saari')).toBeNull();
  });

  it('lake: middle of the band along the ray; islands and gaps have no depth', () => {
    const lat = 63.57;
    const lon = 27.22;
    const s = toTm35fin(lat, lon);
    const square = (e0: number, n0: number, e1: number, n1: number): [number, number][][] => [[[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]];
    // North of the point: 0–400 m in a 1.5–3 m zone, 400–800 m in a 3–6 m zone with an island at 600–700 m.
    const zones: DepthZone[] = parseZones({
      features: [
        { properties: { syvyysvali_m: '1,5-3' }, geometry: { type: 'MultiPolygon', coordinates: [square(s.e - 50, s.n, s.e + 50, s.n + 400)] } },
        { properties: { syvyysvali_m: '3-6' }, geometry: { type: 'Polygon', coordinates: [...square(s.e - 50, s.n + 400, s.e + 50, s.n + 800), ...square(s.e - 50, s.n + 600, s.e + 50, s.n + 700).map((r) => r.reverse())] } },
      ],
    });
    const r = lakeMeanDepth(lat, lon, 0, 800, zones)!;
    // 100 samples at 2.25 m, 75 at 4.5 m (25 on the island have none).
    expect(r.coverage).toBeCloseTo(175 / 200, 9);
    expect(r.depth).toBeCloseTo((100 * 2.25 + 75 * 4.5) / 175, 9);
    expect(r.source).toBe('syke');
    expect(lakeMeanDepth(lat, lon, 90, 800, zones)).toBeNull(); // east: outside the zones
  });

  it('URLs: EMODnet line from the site along the bearing; SYKE zones in TM35FIN', () => {
    const end = rayEnd(60.155, 24.956, 180, 1000);
    expect(end.lat).toBeLessThan(60.155);
    expect(end.lon).toBeCloseTo(24.956, 6);
    expect(decodeURIComponent(emodnetProfileUrl({ lat: 60.155, lon: 24.956 }, end))).toMatch(/^https:\/\/rest\.emodnet-bathymetry\.eu\/depth_profile\?geom=LINESTRING\(24\.95600 60\.15500,24\.95600 60\.146/);
    const u = new URL(sykeZonesUrl({ minE: 500000, minN: 7040000, maxE: 520000, maxN: 7060000 })).searchParams;
    expect(u.get('typeNames')).toBe('inspire_el:EL.Syvyysalue');
    expect(u.get('bbox')).toBe('500000,7040000,520000,7060000,urn:ogc:def:crs:EPSG::3067');
    expect(u.get('propertyName')).toBe('syvyysvali_m,geom');
  });

  it('lookup: EMODnet first, SYKE for the rays without sea; none for sectors without fetch', async () => {
    const lat = 63.57;
    const lon = 27.22;
    const s = toTm35fin(lat, lon);
    const urls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.startsWith('https://rest.emodnet-bathymetry.eu/')) {
        // North: sea 3 m deep; east: land.
        const north = decodeURIComponent(url).includes(`LINESTRING(${lon.toFixed(5)} ${lat.toFixed(5)},${lon.toFixed(5)}`);
        return new Response(JSON.stringify(north ? new Array(1000).fill(-3) : new Array(1000).fill(90)));
      }
      return new Response(JSON.stringify({ features: [{ properties: { syvyysvali_m: '3-6' }, geometry: { type: 'Polygon', coordinates: [[[s.e, s.n - 50], [s.e + 2000, s.n - 50], [s.e + 2000, s.n + 50], [s.e, s.n + 50], [s.e, s.n - 50]]] } }] }));
    }) as typeof fetch;
    const out = await lookupFetchDepths(lat, lon, [{ bearing: 0, fetch: 1000 }, { bearing: 90, fetch: 1000 }, { bearing: 180, fetch: 0 }], { fetchImpl });
    expect(out[0]).toEqual({ depth: 3, source: 'emodnet', coverage: 1 });
    expect(out[1]).toMatchObject({ depth: 4.5, source: 'syke', coverage: 1 });
    expect(out[2]).toBeNull();
    expect(urls.filter((u) => u.includes('emodnet'))).toHaveLength(2);
    expect(urls.filter((u) => u.includes('ymparisto'))).toHaveLength(1);
  });
});

describe('mean depth around the site position (I121)', () => {
  const lat = 60.155;
  const lon = 24.956;
  /** EMODnet answers ray by ray (in the order of SITE_DEPTH_BEARINGS); SYKE with `zones`. */
  const mock = (ray: (k: number) => number[], zones: unknown = { features: [] }) => {
    const urls: string[] = [];
    let k = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.startsWith('https://rest.emodnet-bathymetry.eu/')) return new Response(JSON.stringify(ray(k++)));
      return new Response(JSON.stringify(zones));
    }) as typeof fetch;
    return { urls, fetchImpl };
  };

  it('sea: eight rays of 200 m (Assumption); the mean, shallowest and deepest of the samples under water', async () => {
    expect(SITE_DEPTH_BEARINGS).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(SITE_DEPTH_RADIUS).toBe(200);
    // N … SE: half 2 m, half 6 m deep; S … NW: land. Half of the samples in water.
    const { urls, fetchImpl } = mock((k) => (k < 4 ? [...new Array(500).fill(-2), ...new Array(500).fill(-6)] : new Array(1000).fill(5)));
    const r = await lookupSiteDepth(lat, lon, 200, { fetchImpl });
    expect(r).toEqual({ depth: 4, min: 2, max: 6, source: 'emodnet', coverage: 0.5 });
    expect(urls).toHaveLength(8);
    expect(urls[2]).toBe(emodnetProfileUrl({ lat, lon }, rayEnd(lat, lon, 90, 200)));
  });

  it('lake: EMODnet without water, SYKE’s depth zones in a box of the ray length', async () => {
    const s = toTm35fin(lat, lon);
    const zone = { features: [{ properties: { syvyysvali_m: '3-6' }, geometry: { type: 'Polygon', coordinates: [[[s.e - 300, s.n - 300], [s.e + 300, s.n - 300], [s.e + 300, s.n + 300], [s.e - 300, s.n + 300], [s.e - 300, s.n - 300]]] } }] };
    const { urls, fetchImpl } = mock(() => new Array(1000).fill(12), zone);
    const r = await lookupSiteDepth(lat, lon, 200, { fetchImpl });
    expect(r).toEqual({ depth: 4.5, min: 4.5, max: 4.5, source: 'syke', coverage: 1 });
    expect(urls.at(-1)).toBe(sykeZonesUrl({ minE: s.e - 200, minN: s.n - 200, maxE: s.e + 200, maxN: s.n + 200 }));
  });

  it('neither covers half: the larger share, shown with it; nothing: null; an error is passed on', async () => {
    const some = mock(() => [...new Array(300).fill(-3), ...new Array(700).fill(4)]);
    expect(await lookupSiteDepth(lat, lon, 200, some)).toEqual({ depth: 3, min: 3, max: 3, source: 'emodnet', coverage: 0.3 });
    expect(await lookupSiteDepth(lat, lon, 200, mock(() => new Array(1000).fill(4)))).toBeNull();
    const failing = (async () => new Response('', { status: 503 })) as typeof fetch;
    await expect(lookupSiteDepth(lat, lon, 200, { fetchImpl: failing })).rejects.toThrow('rest.emodnet-bathymetry.eu answered 503');
  });
});
