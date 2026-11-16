/**
 * Floating breakwater proposal (DECISIONS D48): which of Marinetek's breakwater pontoons, if any,
 * brings the waves that exceed the criteria of the wave screening (D47) within them.
 *
 * Source: Marinetek brochures "Breakwater Pontoons 3300, 3800" and "K-series Breakwater 3300K,
 * 4300K, 5300K" (modification date 14.11.2014; marinetek.hr/en/brochures-and-specifications/,
 * read 2026-11-15; docs/RESEARCH.md §12). Each has a diagram "Wave attenuation capacity, Sheltered
 * sea conditions" giving the attenuation Ac (%) against the significant wave height Hs and the
 * wavelength L, which share one horizontal axis. The curves below were digitised from the
 * brochures' vector drawings at 400 dpi (about ±1 % of Ac, ±0.01 m of Hs, ±0.2 m of L).
 *
 * Use (assumptions, I93): Ac is read separately at the wave's Hs and at its L and the smaller
 * value is used; the transmitted wave height is Hs × (1 − Ac) (the brochures do not define Ac);
 * a wave beyond the end of a curve (higher or longer) is outside what the brochure shows, so that
 * product is not proposed for it; a wave below the start of a curve takes its first value. The
 * brochures also state the wavelength each type works best below: 18 m without keels, 26 m with.
 * A preliminary choice of product type only: the length, layout, mooring and the attenuation at
 * the site need the supplier's design (AS 3962 5.1.1 (c), (d)).
 */
import { distance, EPS } from './geometry';
import type { Breakwater, Site } from './model';
import type { WaveAssessment, WaveCheck } from './waves';

export type BreakwaterId = '3300BR' | '3800BR' | '3300K' | '4300K' | '5300K';

export interface BreakwaterModule {
  code: string;
  length: number;
  weightT: number;
}

export interface BreakwaterProduct {
  id: BreakwaterId;
  name: string;
  /** Width with fenders and concrete width, m. */
  width: number;
  concreteWidth: number;
  height: number;
  freeboard: number;
  keel: boolean;
  /** "work best when the sea wave length is less than …", m. */
  bestBelowWavelength: number;
  modules: BreakwaterModule[];
  /** Digitised attenuation curve: [Hs (m), L (m), Ac (%)], in order along the axis. */
  curve: readonly (readonly [number, number, number])[];
}

