import { describe, expect, it } from 'vitest';
import { archiveUrl, fetchWindHistory } from '../openMeteo';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('Open-Meteo wind history (D41)', () => {
  it('URL: ERA5, sea cell, m/s, unix time, both wind variables', () => {
    const url = new URL(archiveUrl(60.15, 24.95, 1996, 2000));
    expect(url.origin + url.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      latitude: '60.1500',
      longitude: '24.9500',
      start_date: '1996-01-01',
      end_date: '2000-12-31',
      hourly: 'wind_speed_10m,wind_direction_10m',
      wind_speed_unit: 'ms',
      timeformat: 'unixtime',
      models: 'era5',
      cell_selection: 'sea',
    });
  });

  it('fetches 5-year pieces, joins them, skips missing hours, keeps the grid cell', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const start = Number(new URL(url).searchParams.get('start_date')!.slice(0, 4));
      return json({ latitude: 60.25, longitude: 25.0, hourly: { time: [start, start + 1], wind_speed_10m: [5, null], wind_direction_10m: [90, 100] } });
    }) as typeof fetch;
    const r = await fetchWindHistory(60.15, 24.95, 1996, 2007, { fetchImpl });
    expect(urls.map((u) => new URL(u).searchParams.get('start_date'))).toEqual(['1996-01-01', '2001-01-01', '2006-01-01']);
    expect(new URL(urls[2]!).searchParams.get('end_date')).toBe('2007-12-31');
    expect(r.times).toEqual([1996, 2001, 2006]);
    expect(r.speeds).toEqual([5, 5, 5]);
    expect(r.cell).toEqual({ lat: 60.25, lon: 25 });
  });

  it('waits for retry-after on 429 and reports the API reason on errors', async () => {
    let calls = 0;
    const waits: number[] = [];
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return json({ error: true, reason: 'Minutely API request limit exceeded.' }, 429, { 'retry-after': '30' });
      return json({ latitude: 60, longitude: 25, hourly: { time: [1], wind_speed_10m: [4], wind_direction_10m: [10] } });
    }) as typeof fetch;
    const r = await fetchWindHistory(60, 25, 2020, 2021, { fetchImpl, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([30000]);
    expect(r.speeds).toEqual([4]);
    const failing = (async () => json({ error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' }, 400)) as typeof fetch;
    await expect(fetchWindHistory(60, 25, 2020, 2021, { fetchImpl: failing })).rejects.toThrow('Daily API request limit exceeded');
  });
});
