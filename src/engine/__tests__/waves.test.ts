import { describe, expect, it } from 'vitest';
import {
  bearingOf,
  cemWaves,
  convertAveraging,
  DEFAULT_WAVES,
  designWaves,
  dragCoefficient,
  fetchLimitedTime,
  headingFor,
  protectionAdvice,
  waveAssessment,
  waveLimitM,
  wavelength,
  windDurationRatio,
  type WaveCheck,
} from '../waves';

describe('CEM wave growth (EM 1110-2-1100 Part II-2), hand-calculated', () => {
  it('drag coefficient and fetch-limited growth, deep water', () => {
    // U10 = 15 m/s: C_D = 0.001 (1.1 + 0.525) = 0.001625, u* = 15 √0.001625 = 0.6047 m/s.
    expect(dragCoefficient(15)).toBeCloseTo(0.001625, 12);
    const w = cemWaves(15, 10000, 100);
    expect(w.ustar).toBeCloseTo(0.6047, 4);
    // X̂ = 9.81 · 10 000 / 0.6047² = 268 280; Hm0 = 0.0413 √X̂ · u*² / g = 0.797 m;
    // Tp = 0.651 X̂^⅓ · u* / g = 2.59 s.
    expect(w.hm0).toBeCloseTo(0.797, 3);
    expect(w.tp).toBeCloseTo(2.588, 3);
    expect(w.limit).toBe('fetch');
  });

  it('Example Problem II-2-7: 15 m/s, 10 km, 3 m deep — the period limit 5.4 s does not apply', () => {
    // CEM reads Tp ≈ 2.7 s and Hm0 ≈ 1.0 m from its nomograms; the equations give 2.6 s and 0.8 m.
    const w = cemWaves(15, 10000, 3);
    expect(9.78 * Math.sqrt(3 / 9.81)).toBeCloseTo(5.41, 2);
    expect(w.tp).toBeCloseTo(2.588, 3);
    expect(w.hm0).toBeCloseTo(0.797, 3);
    expect(w.limit).toBe('fetch');
  });

  it('Example Problem II-2-8: 25 m/s, 50 km, 1.6 m deep — period limit 4.0 s at a 20 km fetch, then 0.6 d', () => {
    // Deep-water Tp = 5.4 s > 9.78 √(1.6/9.81) = 3.95 s; the fetch with that period:
    // X̂ = (3.95 · 9.81 / 1.111 / 0.651)³ → X = 19.3 km (CEM: "a fetch of 20 km"), Hm0 = 2.04 m
    // (CEM: 2.1 m), above 0.6 · 1.6 = 0.96 m. (CEM prints 0.8 m as the final answer, which is
    // not 0.6 times the depth; the rule it states is used.)
    const w = cemWaves(25, 50000, 1.6);
    expect(w.tp).toBeCloseTo(3.95, 2);
    expect(w.hm0).toBeCloseTo(0.96, 9);
    expect(w.limit).toBe('depthHeight');
    const ustar = 25 * Math.sqrt(dragCoefficient(25));
    const xHat = ((w.tp * 9.81) / ustar / 0.651) ** 3;
    expect((xHat * ustar * ustar) / 9.81 / 1000).toBeCloseTo(19.3, 1);
    expect((4.13e-2 * Math.sqrt(xHat) * ustar * ustar) / 9.81).toBeCloseTo(2.04, 2);
  });

  it('fully developed limit', () => {
    // 10 m/s over 10 000 km: Hm0 capped at 211.5 u*²/g.
    const w = cemWaves(10, 1e7, 1000);
    const ustar = 10 * Math.sqrt(dragCoefficient(10));
    expect(w.limit).toBe('fullyDeveloped');
    expect(w.hm0).toBeCloseTo((211.5 * ustar * ustar) / 9.81, 9);
  });

  it('wind duration ratio (CEM Figure II-2-1) and the time to become fetch-limited (II-2-35)', () => {
    // The CEM text: 5 min ≈ 1.09 (Example II-2-1), 100 s ≈ 1.2 (§II-2-1.a(c)); 90 min / 3 h = 1.048 (Example II-2-2).
    expect(windDurationRatio(300)).toBeCloseTo(1.09, 2);
    expect(windDurationRatio(100)).toBeCloseTo(1.19, 2);
    expect(windDurationRatio(5400) / windDurationRatio(10800)).toBeCloseTo(1.049, 3); // CEM rounds to 1.048
    // 10-min wind to 1-hour: 22 · R(3600) / R(600) = 22 · 0.9997 / 1.0500 = 20.94 m/s.
    expect(convertAveraging(22, 600, 3600)).toBeCloseTo(20.94, 2);
    // 10 km, 19.9 m/s: 77.23 · 10 000^0.67 / (19.9^0.34 · 9.81^0.33) = 6 294 s = 105 min
    // (CEM Example II-2-2 reads about 90 min from Figure II-2-3).
    expect(fetchLimitedTime(10000, 19.9) / 60).toBeCloseTo(104.9, 1);
  });

  it('wavelength by linear theory', () => {
    // Deep water: 9.81 · 2² / 2π = 6.245 m; shallow 4 s in 1.6 m: ≈ T √(g d) = 15.8 m, exact 14.8 m.
    expect(wavelength(2, 100)).toBeCloseTo(6.245, 3);
    const l = wavelength(4, 1.6);
    expect(l).toBeCloseTo(((9.81 * 16) / (2 * Math.PI)) * Math.tanh((2 * Math.PI * 1.6) / l), 6);
    expect(l).toBeCloseTo(14.78, 2);
  });

  it('design waves: the 10-min wind converted to the fetch-limited duration', () => {
    // 22 m/s (10 min) over 2 km in 4 m: t ≈ 35 min, U = 22 · R(2 097 s) / R(600 s) = 21.1 m/s,
    // Hm0 = 0.53 m, Tp = 1.7 s, L = 4.7 m.
    const w = designWaves(22, 600, 2000, 4);
    expect(w.averagingS / 60).toBeCloseTo(35, 0);
    expect(w.u10).toBeCloseTo(21.14, 2);
    expect(w.hm0).toBeCloseTo(0.535, 3);
    expect(w.tp).toBeCloseTo(1.73, 2);
    expect(w.wavelength).toBeCloseTo(4.69, 2);
  });
});

