/**
 * Piers built from pontoon modules (DECISIONS D44, I89): a pier's length is a sum of the module
 * lengths of its series, as many of the longest module as fit. Pure functions.
 */

/** Pier pontoon series the user can pick: width with fenders and module lengths, m. */
export interface PierSeriesPreset {
  id: string;
  name: string;
  width: number;
  lengths: number[];
}

/**
 * Marinetek series (brochures, modification date 14.11.2014, marinetek.hr, read 2026-11-15;
 * docs/RESEARCH.md §9.12, §12). 'free' builds piers of any length (the generator's own length).
 */
export const PIER_SERIES: readonly PierSeriesPreset[] = [
  { id: 'premier2700', name: 'Marinetek Premier 2700', width: 2.7, lengths: [19.9, 16.05, 12.2] },
  { id: 'premier3300', name: 'Marinetek Premier 3300', width: 3.3, lengths: [19.9, 16.05, 12.2] },
  { id: 'hd2700', name: 'Marinetek Heavy Duty 2700', width: 2.7, lengths: [14.92, 11.92] },
  { id: 'hd3300', name: 'Marinetek Heavy Duty 3300', width: 3.3, lengths: [14.92, 11.92] },
  { id: 'ac2400', name: 'Marinetek All-Concrete 2400', width: 2.4, lengths: [14.92, 11.92, 8.92] },
  { id: 'ac3000', name: 'Marinetek All-Concrete 3000', width: 3.0, lengths: [14.92, 11.92, 8.92] },
  { id: 'free', name: 'Free length (no modules)', width: 3.0, lengths: [] },
];

export const DEFAULT_PIER_SERIES = 'premier2700';

const EPS = 1e-6;

/** Module lengths of a combination, longest first. */
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Every combination of the module lengths up to `max` m (counts per length), as sorted lists, longest first. */
function combinations(lengths: readonly number[], max: number): number[][] {
  const sorted = [...new Set(lengths.filter((l) => l > 0))].sort((a, b) => b - a);
  const out: number[][] = [];
  const walk = (i: number, acc: number[], total: number) => {
    if (i === sorted.length) {
      if (acc.length > 0) out.push(acc);
      return;
    }
    const l = sorted[i]!;
    for (let n = 0; total + n * l <= max + EPS; n++) walk(i + 1, [...acc, ...Array<number>(n).fill(l)], total + n * l);
  };
  walk(0, [], 0);
  return out;
}

/** Fewer modules first, then more of the longer ones. */
function preferred(a: number[], b: number[]): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i]! - a[i]!;
  return 0;
}

/**
 * The modules of a pier that should be `need` m long and may be at most `max` m: the shortest
 * combination at least `need` m and at most `max` m; when none, the longest combination not
 * longer than `need` m. Ties: fewer modules, then longer ones. Null when not even the shortest
 * module fits in `max`.
 */
export function moduleCombination(need: number, max: number, lengths: readonly number[]): number[] | null {
  const all = combinations(lengths, max);
  if (all.length === 0) return null;
  const up = all.filter((c) => sum(c) >= need - EPS);
  if (up.length > 0) {
    const best = Math.min(...up.map(sum));
    return up.filter((c) => sum(c) <= best + EPS).sort(preferred)[0]!;
  }
  const best = Math.max(...all.map(sum));
  return all.filter((c) => sum(c) >= best - EPS).sort(preferred)[0]!;
}

/** Total length of a combination, m (joint gaps of a few centimetres are not counted, I89). */
export const combinationLength = (modules: readonly number[]): number => sum(modules);

/**
 * The modules a pier of `length` m is built from: the exact combination when there is one (within
 * 5 cm), else the shortest that covers it. Empty without module lengths.
 */
export function pierModules(length: number, lengths: readonly number[]): number[] {
  if (lengths.length === 0 || !(length > 0)) return [];
  return moduleCombination(length - 0.05, Math.max(length + 0.05, length * 2), lengths) ?? [];
}

/** Positions of the joints between the modules along a pier from its shore end, m (longest modules at the shore). */
export function jointPositions(length: number, lengths: readonly number[]): number[] {
  const modules = pierModules(length, lengths);
  const out: number[] = [];
  let at = 0;
  for (let i = 0; i + 1 < modules.length; i++) {
    at += modules[i]!;
    if (at < length - 0.05) out.push(at);
  }
  return out;
}
