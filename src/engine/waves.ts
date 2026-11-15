/**
 * Wind waves at the site (DECISIONS D40): a preliminary screening of whether the berths need
 * a wave attenuator or a breakwater. Not a wave study: refraction, diffraction, reflection,
 * swell from outside the fetch and ship wakes are not included (UFC 4-152-07 §4-3.5: "It is
 * imperative that a competent coastal engineer perform a wind wave analysis study").
 *
 * Method: USACE, Coastal Engineering Manual EM 1110-2-1100 Part II, Chapter 2 (Change 1,
 * 31 July 2003), §II-2-2.b "Wave prediction in simple situations" (docs/RESEARCH.md §10):
 *  - drag coefficient C_D = 0.001 (1.1 + 0.035 U10), friction velocity u* = U10 √C_D;
 *  - fetch-limited growth (II-2-36): g Hm0 / u*² = 4.13 × 10⁻² (g X / u*²)^½,
 *    g Tp / u* = 0.651 (g X / u*²)^⅓, X = the straight-line fetch;
 *  - fully developed limits (II-2-37): g Hm0 / u*² = 2.115 × 10², g Tp / u* = 2.398 × 10²;
 *  - shallow water (§(3)): deep-water growth, but Tp ≤ 9.78 (d / g)^½ (II-2-39); if the
 *    period is limited, the height is taken at the fetch that gives that period; and
 *    Hm0 ≤ 0.6 d;
 *  - time to become fetch-limited (II-2-35): t = 77.23 X^0.67 / (U10^0.34 g^0.33); the wind is
 *    taken as the extreme wind averaged over that time (§II-2-1.i(3)(b), Figure II-2-1).
 * Wind duration ratio U_t / U_3600 (CEM Figure II-2-1): for t > 3600 s the relation of CEM
 * Example Problem II-2-2, −0.15 log10 t + 1.5334; for t ≤ 3600 s the expression of the Shore
 * Protection Manual (1984), 1.277 + 0.296 tanh(0.9 log10(45 / t)), which gives the two values
 * the CEM text reads from the figure (1.09 at 5 min, Example II-2-1; 1.2 at 100 s, §(c)).
 */
import type { Vec2 } from './model';
import type { WindClimate } from './wind';

const G = 9.81;

/** CEM II-2: drag coefficient for the 10-m wind speed. */
export const dragCoefficient = (u10: number): number => 0.001 * (1.1 + 0.035 * u10);

/** Ratio of the extreme wind averaged over `t` seconds to the 1-hour wind (CEM Figure II-2-1). */
export function windDurationRatio(t: number): number {
  const s = Math.max(1, t);
  return s <= 3600 ? 1.277 + 0.296 * Math.tanh(0.9 * Math.log10(45 / s)) : -0.15 * Math.log10(s) + 1.5334;
}

/** An extreme wind averaged over `fromS` seconds converted to `toS` seconds. */
export const convertAveraging = (u: number, fromS: number, toS: number): number => (u * windDurationRatio(toS)) / windDurationRatio(fromS);

/** CEM II-2-35: time for waves crossing a fetch of `x` m under a wind of `u10` m/s to become fetch-limited, s. */
export const fetchLimitedTime = (x: number, u10: number): number => (77.23 * x ** 0.67) / (u10 ** 0.34 * G ** 0.33);

/** Wavelength by linear wave theory for period `t` s in water `d` m deep (L = gT²/2π · tanh(2πd/L)), m. */
export function wavelength(t: number, d: number): number {
  const deep = (G * t * t) / (2 * Math.PI);
  if (!(d > 0)) return deep;
  let l = deep;
  for (let i = 0; i < 100; i++) {
    const next = deep * Math.tanh((2 * Math.PI * d) / l);
    if (Math.abs(next - l) < 1e-9) return next;
    // Averaging the steps keeps the fixed-point iteration from oscillating in shallow water.
    l = (l + next) / 2;
  }
  return l;
}

export type WaveLimit = 'fetch' | 'fullyDeveloped' | 'depthPeriod' | 'depthHeight';

