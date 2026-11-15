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
// Wave climate criteria: UFC 4-152-07 Change 1 (2012), Figure 4-1 "Criteria for a 'good' wave
// climate in small craft harbors", adapted from Design Wave Climate in Small Craft Harbors
// (Northwest Hydraulic Consultants 1980). Significant wave height; "excellent" × 0.75,
// "moderate" × 1.25.
// ---------------------------------------------------------------------------

export type WaveEvent = 'oneYear' | 'fiftyYear';
export type WaveHeading = 'head' | 'beam';
export type WaveQuality = 'excellent' | 'good' | 'moderate';

export const QUALITY_FACTOR: Record<WaveQuality, number> = { excellent: 0.75, good: 1, moderate: 1.25 };

const FT = 0.3048;

/**
 * Highest allowed significant wave height, m, or null where UFC gives none ("Conditions not
 * likely to occur during this event": 50-year waves of 2 s or less).
 */
export function waveLimitM(event: WaveEvent, heading: WaveHeading, tp: number, quality: WaveQuality): number | null {
  const f = QUALITY_FACTOR[quality];
  if (event === 'oneYear') return (heading === 'head' ? 1 : 0.5) * FT * f;
  if (tp <= 2) return null;
  return (heading === 'head' ? 2 : 0.8) * FT * f;
}

/** Compass bearing (degrees clockwise from north) of a direction in local metres (x east, y north). */
export const bearingOf = (v: Vec2): number => ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;

/**
 * Head or beam seas for boats lying square to a pier whose axis has bearing `pierBearing`, for
 * waves coming from `fromBearing` (I86): head when the waves come within 45° of the boats' axis.
 */
export function headingFor(pierBearing: number, fromBearing: number): WaveHeading {
  const boatAxis = (pierBearing + 90) % 180;
  const diff = Math.abs((((fromBearing % 180) - boatAxis + 270) % 180) - 90);
  return diff <= 45 + 1e-9 ? 'head' : 'beam';
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

/** Inputs of the wave screening, stored in the project (D40). */
export interface WaveSettings {
  /** Longest straight-line fetch over water, m; null = not entered. */
  fetch: number | null;
  /** Compass bearing the wind and waves come from along that fetch, degrees. */
  fetchFrom: number;
  /** Mean depth along the fetch, m; null = the anchoring design depth. */
  fetchDepth: number | null;
  /** Extreme 10-m wind from that direction, once a year, m/s; null = not entered. */
  wind1: number | null;
  /** Extreme 10-m wind from that direction, once in 50 years, m/s; null = not entered. */
  wind50: number | null;
  /** Averaging time of those winds, s (600 = 10-min mean, 3600 = hourly mean). */
  windAveragingS: number;
  quality: WaveQuality;
  /** Position for the wind data, degrees; null = the centre of the site on the map. */
  location: { lat: number; lon: number } | null;
  /** D41: wind climate fetched for the site, or null. */
  climate: WindClimate | null;
}

/** Nothing entered yet; 10-min winds (FMI observations, Eurocode basic wind) and a "good" climate. */
export const DEFAULT_WAVES: WaveSettings = {
  fetch: null,
  fetchFrom: 0,
  fetchDepth: null,
  wind1: null,
  wind50: null,
  windAveragingS: 600,
  quality: 'good',
  location: null,
  climate: null,
};

export interface WaveAssessment {
  depth: number;
  /** Waves of each entered event. */
  events: { event: WaveEvent; wind: number; waves: WaveEstimate }[];
  /** Heading of the waves for each pier of the layout. */
  piers: { id: string; bearing: number; heading: WaveHeading }[];
  /** Checks for the headings that occur (both when there are no piers). */
  checks: WaveCheck[];
  advice: ProtectionAdvice;
}

/** The screening for the settings, the depth along the fetch and the piers' bearings. */
export function waveAssessment(s: WaveSettings, depth: number, piers: readonly { id: string; bearing: number }[]): WaveAssessment | null {
  if (s.fetch === null || !(s.fetch > 0)) return null;
  const fetch = s.fetch;
  const events = (
    [
      ['oneYear', s.wind1],
      ['fiftyYear', s.wind50],
    ] as const
  ).flatMap(([event, wind]) => (wind !== null && wind > 0 ? [{ event, wind, waves: designWaves(wind, s.windAveragingS, fetch, depth) }] : []));
  if (events.length === 0) return null;
  const withHeading = piers.map((p) => ({ ...p, heading: headingFor(p.bearing, s.fetchFrom) }));
  const headings: WaveHeading[] = withHeading.length > 0 ? [...new Set(withHeading.map((p) => p.heading))] : ['head', 'beam'];
  const checks: WaveCheck[] = [];
  for (const heading of (['head', 'beam'] as const).filter((h) => headings.includes(h))) {
    for (const e of events) {
      const limit = waveLimitM(e.event, heading, e.waves.tp, s.quality);
      checks.push({ event: e.event, heading, waves: e.waves, limit, ok: limit === null ? null : e.waves.hm0 <= limit + 1e-9 });
    }
  }
  return { depth, events, piers: withHeading, checks, advice: protectionAdvice(checks) };
}
