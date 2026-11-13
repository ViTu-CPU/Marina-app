/**
 * Rows of the comparison table (SPEC §8): all statistics side by side, with the best
 * value of each row marked.
 */
import type { BoatClass, Layout, Stats } from '../engine/model';
import type { Language, StringKey } from '../i18n';
import { formatArea, formatCount, formatLength, formatRatio } from './format';

export interface ComparisonRow {
  /** Translation key of the row label, or a literal label (boat class names). */
  label: { key: StringKey } | { text: string };
  unit: 'm' | 'm²' | '';
  values: string[];
  /** Indices of the layouts with the best value; empty when the row has no "better". */
  best: number[];
}

type Direction = 'higher' | 'lower' | 'none';

interface Metric {
  key: StringKey;
  unit: ComparisonRow['unit'];
  value: (s: Stats) => number;
  format: (v: number, language: Language) => string;
  better: Direction;
}

const METRICS: Metric[] = [
  { key: 'stat.totalBerths', unit: '', value: (s) => s.totalBerths, format: formatCount, better: 'higher' },
  { key: 'stat.mainPierLength', unit: 'm', value: (s) => s.mainPierLength, format: formatLength, better: 'none' },
  { key: 'stat.fingerLength', unit: 'm', value: (s) => s.fingerLength, format: formatLength, better: 'none' },
  { key: 'stat.pontoonLength', unit: 'm', value: (s) => s.pontoonLength, format: formatLength, better: 'lower' },
  { key: 'stat.pontoonDeckArea', unit: 'm²', value: (s) => s.pontoonDeckArea, format: formatArea, better: 'lower' },
  { key: 'stat.marinaWaterArea', unit: 'm²', value: (s) => s.marinaWaterArea, format: formatArea, better: 'none' },
  { key: 'stat.freeWaterArea', unit: 'm²', value: (s) => s.freeWaterArea, format: formatArea, better: 'higher' },
  { key: 'stat.berthsPer1000m2', unit: '', value: (s) => s.berthsPer1000m2, format: formatRatio, better: 'higher' },
  { key: 'stat.pontoonPerBerth', unit: 'm', value: (s) => s.pontoonPerBerth, format: formatLength, better: 'lower' },
  { key: 'stat.errors', unit: '', value: (s) => s.issueCounts.error, format: formatCount, better: 'lower' },
  { key: 'stat.warnings', unit: '', value: (s) => s.issueCounts.warning, format: formatCount, better: 'lower' },
];

/** Indices holding the best value. Nothing is marked when all values are equal. */
export function bestIndices(values: number[], better: Direction): number[] {
  if (better === 'none' || values.length < 2) return [];
  const target = better === 'higher' ? Math.max(...values) : Math.min(...values);
  const best = values.flatMap((v, i) => (v === target ? [i] : []));
  return best.length === values.length ? [] : best;
}

export function comparisonRows(layouts: Layout[], classes: BoatClass[], language: Language = 'en'): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const metric of METRICS) {
    const raw = layouts.map((l) => metric.value(l.stats));
    const values = raw.map((v) => metric.format(v, language));
    // Compare what is displayed: values that print the same are equally good.
    const [winner] = bestIndices(raw, metric.better);
    const best = winner === undefined ? [] : values.flatMap((v, i) => (v === values[winner] ? [i] : []));
    rows.push({
      label: { key: metric.key },
      unit: metric.unit,
      values,
      best: best.length === values.length ? [] : best,
    });
    if (metric.key === 'stat.totalBerths') {
      for (const c of classes) {
        rows.push({
          label: { text: c.name },
          unit: '',
          values: layouts.map((l) => formatCount(l.stats.berthsByClass[c.id] ?? 0, language)),
          best: [],
        });
      }
    }
  }
  return rows;
}