export interface WaveEstimate {
  /** Wind used, m/s (10 m, averaged over `averagingS`). */
  u10: number;
  /** Averaging time of that wind, s. */
  averagingS: number;
  /** Friction velocity, m/s. */
  ustar: number;
  /** Energy-based significant wave height, m. */
  hm0: number;
  /** Peak period, s. */
  tp: number;
  /** Wavelength at the peak period in the given depth, m. */
  wavelength: number;
  /** What limited the waves. */
  limit: WaveLimit;
}

/** CEM fetch-limited waves for a 10-m wind `u10` (m/s) over the straight fetch `x` (m) in water `d` (m) deep. */
export function cemWaves(u10: number, x: number, d: number): Omit<WaveEstimate, 'averagingS'> {
  const ustar = u10 * Math.sqrt(dragCoefficient(u10));
  if (!(u10 > 0) || !(x > 0)) return { u10, ustar, hm0: 0, tp: 0, wavelength: 0, limit: 'fetch' };
  const u2 = ustar * ustar;
  let xHat = (G * x) / u2;
  let limit: WaveLimit = 'fetch';
  let hHat = 4.13e-2 * Math.sqrt(xHat);
  let tHat = 0.651 * Math.cbrt(xHat);
  if (hHat >= 2.115e2 || tHat >= 2.398e2) {
    hHat = Math.min(hHat, 2.115e2);
    tHat = Math.min(tHat, 2.398e2);
    limit = 'fullyDeveloped';
  }
  let tp = (tHat * ustar) / G;
  let hm0 = (hHat * u2) / G;
  if (d > 0) {
    const tLimit = 9.78 * Math.sqrt(d / G);
    if (tp > tLimit) {
      // The fetch whose period is the limit (II-2-36 solved for X̂).
      tp = tLimit;
      xHat = ((tLimit * G) / ustar / 0.651) ** 3;
      hm0 = (4.13e-2 * Math.sqrt(xHat) * u2) / G;
      limit = 'depthPeriod';
    }
    if (hm0 > 0.6 * d) {
      hm0 = 0.6 * d;
      limit = 'depthHeight';
    }
  }
  return { u10, ustar, hm0, tp, wavelength: wavelength(tp, d), limit };
}

/**
 * Waves from an extreme wind `u` (m/s at 10 m) observed with averaging time `observedS` (s): the
 * wind is converted to the time the waves need to become fetch-limited over `x` (II-2-35,
 * which itself depends on the wind, so a few fixed-point steps), then CEM growth.
 */
export function designWaves(u: number, observedS: number, x: number, d: number): WaveEstimate {
  let t = fetchLimitedTime(x, u);
  let ut = convertAveraging(u, observedS, t);
  for (let i = 0; i < 20; i++) {
    const next = fetchLimitedTime(x, ut);
    if (Math.abs(next - t) < 0.5) break;
    t = next;
    ut = convertAveraging(u, observedS, t);
  }
  return { ...cemWaves(ut, x, d), averagingS: t };
}

// ---------------------------------------------------------------------------
// Wave climate criteria (D47). Significant wave height for the wave exceeded once a year and
// once in 50 years; "excellent" × 0.75, "moderate" × 1.25.
//  - 'as3962' (default): AS 3962-2001, Table 4.2 "Criteria for a 'good' wave climate in small
//    craft harbours" (adapted from Mercer, Isaacson & Mulcahy 1982): head seas > 2 s 0.6 / 0.3 m,
//    oblique seas > 2 s 0.4 / 0.3 m, beam seas > 2 s 0.25 / 0.15 m, head and beam seas < 2 s:
//    1-year 0.3 m, 50-year "Conditions not likely to occur during this event". Headings by
//    AS 3962 1.3.32–1.3.34: head within 22.5° of the boat's centre-line, beam within 22.5° of
//    abeam, oblique between. Oblique seas below 2 s are not in the table; they take the value
//    of head and beam seas below 2 s, which is the same for both (assumption, I90).
//  - 'ufc': UFC 4-152-07 Change 1 (2012), Figure 4-1 (head/beam only: 2 ft, 1 ft; 0.8 ft,
//    0.5 ft; below 2 s 1 ft and 0.5 ft for the 1-year wave), head within 45° (I86).
// ---------------------------------------------------------------------------

