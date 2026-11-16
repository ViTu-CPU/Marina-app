import { describe, expect, it } from 'vitest';
import { castRays, rayHit, sectorFetches } from '../../engine/fetchRays';
import { fetchFromResponse, fetchQuery, lookupFetch, NoShoreError, OVERPASS_URLS, shoreAnalysis, shoreSegments, tangentPlane, type OverpassResponse } from '../overpass';

const LAT = 63.559;
const LON = 27.1925;
const plane = tangentPlane(LAT, LON);
/** OSM geometry from local metres around the site. */
const geom = (pts: [number, number][]) => pts.map(([x, y]) => plane.toLatLon({ x, y }));
const ring = (pts: [number, number][]) => geom([...pts, pts[0]!]);

describe('rays and sector fetches (I94)', () => {
  it('ray–segment intersection', () => {
    expect(rayHit({ x: 0, y: 1 }, { x: -1, y: 5 }, { x: 1, y: 5 })).toBeCloseTo(5, 12);
    expect(rayHit({ x: 0, y: 1 }, { x: 1, y: 5 }, { x: 2, y: 5 })).toBeNull();
    expect(rayHit({ x: 0, y: 1 }, { x: -1, y: -5 }, { x: 1, y: -5 })).toBeNull();
  });

  it('a square lake 2 km wide around the site, 500 m from its west shore; the longest ray per sector', () => {
    const s = (a: [number, number], b: [number, number]) => ({ a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } });
    // Lake from x = −500 to 1500, y = −1000 to 1000.
    const segments = [s([-500, -1000], [1500, -1000]), s([1500, -1000], [1500, 1000]), s([1500, 1000], [-500, 1000]), s([-500, 1000], [-500, -1000])];
    const d = castRays(segments, 20000);
    expect(d).toHaveLength(72);
    expect(d[0]).toBeCloseTo(1000, 6); // N
    expect(d[18]).toBeCloseTo(1500, 6); // E
    expect(d[54]).toBeCloseTo(500, 6); // W
    const f = sectorFetches(d, 20000);
    // E sector: rays 70°…110°; the longest hits the corner region: at 70° x = 1500 → 1500 / sin 70° = 1596 m, y = 546 < 1000.
    expect(f[2]!.fetch).toBeCloseTo(1500 / Math.sin((70 * Math.PI) / 180), 3);
    expect([70, 110]).toContain(f[2]!.bearing);
    // NE: 25°…65°; the corner (1500, 1000) is at 56.3°, the longest ray just beside it: 55° → y = 1000 / cos 55° = 1743 m (x = 1428 < 1500).
    expect(f[1]!.fetch).toBeCloseTo(1000 / Math.cos((55 * Math.PI) / 180), 3);
    expect(f.every((x) => !x.open)).toBe(true);
    // Nothing crossed: the search radius, flagged open.
    expect(sectorFetches(castRays([], 5000), 5000)[0]).toEqual({ fetch: 5000, bearing: 0, open: true });
  });
});

