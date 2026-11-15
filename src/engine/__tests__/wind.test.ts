import { describe, expect, it } from 'vitest';
import { gumbelReturnValue, rankedPeak, sectorBearing, sectorOf, SPEED_CLASSES, windClimate } from '../wind';

describe('wind climate (D41), hand-calculated', () => {
  it('16 sectors of 22.5°, centred on north', () => {
    expect(sectorOf(0)).toBe(0);
    expect(sectorOf(11.2)).toBe(0);
    expect(sectorOf(11.25)).toBe(1);
    expect(sectorOf(348.75)).toBe(0);
    expect(sectorOf(359)).toBe(0);
    expect(sectorOf(180)).toBe(8);
    expect(sectorOf(-10)).toBe(0);
    expect(sectorBearing(4)).toBe(90);
  });

  it('Gumbel by the method of moments', () => {
    // Maxima 10, 12, 14 m/s: mean 12, s = 2; β = 2 √6 / π = 1.5594; μ = 12 − 0.5772 β = 11.100;
    // x50 = μ − β ln(−ln 0.98) = 11.100 + 1.5594 · 3.9019 = 17.18 m/s.
    expect(gumbelReturnValue([10, 12, 14], 50)).toBeCloseTo(17.1846, 3);
    expect(gumbelReturnValue([10], 50)).toBeNull();
  });

  it('independent peaks at least 48 h apart; the N-th highest', () => {
    const h = 3600;
    const times = [0, 1 * h, 100 * h, 200 * h];
    const speeds = [20, 19, 15, 10];
    expect(rankedPeak(times, speeds, 1)).toBe(20);
    // 19 m/s an hour after 20 m/s is the same storm.
    expect(rankedPeak(times, speeds, 2)).toBe(15);
    expect(rankedPeak(times, speeds, 3)).toBe(10);
    expect(rankedPeak(times, speeds, 4)).toBeNull();
  });

  it('rose, annual maxima, once a year and 50 years from a two-year record', () => {
    // 2020 and 2021, every 6 hours: wind from 90° at 5 m/s, with storms of 20 m/s (2020) and
    // 25 m/s (2021) from 90°, and 3 m/s from the north every other sample.
    const t0 = Date.UTC(2020, 0, 1) / 1000;
    const t1 = Date.UTC(2022, 0, 1) / 1000;
    const times: number[] = [];
    const speeds: number[] = [];
    const directions: number[] = [];
    let k = 0;
    for (let t = t0; t < t1; t += 6 * 3600, k++) {
      times.push(t);
      const north = k % 2 === 1;
      directions.push(north ? 0 : 90);
      speeds.push(north ? 3 : 5);
    }
    const storm2020 = times.findIndex((t) => t >= Date.UTC(2020, 5, 1) / 1000 && directions[times.indexOf(t)] === 90);
    const storm2021 = times.findIndex((t) => t >= Date.UTC(2021, 5, 1) / 1000 && directions[times.indexOf(t)] === 90);
    speeds[storm2020] = 20;
    speeds[storm2021] = 25;
    const c = windClimate(
      { times, speeds, directions },
      { source: 'test', requested: { lat: 60, lon: 25 }, cell: { lat: 60, lon: 25 }, startYear: 2020, endYear: 2021, fetchedOn: '2026-11-15', averagingS: 3600 },
    );
    expect(c.hours).toBe(times.length);
    const east = c.sectors[4]!;
    const north = c.sectors[0]!;
    // Half the samples from each direction; east: all but two in the 4–8 m/s class.
    expect(east.rose.reduce((a, b) => a + b, 0)).toBeCloseTo(0.5, 9);
    expect(north.rose[SPEED_CLASSES.indexOf(0)]).toBeCloseTo(0.5, 9);
    expect(east.rose[SPEED_CLASSES.indexOf(16)]).toBeCloseTo(2 / c.hours, 9);
    expect(east.annualMax).toEqual([20, 25]);
    // Once a year over 2 years: the 2nd highest independent peak = 20 m/s.
    expect(east.oneYear).toBe(20);
    // 50 years from maxima 20 and 25: mean 22.5, s = 3.536; β = 2.757; x50 = 31.67 m/s.
    expect(east.fiftyYear).toBeCloseTo(31.665, 2);
    // A sector without wind: maxima 0, 0.
    expect(c.sectors[8]!.annualMax).toEqual([0, 0]);
    expect(c.sectors[8]!.oneYear).toBeNull();
  });
});