export type WaveEvent = 'oneYear' | 'fiftyYear';
export type WaveHeading = 'head' | 'oblique' | 'beam';
export type WaveQuality = 'excellent' | 'good' | 'moderate';
export type WaveCriteria = 'as3962' | 'ufc';

export const QUALITY_FACTOR: Record<WaveQuality, number> = { excellent: 0.75, good: 1, moderate: 1.25 };

const FT = 0.3048;

/** AS 3962-2001 Table 4.2, 'good' climate, m: [1-year, 50-year] for periods above 2 s; below 2 s 1-year 0.3 m, 50-year none. */
const AS3962_LIMITS: Record<WaveHeading, readonly [number, number]> = { head: [0.3, 0.6], oblique: [0.3, 0.4], beam: [0.15, 0.25] };
const AS3962_SHORT_ONE_YEAR = 0.3;

/**
 * Highest allowed significant wave height, m, or null where the criteria give none ("Conditions
 * not likely to occur during this event": 50-year waves of 2 s or less).
 */
export function waveLimitM(event: WaveEvent, heading: WaveHeading, tp: number, quality: WaveQuality, criteria: WaveCriteria = 'as3962'): number | null {
  const f = QUALITY_FACTOR[quality];
  if (criteria === 'ufc') {
    // UFC has head and beam seas only; oblique seas are judged as beam seas (the stricter).
    const head = heading === 'head';
    if (event === 'oneYear') return (head ? 1 : 0.5) * FT * f;
    if (tp <= 2) return null;
    return (head ? 2 : 0.8) * FT * f;
  }
  if (tp <= 2) return event === 'oneYear' ? AS3962_SHORT_ONE_YEAR * f : null;
  return AS3962_LIMITS[heading][event === 'oneYear' ? 0 : 1] * f;
}

/** Compass bearing (degrees clockwise from north) of a direction in local metres (x east, y north). */
export const bearingOf = (v: Vec2): number => ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;

/** Angle between waves from `fromBearing` and the axis of boats lying square to a pier of bearing `pierBearing`, 0–90°. */
export function angleToBoatAxis(pierBearing: number, fromBearing: number): number {
  const boatAxis = (pierBearing + 90) % 180;
  return Math.abs((((((fromBearing % 180) + 180) % 180) - boatAxis + 270) % 180) - 90);
}

/**
 * Heading of waves from `fromBearing` for boats lying square to a pier whose axis has bearing
 * `pierBearing`: AS 3962 (head ≤ 22.5° from the boats' axis, beam ≤ 22.5° from abeam, oblique
 * between) or UFC (head within 45°, otherwise beam; I86).
 */
export function headingFor(pierBearing: number, fromBearing: number, criteria: WaveCriteria = 'as3962'): WaveHeading {
  const diff = angleToBoatAxis(pierBearing, fromBearing);
  if (criteria === 'ufc') return diff <= 45 + 1e-9 ? 'head' : 'beam';
  if (diff <= 22.5 + 1e-9) return 'head';
  if (diff >= 67.5 - 1e-9) return 'beam';
  return 'oblique';
}

/** Marinetek: "The Marinetek Breakwaters without keels work best when the sea wave length is less than 18 m." */
export const FLOATING_ATTENUATOR_MAX_WAVELENGTH = 18;

export interface WaveCheck {
  event: WaveEvent;
  heading: WaveHeading;
  waves: WaveEstimate;
  /** Allowed Hm0, m, or null when the criteria give none. */
  limit: number | null;
  ok: boolean | null;
}

export type ProtectionAdvice = 'none' | 'floating' | 'fixed' | 'unknown';

/**
 * What the berths need (D40): none when every check passes; otherwise a floating attenuator
 * when the failing waves are shorter than Marinetek's 18 m, else a fixed breakwater.
 */
export function protectionAdvice(checks: readonly WaveCheck[]): ProtectionAdvice {
  const judged = checks.filter((c) => c.ok !== null);
  if (judged.length === 0) return 'unknown';
  const failing = judged.filter((c) => c.ok === false);
  if (failing.length === 0) return 'none';
  return failing.every((c) => c.waves.wavelength <= FLOATING_ATTENUATOR_MAX_WAVELENGTH + 1e-9) ? 'floating' : 'fixed';
}

