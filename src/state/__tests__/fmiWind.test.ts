import { describe, expect, it } from 'vitest';
import { completeYears, fetchStationWind, findWindStations, monthUrl, parseMultipoint, stationSearchUrl, STATION_SEARCH_RADIUS } from '../fmiWind';

/** A multipointcoverage answer in the shape FMI returns (structure as of 2026-11-16). */
const answer = (stations: { id: string; name: string; lat: number; lon: number }[], rows: [number, number, number, string, string][]) => `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection>
${stations.map((s) => `<gml:Point gml:id="point-${s.id}" srsName="http://www.opengis.net/def/crs/EPSG/0/4258" srsDimension="2">
  <gml:name>${s.name}</gml:name>
  <gml:pos>${s.lat.toFixed(5)} ${s.lon.toFixed(5)} </gml:pos>
</gml:Point>`).join('\n')}
<gmlcov:positions>
${rows.map((r) => `${r[0].toFixed(5)} ${r[1].toFixed(5)}  ${r[2]}`).join('\n')}
</gmlcov:positions>
<gml:doubleOrNilReasonTupleList>
${rows.map((r) => `${r[3]} ${r[4]} `).join('\n')}
</gml:doubleOrNilReasonTupleList>
</wfs:FeatureCollection>`;
const text = (body: string, status = 200) => new Response(body, { status });

describe('FMI wind observations (I108)', () => {
  it('parses stations and rows; NaN is a missing value', () => {
    const xml = answer([{ id: '101726', name: 'Vieremä Kaarakkala', lat: 63.8409, lon: 27.22061 }], [
      [63.8409, 27.22061, 1759276800, '1.4', '183.0'],
      [63.8409, 27.22061, 1759280400, 'NaN', '171.0'],
    ]);
    const { stations, rows } = parseMultipoint(xml, 2);
    expect(stations.get('101726')).toEqual({ name: 'Vieremä Kaarakkala', lat: 63.8409, lon: 27.22061 });
    expect(rows).toEqual([
      { lat: 63.8409, lon: 27.22061, time: 1759276800, values: [1.4, 183] },
      { lat: 63.8409, lon: 27.22061, time: 1759280400, values: [null, 171] },
    ]);
  });

  it('URLs: hourly multipointcoverage, both wind parameters; a month is at most 744 hours', () => {
    const month = new URL(monthUrl('101726', 2024, 1));
    expect(Object.fromEntries(month.searchParams)).toMatchObject({
      storedquery_id: 'fmi::observations::weather::hourly::multipointcoverage',
      parameters: 'WS_PT1H_MAX,WD_PT1H_AVG',
      fmisid: '101726',
      starttime: '2024-01-01T00:00:00Z',
      endtime: '2024-01-31T23:00:00Z',
    });
    for (let m = 1; m <= 12; m++) {
      const u = new URL(monthUrl('1', 2024, m)).searchParams;
      expect((Date.parse(u.get('endtime')!) - Date.parse(u.get('starttime')!)) / 3600000).toBeLessThanOrEqual(744);
    }
    const search = new URL(stationSearchUrl(63.558, 27.19, new Date('2026-11-16T10:30:00Z'))).searchParams;
    expect(search.get('starttime')).toBe('2026-11-14T10:00:00Z');
    expect(search.get('endtime')).toBe('2026-11-16T10:00:00Z');
    const [w, s, e, n] = search.get('bbox')!.split(',').map(Number);
    expect(n! - 63.558).toBeCloseTo(STATION_SEARCH_RADIUS / 111000, 3);
    expect(e! - 27.19).toBeGreaterThan(n! - 63.558); // longitude degrees are shorter
    expect(w).toBeLessThan(27.19);
    expect(s).toBeLessThan(63.558);
  });

  it('finds the stations with wind within the radius, nearest first', async () => {
    const xml = answer(
      [
        { id: '101572', name: 'Kuopio Maaninka', lat: 63.14343, lon: 27.31317 },
        { id: '101726', name: 'Vieremä Kaarakkala', lat: 63.8409, lon: 27.22061 },
        { id: '107113', name: 'Sotkamo Tuhkakylä', lat: 63.99618, lon: 28.05972 },
        { id: '999999', name: 'No wind', lat: 63.6, lon: 27.2 },
      ],
      [
        [63.14343, 27.31317, 1, '3.0', '90'],
        [63.8409, 27.22061, 1, '2.0', '180'],
        [63.99618, 28.05972, 1, '4.0', '200'],
        [63.6, 27.2, 1, 'NaN', 'NaN'],
      ],
    );
    const found = await findWindStations(63.558, 27.19, { fetchImpl: (async () => text(xml)) as typeof fetch, now: new Date('2026-11-16T10:00:00Z') });
    // Sotkamo is about 63 km away (beyond 60 km), the fourth station has no wind.
    expect(found.map((s) => s.fmisid)).toEqual(['101726', '101572']);
    expect(found[0]!.distance / 1000).toBeCloseTo(31.6, 0);
  });

  it('fetches every month, keeps hours with speed and direction, sorts them, counts hours by year and retries on 503', async () => {
    const urls: string[] = [];
    let failed = false;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url.searchParams.get('starttime')!);
      if (!failed && url.searchParams.get('starttime') === '2020-03-01T00:00:00Z') {
        failed = true;
        return text('busy', 503);
      }
      const t = Date.parse(url.searchParams.get('starttime')!) / 1000;
      return text(answer([{ id: '1', name: 'A', lat: 60, lon: 25 }], [
        [60, 25, t, '5.0', '90'],
        [60, 25, t + 3600, 'NaN', '90'],
        [60, 25, t + 7200, '7.0', '270'],
      ]));
    }) as typeof fetch;
    const progress: number[] = [];
    const r = await fetchStationWind('1', 2020, 2021, { fetchImpl, sleep: async () => {}, onProgress: (d) => progress.push(d) });
    expect(new Set(urls).size).toBe(24);
    expect(urls.length).toBe(25); // one retry
    expect(r.times.length).toBe(48);
    expect([...r.times].sort((a, b) => a - b)).toEqual(r.times);
    expect(r.speeds.slice(0, 2)).toEqual([5, 7]);
    expect(r.hoursByYear).toEqual({ 2020: 24, 2021: 24 });
    expect(progress.at(-1)).toBe(24);
  });

  it('reports the service reason when a request fails for good', async () => {
    const fetchImpl = (async () => text('<ExceptionReport><Exception><ExceptionText>Too long time interval requested!</ExceptionText></Exception></ExceptionReport>', 400)) as typeof fetch;
    await expect(fetchStationWind('1', 2020, 2020, { fetchImpl, sleep: async () => {} })).rejects.toThrow('FMI open data answered 400: Too long time interval requested!');
  });

  it('complete years: the longest run with at least 80 % of the hours, the latest when tied', () => {
    const full = 8760;
    expect(completeYears({ 2001: full, 2002: full, 2003: 100, 2004: full, 2005: full, 2006: full }, 2001, 2006)).toEqual({ startYear: 2004, endYear: 2006 });
    expect(completeYears({ 2001: full, 2002: 0.8 * full }, 2001, 2002)).toEqual({ startYear: 2001, endYear: 2002 });
    expect(completeYears({ 2001: full, 2003: full }, 2001, 2003)).toEqual({ startYear: 2003, endYear: 2003 });
    expect(completeYears({}, 2001, 2003)).toBeNull();
  });
});