/** Marinetek's floating breakwaters, lightest per metre first. */
export const BREAKWATERS: readonly BreakwaterProduct[] = [
  {
    id: '3300BR',
    name: 'Marinetek Breakwater 3300',
    width: 3.3,
    concreteWidth: 3.0,
    height: 1.0,
    freeboard: 0.55,
    keel: false,
    bestBelowWavelength: 18,
    modules: [
      { code: 'M3316BR', length: 16.05, weightT: 20.9 },
      { code: 'M3320BR', length: 19.9, weightT: 26.0 },
    ],
    curve: [[0.19, 2.4, 84.9], [0.24, 3.2, 79.0], [0.28, 4.0, 76.1], [0.32, 4.8, 74.2], [0.36, 5.6, 72.5], [0.40, 6.4, 70.7], [0.44, 7.2, 69.1], [0.48, 8.0, 67.3], [0.53, 8.8, 65.6], [0.57, 9.6, 63.8], [0.61, 10.4, 61.7], [0.65, 11.2, 59.7], [0.69, 12.0, 57.4], [0.73, 12.8, 55.0], [0.78, 13.8, 52.0], [0.82, 14.6, 48.4], [0.86, 15.4, 44.6], [0.90, 16.2, 39.8], [0.94, 17.0, 33.6], [0.95, 17.4, 29.8], [0.97, 17.8, 25.0]],
  },
  {
    id: '3300K',
    name: 'Marinetek K-series Breakwater 3300K',
    width: 3.3,
    concreteWidth: 3.0,
    height: 1.8,
    freeboard: 0.55,
    keel: true,
    bestBelowWavelength: 26,
    modules: [
      { code: '3312BRK', length: 12.2, weightT: 20.9 },
      { code: '3316BRK', length: 16.05, weightT: 28.0 },
    ],
    curve: [[0.30, 4.4, 77.3], [0.34, 5.2, 75.6], [0.41, 6.5, 72.9], [0.48, 7.8, 70.3], [0.54, 9.1, 67.7], [0.61, 10.5, 65.1], [0.67, 11.8, 62.3], [0.74, 13.1, 59.1], [0.81, 14.4, 55.7], [0.88, 15.7, 51.8], [0.93, 17.0, 46.7], [0.99, 18.4, 40.0], [1.01, 19.0, 35.8], [1.04, 19.7, 30.7], [1.07, 20.5, 23.2]],
  },
  {
    id: '3800BR',
    name: 'Marinetek Breakwater 3800',
    width: 3.8,
    concreteWidth: 3.5,
    height: 1.2,
    freeboard: 0.61,
    keel: false,
    bestBelowWavelength: 18,
    modules: [
      { code: 'M3816BR', length: 16.05, weightT: 31.5 },
      { code: 'M3820BR', length: 19.9, weightT: 39.2 },
    ],
    curve: [[0.20, 2.5, 89.4], [0.24, 3.2, 84.4], [0.28, 4.0, 80.0], [0.32, 4.8, 77.8], [0.36, 5.6, 76.1], [0.40, 6.4, 74.9], [0.44, 7.2, 73.6], [0.48, 8.0, 72.3], [0.53, 8.8, 71.0], [0.57, 9.6, 69.7], [0.61, 10.4, 68.4], [0.65, 11.2, 67.1], [0.69, 12.0, 65.8], [0.73, 12.8, 64.5], [0.78, 13.8, 63.0], [0.82, 14.6, 61.5], [0.86, 15.4, 59.8], [0.90, 16.2, 58.1], [0.94, 17.0, 55.9], [0.97, 17.8, 53.0], [1.00, 18.6, 49.3], [1.04, 19.4, 44.9], [1.07, 20.2, 38.9], [1.10, 21.0, 30.2], [1.14, 21.9, 20.0]],
  },
  {
    id: '4300K',
    name: 'Marinetek K-series Breakwater 4300K',
    width: 4.3,
    concreteWidth: 4.0,
    height: 1.8,
    freeboard: 0.6,
    keel: true,
    bestBelowWavelength: 26,
    modules: [{ code: '4320BRK', length: 19.9, weightT: 41.1 }],
    curve: [[0.31, 4.5, 86.8], [0.38, 5.9, 85.3], [0.44, 7.2, 83.7], [0.51, 8.5, 82.0], [0.57, 9.8, 80.0], [0.64, 11.1, 78.0], [0.71, 12.4, 75.9], [0.78, 13.8, 73.6], [0.84, 15.1, 71.3], [0.91, 16.4, 68.8], [0.96, 17.7, 66.1], [1.01, 19.0, 63.2], [1.07, 20.3, 59.7], [1.12, 21.6, 55.3], [1.16, 23.0, 49.5], [1.20, 24.3, 41.1], [1.22, 24.9, 34.6], [1.24, 25.6, 26.5], [1.26, 26.2, 20.1]],
  },
  {
    id: '5300K',
    name: 'Marinetek K-series Breakwater 5300K',
    width: 5.3,
    concreteWidth: 5.0,
    height: 1.8,
    freeboard: 0.6,
    keel: true,
    bestBelowWavelength: 26,
    modules: [{ code: '5320BRK', length: 19.9, weightT: 52.4 }],
    curve: [[0.34, 5.1, 90.0], [0.41, 6.5, 88.9], [0.48, 7.8, 87.8], [0.54, 9.1, 86.7], [0.61, 10.5, 85.5], [0.67, 11.8, 84.1], [0.74, 13.1, 82.7], [0.81, 14.4, 81.2], [0.88, 15.7, 79.3], [0.93, 17.0, 77.3], [0.99, 18.4, 75.2], [1.04, 19.7, 72.5], [1.09, 21.0, 69.3], [1.14, 22.3, 65.1], [1.18, 23.6, 59.9], [1.22, 24.9, 53.6], [1.26, 26.2, 44.5], [1.28, 26.9, 37.3], [1.29, 27.4, 29.0]],
  },
];

/** Weight per metre of a product's longest module, t/m. */
export const weightPerMetre = (b: BreakwaterProduct): number => {
  const m = b.modules.reduce((a, x) => (x.length > a.length ? x : a));
  return m.weightT / m.length;
};

/** Linear interpolation of Ac along one column of the curve; null beyond its end. */
function along(curve: BreakwaterProduct['curve'], col: 0 | 1, x: number): number | null {
  const first = curve[0]!;
  if (x <= first[col]) return first[2];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]!;
    const b = curve[i]!;
    if (x <= b[col] + 1e-9) return a[2] + ((b[2] - a[2]) * (x - a[col])) / (b[col] - a[col]);
  }
  return null;
}

/** Attenuation (0–1) of a wave of height `hs` and length `l`: the smaller of the values read at Hs and at L; null beyond the curve. */
export function attenuation(b: BreakwaterProduct, hs: number, l: number): number | null {
  const byH = along(b.curve, 0, hs);
  const byL = along(b.curve, 1, l);
  if (byH === null || byL === null) return null;
  return Math.min(byH, byL) / 100;
}