// ---------------------------------------------------------------------------
// Direction sectors (D47): eight sectors of 45°, each with its own fetch (0 = no open water).
// ---------------------------------------------------------------------------

export const WAVE_SECTORS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type WaveSectorName = (typeof WAVE_SECTORS)[number];
export const WAVE_SECTOR_DEG = 360 / WAVE_SECTORS.length;
/** Centre bearing of a wave sector, degrees. */
export const waveSectorBearing = (k: number): number => k * WAVE_SECTOR_DEG;
/** Wave sector of a compass bearing. */
export const waveSectorOf = (bearing: number): number =>
  Math.floor((((bearing % 360) + 360 + WAVE_SECTOR_DEG / 2) % 360) / WAVE_SECTOR_DEG) % WAVE_SECTORS.length;

/** One direction sector of the wave screening. */
export interface WaveSectorInput {
  /** Straight-line fetch over open water, m; 0 = no fetch (no waves from this sector). */
  fetch: number;
  /** Mean depth along the fetch, m; null = the common depth. */
  depth: number | null;
  /** Winds from this sector (10 m, `windAveragingS`), m/s; null = from the wind climate or the common winds. */
  wind1: number | null;
  wind50: number | null;
}

export const emptySectors = (): WaveSectorInput[] => WAVE_SECTORS.map(() => ({ fetch: 0, depth: null, wind1: null, wind50: null }));

/** Inputs of the wave screening, stored in the project (D40, D47). */
export interface WaveSettings {
  /** Eight sectors N, NE, … NW (D47). */
  sectors: WaveSectorInput[];
  /** Common mean depth along the fetches, m; null = the anchoring design depth. */
  fetchDepth: number | null;
  /** Common extreme 10-m wind once a year, m/s, used where neither the sector nor the wind climate gives one. */
  wind1: number | null;
  /** Common extreme 10-m wind once in 50 years, m/s. */
  wind50: number | null;
  /** Averaging time of the entered winds, s (600 = 10-min mean, 3600 = hourly mean). */
  windAveragingS: number;
  quality: WaveQuality;
  /** Criteria set (D47); default AS 3962-2001 Table 4.2. */
  criteria: WaveCriteria;
  /** Position for the wind data, degrees; null = the centre of the site on the map. */
  location: { lat: number; lon: number } | null;
  /** D41: wind climate fetched for the site, or null. */
  climate: WindClimate | null;
}

/** Nothing entered yet; 10-min winds (FMI observations, Eurocode basic wind), a "good" climate, AS 3962 criteria. */
export const DEFAULT_WAVES: WaveSettings = {
  sectors: emptySectors(),
  fetchDepth: null,
  wind1: null,
  wind50: null,
  windAveragingS: 600,
  quality: 'good',
  criteria: 'as3962',
  location: null,
  climate: null,
};

/**
 * Extreme winds of a 45° wave sector from the 16-sector wind climate: the largest of the three
 * 22.5° sectors that overlap it (its centre and the two halves on either side). Conservative:
 * winds up to 33.75° off the centre count (assumption, I91).
 */
export function climateSectorWinds(climate: WindClimate, k: number): { oneYear: number | null; fiftyYear: number | null } {
  const n = climate.sectors.length;
  const step = n / WAVE_SECTORS.length;
  const idx = [-1, 0, 1].map((d) => (((k * step + d) % n) + n) % n);
  const max = (key: 'oneYear' | 'fiftyYear') => {
    const values = idx.map((i) => climate.sectors[i]?.[key]).filter((x): x is number => typeof x === 'number');
    return values.length === 0 ? null : Math.max(...values);
  };
  return { oneYear: max('oneYear'), fiftyYear: max('fiftyYear') };
}

export type WindSource = 'sector' | 'climate' | 'common';

/** The wind used for a sector and event: the sector's own entry, else the wind climate, else the common wind. */
export function sectorWind(s: WaveSettings, k: number, event: WaveEvent): { wind: number; averagingS: number; source: WindSource } | null {
  const sector = s.sectors[k];
  const own = event === 'oneYear' ? sector?.wind1 : sector?.wind50;
  if (own !== null && own !== undefined && own > 0) return { wind: own, averagingS: s.windAveragingS, source: 'sector' };
  if (s.climate) {
    const c = climateSectorWinds(s.climate, k)[event];
    if (c !== null && c > 0) return { wind: c, averagingS: s.climate.averagingS, source: 'climate' };
  }
  const common = event === 'oneYear' ? s.wind1 : s.wind50;
  if (common !== null && common > 0) return { wind: common, averagingS: s.windAveragingS, source: 'common' };
  return null;
}

