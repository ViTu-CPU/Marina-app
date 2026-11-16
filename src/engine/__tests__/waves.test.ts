import { describe, expect, it } from 'vitest';
import type { WindClimate } from '../wind';
import {
  angleToBoatAxis,
  bearingOf,
  cemWaves,
  climateSectorWinds,
  emptySectors,
  sectorWind,
  WAVE_SECTORS,
  waveSectorBearing,
  waveSectorOf,
  type WaveSettings,
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

describe('wave climate criteria and the advice (D47)', () => {
  it('UFC 4-152-07 Figure 4-1: limits in metres, quality factors, no 50-year criterion for periods of 2 s or less', () => {
    expect(waveLimitM('oneYear', 'head', 1.5, 'good', 'ufc')).toBeCloseTo(0.3048, 9);
    expect(waveLimitM('oneYear', 'beam', 3, 'good', 'ufc')).toBeCloseTo(0.1524, 9);
    expect(waveLimitM('fiftyYear', 'head', 3, 'good', 'ufc')).toBeCloseTo(0.6096, 9);
    expect(waveLimitM('fiftyYear', 'beam', 3, 'good', 'ufc')).toBeCloseTo(0.2438, 4);
    expect(waveLimitM('fiftyYear', 'head', 1.9, 'good', 'ufc')).toBeNull();
    expect(waveLimitM('oneYear', 'head', 1, 'excellent', 'ufc')).toBeCloseTo(0.2286, 4);
    expect(waveLimitM('oneYear', 'head', 1, 'moderate', 'ufc')).toBeCloseTo(0.381, 4);
  });

  it('AS 3962-2001 Table 4.2 (the default): head 0.6 / 0.3, oblique 0.4 / 0.3, beam 0.25 / 0.15 m; below 2 s 0.3 m once a year', () => {
    expect(waveLimitM('fiftyYear', 'head', 3, 'good')).toBeCloseTo(0.6, 12);
    expect(waveLimitM('oneYear', 'head', 3, 'good')).toBeCloseTo(0.3, 12);
    expect(waveLimitM('fiftyYear', 'oblique', 3, 'good')).toBeCloseTo(0.4, 12);
    expect(waveLimitM('oneYear', 'oblique', 3, 'good')).toBeCloseTo(0.3, 12);
    expect(waveLimitM('fiftyYear', 'beam', 3, 'good')).toBeCloseTo(0.25, 12);
    expect(waveLimitM('oneYear', 'beam', 3, 'good')).toBeCloseTo(0.15, 12);
    // Short waves: 1-year 0.3 m for head and beam seas alike (oblique assumed the same, I90); no 50-year limit.
    for (const heading of ['head', 'oblique', 'beam'] as const) {
      expect(waveLimitM('oneYear', heading, 1.5, 'good')).toBeCloseTo(0.3, 12);
      expect(waveLimitM('fiftyYear', heading, 1.5, 'good')).toBeNull();
    }
    expect(waveLimitM('fiftyYear', 'beam', 3, 'moderate')).toBeCloseTo(0.3125, 12);
    expect(waveLimitM('fiftyYear', 'head', 3, 'excellent')).toBeCloseTo(0.45, 12);
  });

  it('bearings and headings: AS 3962 (22.5°) and UFC (45°)', () => {
    expect(bearingOf({ x: 0, y: 1 })).toBeCloseTo(0, 9);
    expect(bearingOf({ x: 1, y: 0 })).toBeCloseTo(90, 9);
    expect(bearingOf({ x: -1, y: -1 })).toBeCloseTo(225, 9);
    // Pier north–south: boats east–west; waves from the east are head seas, from the north beam seas.
    expect(headingFor(0, 90)).toBe('head');
    expect(headingFor(0, 270)).toBe('head');
    expect(headingFor(0, 0)).toBe('beam');
    expect(headingFor(0, 45)).toBe('oblique');
    expect(headingFor(30, 100)).toBe('head'); // 20° off the boat axis (120°)
    expect(headingFor(30, 170)).toBe('oblique'); // 50° off
    expect(headingFor(30, 30)).toBe('beam');
    expect(headingFor(0, 112.5)).toBe('head'); // exactly 22.5°
    expect(headingFor(0, 157.5)).toBe('beam'); // exactly 67.5°
    expect(headingFor(30, 100, 'ufc')).toBe('head');
    expect(headingFor(30, 170, 'ufc')).toBe('beam');
    expect(angleToBoatAxis(0, 315)).toBeCloseTo(45, 9);
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
});

describe('direction sectors (D47)', () => {
  const withFetch = (fetches: Record<number, number>, patch: Partial<WaveSettings> = {}): WaveSettings => ({
    ...structuredClone(DEFAULT_WAVES),
    sectors: emptySectors().map((x, k) => ({ ...x, fetch: fetches[k] ?? 0 })),
    ...patch,
  });

  it('sectors of 45° centred on N, NE, …', () => {
    expect(WAVE_SECTORS).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
    expect(waveSectorOf(0)).toBe(0);
    expect(waveSectorOf(22.4)).toBe(0);
    expect(waveSectorOf(22.6)).toBe(1);
    expect(waveSectorOf(337.6)).toBe(0);
    expect(waveSectorOf(-90)).toBe(6);
    expect(waveSectorBearing(3)).toBe(135);
  });

  it('nothing entered, or no wind: no assessment', () => {
    expect(waveAssessment(DEFAULT_WAVES, 4, [])).toBeNull();
    expect(waveAssessment(withFetch({ 2: 2000 }), 4, [])).toBeNull();
  });

  it('only sectors with a fetch; the common winds; each sector its own depth; several bad directions', () => {
    const s = withFetch({ 2: 2000, 4: 500, 6: 0 }, { wind1: 15, wind50: 22 });
    s.sectors[4]!.depth = 1;
    const a = waveAssessment(s, 4, [{ id: 'P1', bearing: 0 }])!;
    expect(a.sectors.map((x) => x.sector)).toEqual([2, 4]);
    expect(a.sectors[1]!.depth).toBe(1);
    // E: the same waves as the single-fetch test before D47 (2 km, 4 m, 22 m/s): Hm0 0.53 m, Tp 1.7 s.
    const e = a.sectors[0]!;
    expect(e.events.find((x) => x.event === 'fiftyYear')!.waves.hm0).toBeCloseTo(0.535, 3);
    expect(e.events.every((x) => x.source === 'common')).toBe(true);
    // Pier N–S: waves from E are head seas, from S beam seas.
    expect(e.headings).toEqual(['head']);
    expect(a.sectors[1]!.headings).toEqual(['beam']);
    expect(a.piers[0]!.headings).toEqual({ 2: 'head', 4: 'beam' });
    // 1-year waves from E (15 m/s, 2 km) exceed 0.3 m; from S (500 m, 1 m deep) beam seas exceed 0.15 m? Both are reported.
    expect(e.status).toBe('exceeds');
    expect(a.bad).toContain(2);
    expect(a.advice).toBe('floating');
  });

  it('winds: the sector’s own entry before the wind climate before the common wind; the climate takes the largest of three 22.5° sectors', () => {
    const sector = (one: number | null, fifty: number | null) => ({ rose: [0, 0, 0, 0, 0], annualMax: [], oneYear: one, fiftyYear: fifty });
    const climate: WindClimate = {
      source: 'test',
      requested: { lat: 60, lon: 25 },
      cell: { lat: 60, lon: 25 },
      startYear: 2000,
      endYear: 2029,
      hours: 1,
      fetchedOn: '2026-11-15',
      averagingS: 3600,
      sectors: Array.from({ length: 16 }, (_, i) => sector(10 + i * 0.1, i === 15 ? null : 20 + i * 0.1)),
    };
    // N (k = 0) overlaps 16-sectors 15, 0 and 1.
    expect(climateSectorWinds(climate, 0).oneYear).toBeCloseTo(11.5, 9);
    expect(climateSectorWinds(climate, 0).fiftyYear).toBeCloseTo(20.1, 9);
    // E (k = 2) overlaps 3, 4, 5.
    expect(climateSectorWinds(climate, 2).oneYear).toBeCloseTo(10.5, 9);
    const s = withFetch({ 0: 1000 }, { wind1: 30, wind50: 30, climate });
    expect(sectorWind(s, 0, 'oneYear')).toEqual({ wind: 11.5, averagingS: 3600, source: 'climate' });
    s.sectors[0]!.wind1 = 12;
    expect(sectorWind(s, 0, 'oneYear')).toEqual({ wind: 12, averagingS: 600, source: 'sector' });
    expect(sectorWind({ ...s, climate: null }, 0, 'fiftyYear')).toEqual({ wind: 30, averagingS: 600, source: 'common' });
  });

  it('winds from ERA5, the FMI station or the larger of the two compared as 10-min means (I108)', () => {
    const climate = (oneYear: number, averagingS: number): WindClimate => ({
      source: 'test',
      requested: { lat: 63, lon: 27 },
      cell: { lat: 63, lon: 27 },
      startYear: 2000,
      endYear: 2029,
      hours: 1,
      fetchedOn: '2026-11-16',
      averagingS,
      sectors: Array.from({ length: 16 }, () => ({ rose: [0, 0, 0, 0, 0], annualMax: [], oneYear, fiftyYear: oneYear + 5 })),
    });
    // ERA5 10 m/s as a 1-hour mean is about 10.6 m/s as a 10-min mean (windDurationRatio): an FMI 10.3 m/s is smaller, 11 m/s larger.
    const era5 = climate(10, 3600);
    expect(convertAveraging(10, 3600, 600)).toBeGreaterThan(10.3);
    expect(convertAveraging(10, 3600, 600)).toBeLessThan(11);
    const s = (station: WindClimate | null, climateChoice: 'era5' | 'station' | 'larger') => withFetch({ 0: 1000 }, { climate: era5, stationClimate: station, climateChoice });
    expect(sectorWind(s(climate(10.3, 600), 'larger'), 0, 'oneYear')).toEqual({ wind: 10, averagingS: 3600, source: 'climate' });
    expect(sectorWind(s(climate(11, 600), 'larger'), 0, 'oneYear')).toEqual({ wind: 11, averagingS: 600, source: 'station' });
    expect(sectorWind(s(climate(11, 600), 'era5'), 0, 'oneYear')).toEqual({ wind: 10, averagingS: 3600, source: 'climate' });
    expect(sectorWind(s(climate(9, 600), 'station'), 0, 'fiftyYear')).toEqual({ wind: 14, averagingS: 600, source: 'station' });
    // Only one climate: it is used whatever the choice.
    expect(sectorWind(s(null, 'station'), 0, 'oneYear')).toEqual({ wind: 10, averagingS: 3600, source: 'climate' });
  });

  it('without piers all three headings are checked; UFC has two', () => {
    const s = withFetch({ 1: 3000 }, { wind1: 12, wind50: 20 });
    expect(waveAssessment(s, 4, [])!.sectors[0]!.headings).toEqual(['head', 'oblique', 'beam']);
    expect(waveAssessment({ ...s, criteria: 'ufc' }, 4, [])!.sectors[0]!.headings).toEqual(['head', 'beam']);
  });

  it('AS 3962 mooring piles in double berths: 1-year waves over 0.3 m or 50-year head seas over 0.4 m', () => {
    expect(waveAssessment(withFetch({ 2: 300 }, { wind1: 8, wind50: 12 }), 4, [])!.doubleBerthPiles).toBe(false);
    expect(waveAssessment(withFetch({ 2: 5000 }, { wind1: 15, wind50: 22 }), 4, [])!.doubleBerthPiles).toBe(true);
  });
});
