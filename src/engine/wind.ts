/**
 * Wind climate from an hourly wind record (DECISIONS D41): a wind rose and, per direction
 * sector, the wind exceeded on average once a year and the 50-year wind, for the wave
 * screening (D40). Pure functions; the record itself is fetched in src/state/openMeteo.ts.
 *
 *  - 16 sectors of 22.5°, centred on N, NNE, …: within one sector the direction varies by less
 *    than CEM's 15° limit for a fetch ("wind direction variations do not exceed 15 deg",
 *    EM 1110-2-1100 II-2-1.i(5)).
 *  - Once a year (I87): the N-th highest independent peak of the sector over N years (peaks at
 *    least 48 h apart), i.e. exceeded on average once a year. No fitting.
 *  - 50 years: Gumbel distribution fitted to the sector's annual maxima by the method of moments
 *    (mean = μ + γβ, variance = π²β²/6, γ = 0.5772…; F(x) = exp(−exp(−(x − μ)/β))), x_T =
 *    μ − β ln(−ln(1 − 1/T)).
 */

export const SECTORS = 16;
const SECTOR_DEG = 360 / SECTORS;
/** Lower bounds of the wind rose's speed classes, m/s (presentation only). */
export const SPEED_CLASSES = [0, 4, 8, 12, 16] as const;
/** Independent peaks are at least this far apart, s (I87). */
export const PEAK_SEPARATION_S = 48 * 3600;
const EULER_GAMMA = 0.5772156649;

/** Sector (0 = N) of a compass bearing. */
export const sectorOf = (bearing: number): number => Math.floor((((bearing % 360) + 360 + SECTOR_DEG / 2) % 360) / SECTOR_DEG) % SECTORS;
/** Centre bearing of a sector. */
export const sectorBearing = (sector: number): number => sector * SECTOR_DEG;

export interface WindRecord {
  /** Unix time, s (UTC). */
  times: number[];
  /** 10-m wind speed, m/s. */
  speeds: number[];
  /** Direction the wind comes from, degrees. */
  directions: number[];
}

export interface WindSector {
  /** Share of all hours with wind from this sector, per speed class. */
  rose: number[];
  /** Highest wind of each year from this sector, m/s. */
  annualMax: number[];
  /** Wind exceeded on average once a year, m/s; null with too few peaks. */
  oneYear: number | null;
  /** 50-year wind, m/s; null with fewer than two years. */
  fiftyYear: number | null;
}

/** What the tool keeps of a fetched record (D41): small enough to save in the project. */
export interface WindClimate {
  source: string;
  /** Requested position and the position of the grid cell used, degrees. */
  requested: { lat: number; lon: number };
  cell: { lat: number; lon: number };
  startYear: number;
  endYear: number;
  hours: number;
  /** Date the record was fetched, YYYY-MM-DD. */
  fetchedOn: string;
  /** Averaging time the record's winds are taken to represent, s (I88). */
  averagingS: number;
  sectors: WindSector[];
}

/** Gumbel (method of moments) return value for return period `years`; null with fewer than two values. */
export function gumbelReturnValue(maxima: readonly number[], years: number): number | null {
  const n = maxima.length;
  if (n < 2) return null;
  const mean = maxima.reduce((a, b) => a + b, 0) / n;
  const variance = maxima.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const beta = (Math.sqrt(6 * variance) / Math.PI);
  const mu = mean - EULER_GAMMA * beta;
  return mu - beta * Math.log(-Math.log(1 - 1 / years));
}

/**
 * The `rank`-th highest of the peaks that are at least `separation` seconds apart (greedy from
 * the highest down); null when there are fewer such peaks.
 */
export function rankedPeak(times: readonly number[], speeds: readonly number[], rank: number, separation = PEAK_SEPARATION_S): number | null {
  const order = speeds.map((_, i) => i).sort((a, b) => speeds[b]! - speeds[a]! || times[a]! - times[b]!);
  const accepted: number[] = [];
  for (const i of order) {
    const t = times[i]!;
    if (accepted.every((a) => Math.abs(a - t) >= separation)) {
      accepted.push(t);
      if (accepted.length === rank) return speeds[i]!;
    }
  }
  return null;
}

/** Wind climate of an hourly record over the calendar years `startYear`–`endYear`. */
export function windClimate(record: WindRecord, meta: Omit<WindClimate, 'sectors' | 'hours'>): WindClimate {
  const years = meta.endYear - meta.startYear + 1;
  const counts = Array.from({ length: SECTORS }, () => new Array<number>(SPEED_CLASSES.length).fill(0));
  const yearMax = Array.from({ length: SECTORS }, () => new Map<number, number>());
  const perSector = Array.from({ length: SECTORS }, () => ({ times: [] as number[], speeds: [] as number[] }));
  let hours = 0;
  record.times.forEach((t, i) => {
    const v = record.speeds[i];
    const d = record.directions[i];
    if (v === undefined || d === undefined || v === null || d === null || !Number.isFinite(v) || !Number.isFinite(d)) return;
    const year = new Date(t * 1000).getUTCFullYear();
    if (year < meta.startYear || year > meta.endYear) return;
    hours++;
    const s = sectorOf(d);
    let c = SPEED_CLASSES.length - 1;
    while (c > 0 && v < SPEED_CLASSES[c]!) c--;
    counts[s]![c]!++;
    yearMax[s]!.set(year, Math.max(yearMax[s]!.get(year) ?? 0, v));
    perSector[s]!.times.push(t);
    perSector[s]!.speeds.push(v);
  });
  const sectors: WindSector[] = counts.map((row, s) => {
    // A year without any wind from the sector has the maximum 0 (it counts in the fit).
    const annualMax = Array.from({ length: years }, (_, k) => yearMax[s]!.get(meta.startYear + k) ?? 0);
    return {
      rose: row.map((n) => (hours > 0 ? n / hours : 0)),
      annualMax,
      oneYear: rankedPeak(perSector[s]!.times, perSector[s]!.speeds, years),
      fiftyYear: gumbelReturnValue(annualMax, 50),
    };
  });
  return { ...meta, hours, sectors };
}