export interface SectorAssessment {
  sector: number;
  bearing: number;
  fetch: number;
  depth: number;
  events: { event: WaveEvent; wind: number; source: WindSource; waves: WaveEstimate }[];
  /** Headings of these waves at the piers (all three when there are no piers). */
  headings: WaveHeading[];
  checks: WaveCheck[];
  /** 'exceeds' when any check fails, 'ok' when all judged checks pass, 'unknown' when none is judged. */
  status: 'ok' | 'exceeds' | 'unknown';
}

export interface WaveAssessment {
  criteria: WaveCriteria;
  /** Sectors with a fetch and at least one wind. */
  sectors: SectorAssessment[];
  /** Pier bearings and the heading of each sector's waves at each pier. */
  piers: { id: string; bearing: number; headings: Record<number, WaveHeading> }[];
  /** Sectors whose waves exceed the criteria. */
  bad: number[];
  checks: WaveCheck[];
  advice: ProtectionAdvice;
  /**
   * AS 3962 3.3.3 and 4.8.2.1: mooring piles between the boats of double berths may be needed
   * (1-year waves above 0.3 m, or 50-year head seas above 0.4 m).
   */
  doubleBerthPiles: boolean;
}

/** The screening for the settings, the anchoring design depth and the piers' bearings. */
export function waveAssessment(s: WaveSettings, designDepth: number, piers: readonly { id: string; bearing: number }[]): WaveAssessment | null {
  const commonDepth = s.fetchDepth ?? designDepth;
  const all: WaveHeading[] = s.criteria === 'ufc' ? ['head', 'beam'] : ['head', 'oblique', 'beam'];
  const sectors: SectorAssessment[] = [];
  s.sectors.forEach((sector, k) => {
    if (!(sector.fetch > 0)) return;
    const depth = sector.depth ?? commonDepth;
    const events = (['oneYear', 'fiftyYear'] as const).flatMap((event) => {
      const w = sectorWind(s, k, event);
      return w ? [{ event, wind: w.wind, source: w.source, waves: designWaves(w.wind, w.averagingS, sector.fetch, depth) }] : [];
    });
    if (events.length === 0) return;
    const bearing = waveSectorBearing(k);
    const headings = piers.length > 0 ? all.filter((h) => piers.some((p) => headingFor(p.bearing, bearing, s.criteria) === h)) : all;
    const checks: WaveCheck[] = [];
    for (const heading of headings) {
      for (const e of events) {
        const limit = waveLimitM(e.event, heading, e.waves.tp, s.quality, s.criteria);
        checks.push({ event: e.event, heading, waves: e.waves, limit, ok: limit === null ? null : e.waves.hm0 <= limit + 1e-9 });
      }
    }
    const judged = checks.filter((c) => c.ok !== null);
    const status = judged.length === 0 ? 'unknown' : judged.some((c) => c.ok === false) ? 'exceeds' : 'ok';
    sectors.push({ sector: k, bearing, fetch: sector.fetch, depth, events, headings, checks, status });
  });
  if (sectors.length === 0) return null;
  const checks = sectors.flatMap((x) => x.checks);
  const doubleBerthPiles = sectors.some((x) =>
    x.events.some((e) => (e.event === 'oneYear' && e.waves.hm0 > 0.3 + 1e-9) || (e.event === 'fiftyYear' && x.headings.includes('head') && e.waves.hm0 > 0.4 + 1e-9)),
  );
  return {
    criteria: s.criteria,
    sectors,
    piers: piers.map((p) => ({ ...p, headings: Object.fromEntries(sectors.map((x) => [x.sector, headingFor(p.bearing, x.bearing, s.criteria)])) })),
    bad: sectors.filter((x) => x.status === 'exceeds').map((x) => x.sector),
    checks,
    advice: protectionAdvice(checks),
    doubleBerthPiles,
  };
}