export interface BreakwaterCheck {
  check: WaveCheck;
  /** Attenuation used, 0–1, or null when the wave is beyond the curve. */
  attenuation: number | null;
  /** Wave height behind the breakwater, m (null beyond the curve). */
  transmitted: number | null;
  ok: boolean;
}

export interface BreakwaterEvaluation {
  product: BreakwaterProduct;
  checks: BreakwaterCheck[];
  /** Every exceeded wave is within the curve and brought within its limit. */
  ok: boolean;
  /** Some exceeded wave is longer than the wavelength the brochure says the type works best below. */
  beyondBestWavelength: boolean;
}

export interface BreakwaterProposal {
  /** The lightest product that brings every exceeded wave within the criteria, or null. */
  proposed: BreakwaterProduct | null;
  evaluations: BreakwaterEvaluation[];
}

/**
 * The proposal for the checks that fail in a wave assessment; null when nothing fails. A product
 * passes when every failing check's transmitted height is within its limit.
 */
export function breakwaterProposal(assessment: WaveAssessment | null): BreakwaterProposal | null {
  const failing = assessment?.checks.filter((c) => c.ok === false && c.limit !== null) ?? [];
  if (failing.length === 0) return null;
  const evaluations = BREAKWATERS.map((product): BreakwaterEvaluation => {
    const checks = failing.map((check): BreakwaterCheck => {
      const a = attenuation(product, check.waves.hm0, check.waves.wavelength);
      const transmitted = a === null ? null : check.waves.hm0 * (1 - a);
      return { check, attenuation: a, transmitted, ok: transmitted !== null && transmitted <= check.limit! + 1e-9 };
    });
    return {
      product,
      checks,
      ok: checks.every((c) => c.ok),
      beyondBestWavelength: failing.some((c) => c.waves.wavelength > product.bestBelowWavelength + 1e-9),
    };
  });
  return { proposed: evaluations.find((e) => e.ok && !e.beyondBestWavelength)?.product ?? evaluations.find((e) => e.ok)?.product ?? null, evaluations };
}

/** D58: the product of a drawn breakwater; an unknown id takes the lightest type. */
export const breakwaterProductOf = (b: Pick<Breakwater, 'product'>): BreakwaterProduct => BREAKWATERS.find((x) => x.id === b.product) ?? BREAKWATERS[0]!;

/** D58: the site's breakwaters with a length. */
export const breakwatersOf = (site: Site): Breakwater[] => (site.breakwaters ?? []).filter((b) => distance(b.start, b.end) > EPS);

/** D58: the type a new breakwater gets: the one the wave screening proposes, else the lightest. */
export const defaultBreakwaterProduct = (proposal: BreakwaterProposal | null): BreakwaterId => proposal?.proposed?.id ?? BREAKWATERS[0]!.id;

/**
 * D58, I106: the modules of a drawn breakwater: the combination of the product's module lengths
 * whose total is nearest to the drawn length (ties: fewer modules, then more long ones), longest
 * first. A breakwater is a line of modules, so it may end a little short of or beyond the drawing.
 */
export function breakwaterModules(length: number, product: BreakwaterProduct): BreakwaterModule[] {
  if (!(length > 0)) return [];
  const mods = [...product.modules].sort((a, b) => b.length - a.length);
  const longest = mods[0]!;
  const shortest = mods[mods.length - 1]!;
  const maxCount = Math.ceil(length / shortest.length) + 1;
  const found: { best: { counts: number[]; diff: number; n: number } | null } = { best: null };
  const counts = new Array<number>(mods.length).fill(0);
  const visit = (i: number, total: number, n: number) => {
    if (i === mods.length) {
      if (n === 0) return;
      const diff = Math.abs(total - length);
      const b = found.best;
      const better = !b || diff < b.diff - 1e-6 || (Math.abs(diff - b.diff) <= 1e-6 && (n < b.n || (n === b.n && counts[0]! > b.counts[0]!)));
      if (better) found.best = { counts: [...counts], diff, n };
      return;
    }
    for (let c = 0; n + c <= maxCount && total + c * mods[i]!.length <= length + longest.length; c++) {
      counts[i] = c;
      visit(i + 1, total + c * mods[i]!.length, n + c);
    }
    counts[i] = 0;
  };
  visit(0, 0, 0);
  const chosen = found.best;
  return chosen ? mods.flatMap((m, i) => new Array<BreakwaterModule>(chosen.counts[i]!).fill(m)) : [];
}

/** D58: joint positions of a breakwater's modules along it from its first end, m. */
export function breakwaterJoints(length: number, product: BreakwaterProduct): number[] {
  const out: number[] = [];
  let at = 0;
  const modules = breakwaterModules(length, product);
  for (let i = 0; i + 1 < modules.length; i++) {
    at += modules[i]!.length;
    if (at < length - 0.05) out.push(at);
  }
  return out;
}
