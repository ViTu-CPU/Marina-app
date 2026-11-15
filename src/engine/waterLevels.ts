/**
 * Water levels at the site (DECISIONS D50): characteristic levels of a nearby gauge and the high
 * and low water of the anchoring plan from them. Pure functions; the data are fetched in
 * src/state/waterLevels.ts (FMI for the sea, SYKE for lakes and rivers).
 *
 * The Finnish hydrological characteristic levels (SYKE's naming): HW highest, MHW mean of the
 * annual maxima, MW mean, MNW mean of the annual minima, NW lowest, over a period. The anchoring
 * plan's design depth is taken at MW (I95): high water = HW − MW and low water = MW − NW (the
 * extremes, for chain lengths and the gangway slope), the normal range MHW − MW and MW − MNW (for
 * the stern-buoy check, Båtunionen's "normal högvattenyta").
 */

/** Characteristic levels, m, in the gauge's own datum. */
export interface CharacteristicLevels {
  hw: number;
  mhw: number;
  mw: number;
  mnw: number;
  nw: number;
}

/** A gauge's levels as kept in the project (D50). */
export interface WaterLevelInfo {
  /** 'fmi' = FMI mareograph (sea), 'syke' = SYKE water-level station (lake or river). */
  source: 'fmi' | 'syke';
  station: string;
  /** Water body named by the source, if any. */
  waterBody: string | null;
  position: { lat: number; lon: number };
  /** Distance from the site, m. */
  distance: number;
  /** Calendar years the levels cover. */
  startYear: number;
  endYear: number;
  levels: CharacteristicLevels;
  /** Date of the lookup, YYYY-MM-DD. */
  fetchedOn: string;
}

/** Fewer days than this in a year and its maximum and minimum are not used (I95). */
export const MIN_DAYS_PER_YEAR = 300;

/**
 * Characteristic levels of daily values (`time` ISO date, `value` in the gauge's unit) over the
 * calendar years `startYear`–`endYear`, in the same unit; null when no year is complete enough.
 * MW is the mean of all days in the period; MHW and MNW the means of the maxima and minima of
 * the years with at least `MIN_DAYS_PER_YEAR` days.
 */
export function characteristicLevels(daily: readonly { time: string; value: number }[], startYear: number, endYear: number): (CharacteristicLevels & { years: number }) | null {
  const byYear = new Map<number, number[]>();
  let sum = 0;
  let n = 0;
  for (const d of daily) {
    const year = Number(d.time.slice(0, 4));
    if (!(year >= startYear && year <= endYear) || !Number.isFinite(d.value)) continue;
    const list = byYear.get(year) ?? [];
    list.push(d.value);
    byYear.set(year, list);
    sum += d.value;
    n++;
  }
  const complete = [...byYear.values()].filter((v) => v.length >= MIN_DAYS_PER_YEAR);
  if (complete.length === 0 || n === 0) return null;
  const maxima = complete.map((v) => Math.max(...v));
  const minima = complete.map((v) => Math.min(...v));
  const all = [...byYear.values()].flat();
  return {
    hw: Math.max(...all),
    mhw: maxima.reduce((a, b) => a + b, 0) / maxima.length,
    mw: sum / n,
    mnw: minima.reduce((a, b) => a + b, 0) / minima.length,
    nw: Math.min(...all),
    years: complete.length,
  };
}

/**
 * High and low water of the anchoring plan from characteristic levels (design depth at MW), m, to
 * 0.1 m (CLAUDE.md): the extremes rounded up (longer chains, steeper gangway), the normal range to
 * the nearest 0.1 m.
 */
export function anchoringLevels(l: CharacteristicLevels): { highWater: number; lowWater: number; normalHighWater: number; normalLowWater: number } {
  const up = (x: number) => Math.max(0, Math.ceil(x * 10 - 1e-9) / 10);
  const near = (x: number) => Math.max(0, Math.round(x * 10) / 10);
  return { highWater: up(l.hw - l.mw), lowWater: up(l.mw - l.nw), normalHighWater: near(l.mhw - l.mw), normalLowWater: near(l.mw - l.mnw) };
}