describe('wave climate criteria (UFC 4-152-07 Figure 4-1) and the advice', () => {
  it('limits in metres, quality factors, no 50-year criterion for periods of 2 s or less', () => {
    expect(waveLimitM('oneYear', 'head', 1.5, 'good')).toBeCloseTo(0.3048, 9);
    expect(waveLimitM('oneYear', 'beam', 3, 'good')).toBeCloseTo(0.1524, 9);
    expect(waveLimitM('fiftyYear', 'head', 3, 'good')).toBeCloseTo(0.6096, 9);
    expect(waveLimitM('fiftyYear', 'beam', 3, 'good')).toBeCloseTo(0.2438, 4);
    expect(waveLimitM('fiftyYear', 'head', 1.9, 'good')).toBeNull();
    expect(waveLimitM('oneYear', 'head', 1, 'excellent')).toBeCloseTo(0.2286, 4);
    expect(waveLimitM('oneYear', 'head', 1, 'moderate')).toBeCloseTo(0.381, 4);
  });

  it('bearings and head or beam seas (I86)', () => {
    expect(bearingOf({ x: 0, y: 1 })).toBeCloseTo(0, 9);
    expect(bearingOf({ x: 1, y: 0 })).toBeCloseTo(90, 9);
    expect(bearingOf({ x: -1, y: -1 })).toBeCloseTo(225, 9);
    // Pier north–south: boats east–west; waves from the east are head seas, from the north beam seas.
    expect(headingFor(0, 90)).toBe('head');
    expect(headingFor(0, 270)).toBe('head');
    expect(headingFor(0, 0)).toBe('beam');
    expect(headingFor(30, 100)).toBe('head'); // 20° off the boat axis (120°)
    expect(headingFor(30, 170)).toBe('beam'); // 50° off
  });

  it('advice: none, floating (waves shorter than 18 m), fixed, unknown', () => {
    const check = (ok: boolean | null, l: number): WaveCheck => ({
      event: 'oneYear',
      heading: 'head',
      limit: ok === null ? null : 0.3,
      ok,
      waves: { u10: 10, averagingS: 600, ustar: 0.4, hm0: 0.4, tp: 2, wavelength: l, limit: 'fetch' },
    });
    expect(protectionAdvice([check(true, 5)])).toBe('none');
    expect(protectionAdvice([check(false, 17.9), check(true, 30)])).toBe('floating');
    expect(protectionAdvice([check(false, 18.1)])).toBe('fixed');
    expect(protectionAdvice([check(null, 5)])).toBe('unknown');
  });

  it('assessment: entered events, pier headings, checks for the headings that occur', () => {
    expect(waveAssessment(DEFAULT_WAVES, 4, [])).toBeNull();
    const s = { ...DEFAULT_WAVES, fetch: 2000, fetchFrom: 90, wind1: 15, wind50: 22 };
    const a = waveAssessment(s, 4, [{ id: 'P1', bearing: 0 }])!;
    expect(a.piers).toEqual([{ id: 'P1', bearing: 0, heading: 'head' }]);
    expect(a.events.map((e) => e.event)).toEqual(['oneYear', 'fiftyYear']);
    expect(a.checks.every((c) => c.heading === 'head')).toBe(true);
    // 50 years: Hm0 0.53 m, Tp 1.7 s ≤ 2 s → no criterion; 1 year (15 m/s): above 0.30 m?
    const one = a.checks.find((c) => c.event === 'oneYear')!;
    expect(one.waves.hm0).toBeGreaterThan(0.3048);
    expect(one.ok).toBe(false);
    expect(a.checks.find((c) => c.event === 'fiftyYear')!.ok).toBeNull();
    expect(a.advice).toBe('floating');
    // Without piers both headings are checked.
    expect(new Set(waveAssessment(s, 4, [])!.checks.map((c) => c.heading))).toEqual(new Set(['head', 'beam']));
  });
});
