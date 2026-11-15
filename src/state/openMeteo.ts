/**
 * Hourly 10-m wind from the Open-Meteo Historical Weather API (DECISIONS D41): ERA5 reanalysis,
 * the grid cell on the sea nearest to the site. Free for non-commercial use (the owner's case,
 * D40), under 600 calls a minute and 10 000 a day; a request longer than 2 weeks counts as
 * several calls (4 weeks = 3.0), so the years are fetched in 5-year pieces and a "429 Too Many
 * Requests" answer waits for `retry-after`. Data CC BY 4.0: "Weather data by Open-Meteo.com".
 */
import type { WindRecord } from '../engine/wind';

export const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
/** Years per request. */
export const CHUNK_YEARS = 5;
const MAX_RETRIES = 3;
const MAX_WAIT_S = 75;

export function archiveUrl(lat: number, lon: number, startYear: number, endYear: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: `${startYear}-01-01`,
    end_date: `${endYear}-12-31`,
    hourly: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
    timezone: 'GMT',
    timeformat: 'unixtime',
    models: 'era5',
    cell_selection: 'sea',
  });
  return `${OPEN_METEO_ARCHIVE}?${q.toString()}`;
}

export interface FetchedWind extends WindRecord {
  cell: { lat: number; lon: number };
}

interface ArchiveResponse {
  latitude?: number;
  longitude?: number;
  error?: boolean;
  reason?: string;
  hourly?: { time?: number[]; wind_speed_10m?: (number | null)[]; wind_direction_10m?: (number | null)[] };
}

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  /** Waits `ms` milliseconds (replaceable in tests). */
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (done: number, total: number, waitingS?: number) => void;
  signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Hourly wind for the calendar years `startYear`–`endYear` at (lat, lon). Throws with the API's reason. */
export async function fetchWindHistory(lat: number, lon: number, startYear: number, endYear: number, options: FetchOptions = {}): Promise<FetchedWind> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const chunks: [number, number][] = [];
  for (let y = startYear; y <= endYear; y += CHUNK_YEARS) chunks.push([y, Math.min(endYear, y + CHUNK_YEARS - 1)]);
  const out: FetchedWind = { times: [], speeds: [], directions: [], cell: { lat, lon } };
  for (let k = 0; k < chunks.length; k++) {
    const [a, b] = chunks[k]!;
    options.onProgress?.(k, chunks.length);
    let body: ArchiveResponse | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetchImpl(archiveUrl(lat, lon, a, b), options.signal ? { signal: options.signal } : {});
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const wait = Math.min(MAX_WAIT_S, Number(response.headers.get('retry-after')) || 60);
        options.onProgress?.(k, chunks.length, wait);
        await sleep(wait * 1000);
        continue;
      }
      body = (await response.json()) as ArchiveResponse;
      if (!response.ok || body.error) throw new Error(body.reason ?? `Open-Meteo answered ${response.status}`);
      break;
    }
    const hourly = body?.hourly;
    if (!hourly?.time || !hourly.wind_speed_10m || !hourly.wind_direction_10m) throw new Error('Open-Meteo returned no hourly wind');
    hourly.time.forEach((t, i) => {
      const v = hourly.wind_speed_10m![i];
      const d = hourly.wind_direction_10m![i];
      if (v === null || v === undefined || d === null || d === undefined) return;
      out.times.push(t);
      out.speeds.push(v);
      out.directions.push(d);
    });
    if (body?.latitude !== undefined && body.longitude !== undefined) out.cell = { lat: body.latitude, lon: body.longitude };
  }
  options.onProgress?.(chunks.length, chunks.length);
  return out;
}
