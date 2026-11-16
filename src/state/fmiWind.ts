/**
 * Wind observations of FMI weather stations for the wave screening (DECISIONS I108): the stored
 * query fmi::observations::weather::hourly::multipointcoverage of FMI open data, parameters
 * WS_PT1H_MAX ("wind speed … maximum (10 minute average)" of the hour) and WD_PT1H_AVG (mean wind
 * direction of the hour). At most 744 hours per request ("No more than 744.000000 hours allowed",
 * the service's answer, 2026-11-16), so the years are fetched one calendar month at a time. The
 * service allows 20 000 requests a day and 600 per 5 minutes per user
 * (en.ilmatieteenlaitos.fi/open-data-manual-fmi-wfs-services, read 2026-11-16) and sends
 * `access-control-allow-origin: *`. Licence CC BY 4.0 (FMI open data).
 */
import type { WindRecord } from '../engine/wind';
import { tangentPlane } from './overpass';
import { FMI_WFS } from './waterLevels';

export const FMI_WIND_QUERY = 'fmi::observations::weather::hourly::multipointcoverage';
export const FMI_WIND_PARAMS = ['WS_PT1H_MAX', 'WD_PT1H_AVG'] as const;
export const FMI_WIND_SOURCE = 'FMI open data, hourly observations: WS_PT1H_MAX (highest 10-min mean wind of the hour), WD_PT1H_AVG';
/** Stations are searched within this distance of the site, m. */
export const STATION_SEARCH_RADIUS = 60000;
/** A year counts when at least this share of its hours has both wind speed and direction (Assumption). */
export const MIN_YEAR_COVERAGE = 0.8;
/** Requests running at the same time. */
const CONCURRENCY = 4;
const MAX_RETRIES = 3;

export interface WindStation {
  fmisid: string;
  name: string;
  position: { lat: number; lon: number };
  /** Distance from the site, m. */
  distance: number;
}

export interface MultipointRow {
  lat: number;
  lon: number;
  /** Unix time, s. */
  time: number;
  values: (number | null)[];
}

/** Stations (by fmisid: name and position) and the rows of a multipointcoverage answer. */
export function parseMultipoint(xml: string, parameters: number): { stations: Map<string, { name: string; lat: number; lon: number }>; rows: MultipointRow[] } {
  const stations = new Map<string, { name: string; lat: number; lon: number }>();
  for (const m of xml.matchAll(/<gml:Point gml:id="point-(\d+)"[^>]*>\s*<gml:name>([^<]*)<\/gml:name>\s*<gml:pos>([^<]*)<\/gml:pos>/g)) {
    const [lat, lon] = m[3]!.trim().split(/\s+/).map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon)) stations.set(m[1]!, { name: m[2]!.trim(), lat: lat!, lon: lon! });
  }
  const positions = /<gmlcov:positions>([\s\S]*?)<\/gmlcov:positions>/.exec(xml)?.[1]?.trim().split(/\s+/) ?? [];
  const values = /<gml:doubleOrNilReasonTupleList>([\s\S]*?)<\/gml:doubleOrNilReasonTupleList>/.exec(xml)?.[1]?.trim().split(/\s+/) ?? [];
  const rows: MultipointRow[] = [];
  const n = Math.min(Math.floor(positions.length / 3), Math.floor(values.length / parameters));
  for (let i = 0; i < n; i++) {
    const v = values.slice(i * parameters, (i + 1) * parameters).map((x) => {
      const y = Number(x);
      return Number.isFinite(y) ? y : null;
    });
    rows.push({ lat: Number(positions[3 * i]), lon: Number(positions[3 * i + 1]), time: Number(positions[3 * i + 2]), values: v });
  }
  return { stations, rows };
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** Waits `ms` milliseconds (replaceable in tests). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const queryUrl = (params: Record<string, string>) =>
  `${FMI_WFS}?${new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'getFeature', storedquery_id: FMI_WIND_QUERY, parameters: FMI_WIND_PARAMS.join(','), ...params }).toString()}`;

/** The search: every station in a box around the site with wind in the last two days. */
export function stationSearchUrl(lat: number, lon: number, now: Date): string {
  const dLat = STATION_SEARCH_RADIUS / 111000;
  const dLon = dLat / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours()));
  const start = new Date(end.getTime() - 48 * 3600 * 1000);
  return queryUrl({ bbox: [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((x) => x.toFixed(4)).join(','), starttime: iso(start), endtime: iso(end) });
}

/** One calendar month of a station: its first hour to its last (at most 744 hours). */
export function monthUrl(fmisid: string, year: number, month: number): string {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1) - 3600 * 1000);
  return queryUrl({ fmisid, starttime: iso(start), endtime: iso(end) });
}