describe('OpenStreetMap shorelines from Overpass (D47)', () => {
  it('query: water ways and relations in the box by tag first, then only those near the rays (I112); one polyline through the site', () => {
    const q = fetchQuery(LAT, LON, 3000, 45);
    expect(q.startsWith('[out:json]')).toBe(true);
    // The box: 3 000 m + 200 m to each side of the site.
    const box = q.match(/way\[natural=coastline\]\(([^)]*)\)/)![1]!.split(',').map(Number);
    expect(plane.toLocal(box[0]!, box[1]!).x).toBeCloseTo(-3200, 0);
    expect(plane.toLocal(box[0]!, box[1]!).y).toBeCloseTo(-3200, 0);
    expect(plane.toLocal(box[2]!, box[3]!).x).toBeCloseTo(3200, 0);
    expect(plane.toLocal(box[2]!, box[3]!).y).toBeCloseTo(3200, 0);
    expect(q).toContain(`rel[natural=water](${box.map((x) => x.toFixed(6)).join(',')})`);
    expect(q).toContain(')->.waterRels;way(r.waterRels)(');
    expect(q).toContain('(.tagged;.members;)->.candidates;way.candidates(around:2,63.559000,27.192500,');
    expect(q).toContain('rel.waterRels(bw.ways)->.rels;');
    expect(q.endsWith('.ways out geom;.rels out skel;')).toBe(true);
    // Every set used is defined first.
    for (const set of ['tagged', 'waterRels', 'members', 'candidates', 'ways', 'rels']) {
      const defined = q.indexOf(`->.${set};`);
      const used = q.search(new RegExp(`(?<!->)\\.${set}\\b`));
      expect(defined).toBeGreaterThan(0);
      expect(used).toBeGreaterThan(defined);
    }
    // 8 rays: centre and end per ray, back to the centre: 17 coordinate pairs.
    expect(q.match(/around:2,([^)]*)\)/)![1]!.split(',').length).toBe(34);
    // The northern ray ends 3 000 m north.
    const north = q.match(/around:2,[^,]+,[^,]+,([^,]+),([^,]+),/)!;
    expect(plane.toLocal(Number(north[1]), Number(north[2])).y).toBeCloseTo(3000, 0);
  });

  // Lake A (relation 1) from x = −500 to 1500, an island inside it (inner ring, same relation), and
  // lake B (relation 2) east of x = 1500 sharing that boundary way (member of both) up to x = 4000.
  const lakes: OverpassResponse = {
    elements: [
      { type: 'way', id: 10, geometry: geom([[1500, -1000], [1500, 1000]]) }, // shared A|B
      { type: 'way', id: 11, geometry: geom([[1500, 1000], [-500, 1000], [-500, -1000], [1500, -1000]]) }, // rest of A
      { type: 'way', id: 12, geometry: ring([[-200, 200], [-100, 200], [-100, 400], [-200, 400]]) }, // island in A
      { type: 'way', id: 13, geometry: geom([[1500, 1000], [4000, 1000], [4000, -1000], [1500, -1000]]) }, // rest of B
      { type: 'relation', id: 1, members: [{ type: 'way', ref: 10, role: 'outer' }, { type: 'way', ref: 11, role: 'outer' }, { type: 'way', ref: 12, role: 'inner' }] },
      { type: 'relation', id: 2, members: [{ type: 'way', ref: 10, role: 'outer' }, { type: 'way', ref: 13, role: 'outer' }] },
    ],
  };

  it('a boundary between two water areas is not a shore; islands are', () => {
    const segs = shoreSegments(lakes, LAT, LON);
    // Way 10 (1 segment) dropped; way 11: 3, island: 4, way 13: 3.
    expect(segs).toHaveLength(10);
    const r = fetchFromResponse(lakes, LAT, LON, 20000);
    expect(r.distances[18]).toBeCloseTo(4000, 0); // E: across the shared boundary to lake B's far shore
    expect(r.distances[0]).toBeCloseTo(1000, 0); // N
    // The island (x −200…−100, y 200…400): the ray at 340° passes its south edge east of it (x = −72.8 at
    // y = 200) and meets its east edge x = −100 at 100 / sin 20° = 292.4 m.
    expect(r.distances[68]).toBeCloseTo(100 / Math.sin((20 * Math.PI) / 180), 6);
  });

  it('coastline ways and closed water-area ways count as one feature each', () => {
    const r: OverpassResponse = {
      elements: [
        { type: 'way', id: 20, tags: { natural: 'coastline' }, geometry: geom([[-3000, 2000], [3000, 2000]]) },
        { type: 'way', id: 21, tags: { natural: 'water' }, geometry: ring([[-50, -800], [50, -800], [50, -900], [-50, -900]]) },
        { type: 'way', id: 22, tags: { highway: 'residential' }, geometry: geom([[-3000, 500], [3000, 500]]) },
      ],
    };
    const f = fetchFromResponse(r, LAT, LON, 10000);
    expect(f.segments).toBe(5);
    expect(f.distances[0]).toBeCloseTo(2000, 0);
    expect(f.distances[36]).toBeCloseTo(800, 0);
    expect(f.distances[18]).toBe(10000);
  });

  it('the sea coastline is a shore also where a water area is drawn against it (I112)', () => {
    // A bay (relation 5, natural=water) whose outer ring shares the coastline way 30 north of the site.
    const r: OverpassResponse = {
      elements: [
        { type: 'way', id: 30, tags: { natural: 'coastline' }, geometry: geom([[-3000, 2000], [3000, 2000]]) },
        { type: 'way', id: 31, geometry: geom([[3000, 2000], [3000, 4000], [-3000, 4000], [-3000, 2000]]) },
        { type: 'relation', id: 5, members: [{ type: 'way', ref: 30, role: 'outer' }, { type: 'way', ref: 31, role: 'outer' }] },
      ],
    };
    const a = shoreAnalysis(r, LAT, LON);
    expect(a.stats).toEqual({ ways: 2, relations: 1, shore: 4, waterWater: 0 });
    expect(fetchFromResponse(r, LAT, LON, 10000).distances[0]).toBeCloseTo(2000, 0);
  });

  it('counts what the answer held: boundaries between two water areas are counted, not kept', () => {
    expect(shoreAnalysis(lakes, LAT, LON).stats).toEqual({ ways: 4, relations: 2, shore: 10, waterWater: 1 });
    const r = fetchFromResponse(lakes, LAT, LON, 20000);
    expect(r.hits).toBe(72);
    expect(fetchFromResponse({ elements: [] }, LAT, LON, 20000).hits).toBe(0);
  });

  const answer = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

  it('lookup: one POST to the first Overpass server; the source names the server that answered', async () => {
    const calls: string[] = [];
    let body = '';
    const ok = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      body = String(init?.body);
      return answer(lakes);
    }) as typeof fetch;
    const r = await lookupFetch(LAT, LON, 5000, { fetchImpl: ok });
    expect(calls).toEqual([OVERPASS_URLS[0]]);
    expect(r.server).toBe(OVERPASS_URLS[0]);
    expect(decodeURIComponent(body.replace(/\+/g, ' '))).toContain('data=[out:json]');
    // E sector: the longest ray is at 80° (or 100°): x = 4000 at 4000 / sin 80° = 4061.7 m (y = 705 < 1000).
    expect(r.sectors[2]!.fetch).toBeCloseTo(4000 / Math.sin((80 * Math.PI) / 180), 3);
  });

  it('lookup: the next server when one fails (429, timeout remark, network error, no shore at all); every reason when all fail', async () => {
    const answers = (list: (() => Response)[]) => {
      const calls: string[] = [];
      const f = (async (url: string) => {
        calls.push(url);
        const next = list.shift()!;
        return next();
      }) as unknown as typeof fetch;
      return { f, calls };
    };
    const busy = () => answer('', 429);
    const timeout = () => answer({ elements: [], remark: 'runtime error: Query timed out in "query" at line 1 after 121 seconds.' });
    const empty = () => answer({ elements: [] });
    const good = () => answer(lakes);
    const offline = () => {
      throw new TypeError('Failed to fetch');
    };
    for (const first of [busy, timeout, empty, offline]) {
      const { f, calls } = answers([first, good]);
      const asked: [string, number, number][] = [];
      const r = await lookupFetch(LAT, LON, 5000, { fetchImpl: f, onServer: (server, index, limit) => asked.push([server, index, limit]) });
      expect(calls).toEqual([...OVERPASS_URLS]);
      expect(asked).toEqual([
        [OVERPASS_URLS[0], 0, 150_000],
        [OVERPASS_URLS[1], 1, 150_000],
      ]);
      expect(r.server).toBe(OVERPASS_URLS[1]);
      expect(r.hits).toBe(72);
    }
    const all = answers([busy, timeout]);
    await expect(lookupFetch(LAT, LON, 5000, { fetchImpl: all.f })).rejects.toThrow(/overpass\.private\.coffee: answered 429.*; overpass-api\.de: runtime error: Query timed out/);
    // No shore in any direction: an error that says what the answer held, never the radius as the fetch.
    const none = answers([empty, () => answer({ elements: [{ type: 'way', id: 1, tags: { highway: 'residential' }, geometry: geom([[0, 100], [100, 100]]) }] })]);
    await expect(lookupFetch(LAT, LON, 20000, { fetchImpl: none.f })).rejects.toThrow(
      /no shore in any direction within 20 km; the answer held 0 ways.*; overpass-api\.de: no shore in any direction within 20 km; the answer held 1 ways, 0 water areas \(relations\), 0 shore segments/,
    );
    // A refused query: the reason from Overpass's error page.
    const page = '<html><body><p>The data included in this document is from www.openstreetmap.org.</p><p><strong style="color:#FF0000">Error</strong>: line 1: parse error: Unknown type &quot;wya&quot; </p></body></html>';
    const refused = answers([() => answer(page, 400), () => answer(page, 400)]);
    await expect(lookupFetch(LAT, LON, 5000, { fetchImpl: refused.f })).rejects.toThrow('overpass.private.coffee: answered 400: Error : line 1: parse error: Unknown type "wya"');
    // A server that does not answer is given up after the time limit.
    let silent = true;
    const hang = (async (_url: string, init?: RequestInit) => {
      if (silent) {
        silent = false;
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      return answer(lakes);
    }) as typeof fetch;
    const late = await lookupFetch(LAT, LON, 5000, { fetchImpl: hang, serverTimeoutMs: 20 });
    expect(late.server).toBe(OVERPASS_URLS[1]);
    const never = (async (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    await expect(lookupFetch(LAT, LON, 5000, { fetchImpl: never, serverTimeoutMs: 20 })).rejects.toThrow('overpass.private.coffee: no answer in 0 s; overpass-api.de: no answer in 0 s');
    // The user's own abort stops the lookup at once, without trying the next server.
    const user = new AbortController();
    const calls: string[] = [];
    const pending = lookupFetch(LAT, LON, 5000, {
      signal: user.signal,
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push(url);
        return never(url, init);
      }) as typeof fetch,
    });
    user.abort();
    await expect(pending).rejects.toThrow(/aborted/);
    expect(calls).toHaveLength(1);
    expect(new NoShoreError(5000, { ways: 3, relations: 1, shore: 0, waterWater: 7 }).message).toBe(
      'no shore in any direction within 5 km; the answer held 3 ways, 1 water areas (relations), 0 shore segments and 7 segments between two water areas',
    );
  });
});
