/**
 * Building blocks of the printable HTML documents (U24, U29): escaping, the A4 print styles,
 * tables and the page frame whose footer repeats the disclaimer on every printed page.
 */
import { translate, type Language, type StringKey } from '../../i18n';

export const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const PRINT_STYLE = `
@page { size: A4; margin: 14mm 14mm 10mm 14mm; }
* { box-sizing: border-box; }
body { font: 10pt/1.35 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 2mm; }
h2 { font-size: 12.5pt; margin: 6mm 0 2mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 3mm 0 1mm; break-after: avoid; }
p { margin: 1mm 0; }
.meta { color: #475569; }
.disclaimer { border: 1.5px solid #b45309; background: #fffbeb; color: #78350f; padding: 2mm 3mm; margin: 3mm 0; font-weight: 600; }
.summary { border: 1px solid #cbd5e1; background: #f8fafc; padding: 2mm 3mm; margin: 3mm 0; }
.summary.bad { border-color: #fca5a5; background: #fef2f2; }
.summary.good { border-color: #6ee7b7; background: #ecfdf5; }
.foot { position: fixed; bottom: 0; left: 0; right: 0; height: 7mm; font-size: 7.5pt; color: #78350f; text-align: center; border-top: 1px solid #fcd34d; padding-top: 1mm; background: #fff; }
table.pages, table.pages > tbody > tr > td, table.pages > tfoot > tr > td { border: 0; padding: 0; margin: 0; font-size: inherit; }
table.pages > tfoot .space { height: 9mm; }
table.data td:first-child { min-width: 28mm; }
img.map { width: 100%; max-height: 150mm; object-fit: contain; border: 1px solid #cbd5e1; }
table { border-collapse: collapse; width: 100%; margin: 1mm 0 2mm; font-size: 8.5pt; }
th, td { border: 1px solid #cbd5e1; padding: 0.8mm 1.5mm; text-align: left; vertical-align: top; }
td.n, th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
th { background: #f1f5f9; }
tr { break-inside: avoid; }
tr.bad td { background: #fef2f2; }
td.sel, th.sel { background: #e0f2fe; font-weight: 600; }
.small { font-size: 8pt; color: #475569; }
ul { margin: 1mm 0; padding-left: 5mm; }
li { margin: 0.5mm 0; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.figure { display: flex; gap: 4mm; align-items: flex-start; break-inside: avoid; }
.figure svg { flex: none; }
.figure > div { flex: 1; min-width: 0; }
a { color: #0369a1; word-break: break-all; }
`;

/** Table and key–value helpers in the language of `t`. */
export function tableHelpers(t: (key: StringKey) => string) {
  /** `rows` are HTML already escaped; `numeric` = right-aligned columns; `rowClass` per row. */
  const table = (head: string[], rows: string[][], numeric: number[] = [], rowClass?: (i: number) => string) =>
    `<table class="data"><thead><tr>${head.map((h, i) => `<th${numeric.includes(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r, j) => {
        const cls = rowClass?.(j) ?? '';
        return `<tr${cls ? ` class="${cls}"` : ''}>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`;
      })
      .join('')}</tbody></table>`;
  const kv = (rows: [string, string][]) => table([t('report.item'), t('report.value')], rows.map(([k, v]) => [esc(k), esc(v)]), [1]);
  return { table, kv };
}

/**
 * The whole document. The disclaimer is a fixed footer on every printed page; the repeated
 * table footer keeps its space free so that no content runs under it.
 */
export function printDocument(language: Language, title: string, body: string): string {
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_STYLE}</style></head><body><div class="foot">${esc(
    translate(language, 'app.disclaimer'),
  )}</div><table class="pages"><tfoot><tr><td><div class="space"></div></td></tr></tfoot><tbody><tr><td>${body}</td></tr></tbody></table></body></html>`;
}