async function getText(url: string, o: FetchOptions): Promise<string> {
  const sleep = o.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    const r = await (o.fetchImpl ?? fetch)(url, o.signal ? { signal: o.signal } : {});
    if (r.ok) return r.text();
    if ((r.status === 429 || r.status >= 500) && attempt < MAX_RETRIES) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    const body = await r.text().catch(() => '');
    const reason = /<ExceptionText>([^<]*)<\/ExceptionText>/.exec(body)?.[1];
    throw new Error(`FMI open data answered ${r.status}${reason ? `: ${reason}` : ''}`);
  }
}

/** FMI stations with wind observations within the search radius of (lat, lon), nearest first. */
export async function findWindStations(lat: number, lon: number, o: FetchOptions & { now?: Date } = {}): Promise<WindStation[]> {
  const xml = await getText(stationSearchUrl(lat, lon, o.now ?? new Date()), o);
  const { stations, rows } = parseMultipoint(xml, FMI_WIND_PARAMS.length);
  const key = (la: number, lo: number) => `${la.toFixed(4)},${lo.toFixed(4)}`;
  const withWind = new Set(rows.filter((r) => r.values[0] !== null).map((r) => key(r.lat, r.lon)));
  const plane = tangentPlane(lat, lon);
  return [...stations.entries()]
    .filter(([, s]) => withWind.has(key(s.lat, s.lon)))
    .map(([fmisid, s]): WindStation => {
      const v = plane.toLocal(s.lat, s.lon);
      return { fmisid, name: s.name, position: { lat: s.lat, lon: s.lon }, distance: Math.hypot(v.x, v.y) };
    })
    .filter((s) => s.distance <= STATION_SEARCH_RADIUS)
    .sort((a, b) => a.distance - b.distance || (a.fmisid < b.fmisid ? -1 : 1));
}

export interface StationWind extends WindRecord {
  /** Hours with both speed and direction, per calendar year. */
  hoursByYear: Record<number, number>;
}

/** Hourly wind of a station for the calendar years `startYear`–`endYear`, one request per month. */
export async function fetchStationWind(
  fmisid: string,
  startYear: number,
  endYear: number,
  o: FetchOptions & { onProgress?: (done: number, total: number) => void } = {},
): Promise<StationWind> {
  const months: [number, number][] = [];
  for (let y = startYear; y <= endYear; y++) for (let m = 1; m <= 12; m++) months.push([y, m]);
  const rows: { time: number; speed: number; direction: number }[] = [];
  let next = 0;
  let done = 0;
  o.onProgress?.(0, months.length);
  const worker = async () => {
    while (next < months.length) {
      const [y, m] = months[next++]!;
      const xml = await getText(monthUrl(fmisid, y, m), o);
      for (const r of parseMultipoint(xml, FMI_WIND_PARAMS.length).rows) {
        const [speed, direction] = r.values;
        if (speed !== null && speed !== undefined && direction !== null && direction !== undefined) rows.push({ time: r.time, speed, direction });
      }
      o.onProgress?.(++done, months.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, months.length) }, worker));
  rows.sort((a, b) => a.time - b.time);
  const hoursByYear: Record<number, number> = {};
  for (const r of rows) {
    const year = new Date(r.time * 1000).getUTCFullYear();
    hoursByYear[year] = (hoursByYear[year] ?? 0) + 1;
  }
  return { times: rows.map((r) => r.time), speeds: rows.map((r) => r.speed), directions: rows.map((r) => r.direction), hoursByYear };
}

/** Hours in a calendar year. */
const hoursIn = (year: number) => ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 8784 : 8760);

/**
 * The longest run of consecutive years in which at least `MIN_YEAR_COVERAGE` of the hours have
 * data (the latest run when two are equally long); null when no year has enough.
 */
export function completeYears(hoursByYear: Record<number, number>, startYear: number, endYear: number): { startYear: number; endYear: number } | null {
  let best: { startYear: number; endYear: number } | null = null;
  let runStart: number | null = null;
  for (let y = startYear; y <= endYear + 1; y++) {
    const ok = y <= endYear && (hoursByYear[y] ?? 0) >= MIN_YEAR_COVERAGE * hoursIn(y);
    if (ok && runStart === null) runStart = y;
    if (!ok && runStart !== null) {
      const run = { startYear: runStart, endYear: y - 1 };
      if (!best || run.endYear - run.startYear >= best.endYear - best.startYear) best = run;
      runStart = null;
    }
  }
  return best;
}
