/**
 * CSV export (SPEC §8): the comparison of all alternatives and the berth list of the
 * selected one. The disclaimer is part of the file (SPEC §1).
 */
import type { Project } from '../../engine/model';
import { translate, type Language } from '../../i18n';
import { comparisonRows } from '../compare';

const cell = (value: string): string => (/[",\n\r;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const line = (cells: string[]): string => cells.map(cell).join(',');

/** Numbers are written without thousands separators so that spreadsheets read them. */
const plain = (formatted: string): string => formatted.replace(/[\s  ]/g, '').replace(/,(?=\d{3}\b)/g, '');

export function buildCsv(project: Project, selectedLayoutId: string | null, language: Language = 'en'): string {
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const lines: string[] = [];
  lines.push(line([t('app.title')]));
  lines.push(line([t('app.disclaimer')]));
  lines.push(line([t('csv.project'), project.name]));
  lines.push('');

  lines.push(line([t('csv.alternatives')]));
  lines.push(line([t('csv.alternative'), ...project.layouts.map((l) => l.name)]));
  lines.push(line([t('csv.strategy'), ...project.layouts.map((l) => l.strategy)]));
  lines.push(line([t('csv.feasibility'), ...project.layouts.map((l) => t(`feasibility.${l.feasibility}`))]));
  lines.push(line([t('results.manuallyEdited'), ...project.layouts.map((l) => (l.modified ? '1' : '0'))]));
  lines.push(line([t('results.preferred'), ...project.layouts.map((l) => (l.id === project.preferredLayoutId ? '1' : '0'))]));
  // The comparison rows are formatted in English so that decimals use a point.
  for (const row of comparisonRows(project.layouts, project.boatClasses, 'en', project.params.berthTarget)) {
    const label = 'key' in row.label ? t(row.label.key) : row.label.text;
    lines.push(line([row.unit ? `${label} (${row.unit})` : label, ...row.values.map(plain)]));
  }

  const selected = project.layouts.find((l) => l.id === selectedLayoutId);
  if (selected) {
    const className = new Map(project.boatClasses.map((c) => [c.id, c.name]));
    lines.push('');
    lines.push(line([`${t('csv.berthList')} ${selected.name}`]));
    lines.push(line([t('csv.berthId'), t('csv.pier'), t('selection.side'), t('selection.class'), t('csv.status')]));
    for (const b of selected.berths) {
      lines.push(
        line([
          b.id,
          b.pierId,
          t(`side.${b.side}`),
          className.get(b.boatClassId) ?? b.boatClassId,
          b.removed ? t('selection.removed') : t('csv.inUse'),
        ]),
      );
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}
