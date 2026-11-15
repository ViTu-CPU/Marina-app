/**
 * Printable report of the selected alternative (U24): one self-contained HTML document
 * with A4 print styles. The browser prints it; "Save as PDF" gives the PDF report
 * (SPEC Phase 3). Every page carries the disclaimer (SPEC §1).
 */
import type { AnchoringParams } from '../../engine/anchoring';
import { BOM_GROUPS, type BomGroup } from '../../engine/bom';
import type { Layout, Params, Project } from '../../engine/model';
import { targetCount } from '../../engine/targets';
import { translate, type Language, type StringKey } from '../../i18n';
import { comparisonRows } from '../compare';
import type { CostModel } from '../costModel';
import { formatCount, formatEuro, formatKn, formatLength } from '../format';
import { groupIssues } from '../issueGroups';

export interface ReportInput {
  project: Project;
  layout: Layout;
  /** Anchoring plan and cost estimate; null without a price list. */
  model: CostModel | null;
  /** PNG of the canvas as a data URL, or null. */
  image: string | null;
  language: Language;
  /** Date of the report, YYYY-MM-DD. */
  date: string;
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const BOM_GROUP_KEY: Record<BomGroup, StringKey> = {
  pontoons: 'bom.pontoons',
  fingers: 'bom.fingers',
  gangways: 'bom.gangways',
  anchoring: 'bom.anchoring',
  fittings: 'bom.fittings',
  labour: 'bom.labour',
  plant: 'bom.plant',
};

/** Numeric dock and fairway parameters shown under the inputs (the labels carry the unit). */
const PARAMS: (keyof Params)[] = [
  'mainPierWidth',
  'fingerWidth',
  'fingerLengthRatio',
  'beamClearance',
  'lengthClearance',
  'shoreOffset',
  'maxMainPierLength',
  'fairwayFactor',
  'fairwayMin',
  'obstacleClearance',
];

/** Anchoring inputs shown in the report (the labels carry the unit). */
const ANCHORING: (keyof AnchoringParams)[] = [
  'depth',
  'highWater',
  'lowWater',
  'windSpeed',
  'dragCoefficient',
  'profileHeightRatio',
  'leewardFactor',
  'lineSpacing',
  'splayAngle',
  'chainLengthFactor',
  'chainSafetyFactor',
  'corrosionAllowance',
  'slidingSafetyFactor',
  'maxAnchorMass',
  'tipAnchorMinLength',
  'fingerPileMinLength',
];

const STYLE = `
@page { size: A4; margin: 14mm 14mm 10mm 14mm; }
* { box-sizing: border-box; }
body { font: 10pt/1.35 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; }
h1 { font-size: 17pt; margin: 0 0 2mm; }
h2 { font-size: 12.5pt; margin: 6mm 0 2mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 3mm 0 1mm; break-after: avoid; }
p { margin: 1mm 0; }
.meta { color: #475569; }
.disclaimer { border: 1.5px solid #b45309; background: #fffbeb; color: #78350f; padding: 2mm 3mm; margin: 3mm 0; font-weight: 600; }
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
td.sel, th.sel { background: #e0f2fe; font-weight: 600; }
.small { font-size: 8pt; color: #475569; }
ul { margin: 1mm 0; padding-left: 5mm; }
li { margin: 0.5mm 0; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
a { color: #0369a1; word-break: break-all; }
`;

export function buildReportHtml(input: ReportInput): string {
  const { project, layout, model, image, language, date } = input;
  const t = (key: StringKey) => translate(language, key);
  const table = (head: string[], rows: string[][], numeric: number[] = []) =>
    `<table class="data"><thead><tr>${head.map((h, i) => `<th${numeric.includes(i) ? ' class="n"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c, i) => `<td${numeric.includes(i) ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
  const kv = (rows: [string, string][]) => table([t('report.item'), t('report.value')], rows.map(([k, v]) => [esc(k), esc(v)]), [1]);
  const issues = (list: Layout['issues']) =>
    list.length === 0
      ? `<p class="small">${esc(t('results.noIssues'))}</p>`
      : `<ul>${groupIssues(list)
          .map((g) => `<li><b>${esc(t(`severity.${g.severity}`))}</b>: ${esc(g.issues[0]!.message)}${g.issues.length > 1 ? ` <i>(+${g.issues.length - 1} ${esc(t('issues.similar'))})</i>` : ''}</li>`)
          .join('')}</ul>`;
  const parts: string[] = [];

  // Title and disclaimer.
  const strategy = layout.modified ? `${layout.strategy}, ${t('results.manuallyEdited')}` : layout.strategy;
  parts.push(`<h1>${esc(project.name || t('app.title'))}</h1>`);
  parts.push(
    `<p class="meta">${esc(t('report.title'))} · ${esc(t('report.date'))} ${esc(date)} · ${esc(t('report.alternative'))}: ${esc(layout.name)} (${esc(strategy)}) · ${esc(t('report.status'))}: ${esc(t(`feasibility.${layout.feasibility}`))}</p>`,
  );
  parts.push(`<div class="disclaimer">${esc(t('app.disclaimer'))}</div>`);
  if (image) parts.push(`<img class="map" src="${image}" alt="${esc(t('report.mapAlt'))}">`);

  // Comparison of the alternatives, the reported one highlighted.
  const selected = project.layouts.findIndex((l) => l.id === layout.id);
  const rows = comparisonRows(project.layouts, project.boatClasses, language, project.params.berthTarget);
  parts.push(`<h2>${esc(t('results.comparison'))}</h2>`);
  parts.push(
    `<table class="data"><thead><tr><th></th>${project.layouts
      .map((l, i) => `<th class="n${i === selected ? ' sel' : ''}">${esc(l.name)}<br><span class="small">${esc(l.strategy)}</span></th>`)
      .join('')}</tr></thead><tbody>${rows
      .map(
        (r) =>
          `<tr><td>${esc('key' in r.label ? t(r.label.key) : r.label.text)}${r.unit ? ` (${esc(r.unit)})` : ''}</td>${r.values
            .map((v, i) => `<td class="n${i === selected ? ' sel' : ''}">${esc(v)}</td>`)
            .join('')}</tr>`,
      )
      .join('')}</tbody></table>`,
  );
  parts.push(`<h3>${esc(t('results.issues'))}: ${esc(layout.name)}</h3>${issues(layout.issues)}`);

  // Inputs.
  const counts = project.params.berthTarget === 'count';
  parts.push(`<h2>${esc(t('report.inputs'))}</h2><div class="cols"><div>`);
  parts.push(`<h3>${esc(t('section.boats'))}</h3>`);
  parts.push(
    table(
      [t('boats.name'), t('boats.length'), t('boats.beam'), counts ? t('boats.count') : t('boats.share')],
      project.boatClasses.map((c) => [
        esc(c.name),
        esc(formatLength(c.length, language)),
        esc(formatLength(c.beam, language)),
        esc(counts ? formatCount(targetCount(c), language) : formatCount(c.share * 100, language)),
      ]),
      [1, 2, 3],
    ),
  );
  parts.push(`<h3>${esc(t('section.dock'))} / ${esc(t('section.fairway'))}</h3>`);
  const p = project.params;
  parts.push(
    kv([
      ...PARAMS.map((k): [string, string] => [t(`param.${k}` as StringKey), String(p[k])]),
      [t('param.boatsPerBay'), String(p.boatsPerBay)],
      [t('param.orientation'), p.orientation === 'auto' ? t('param.orientationAuto') : `${p.orientation}°`],
      [t('param.fingerLengths'), p.fingerLengths.length > 0 ? p.fingerLengths.join('; ') : '–'],
    ]),
  );
  parts.push(`<p class="small">${esc(t('param.assumption'))}</p></div><div>`);
  parts.push(`<h3>${esc(t('section.anchoring'))}</h3>`);
  const a = project.anchoring;
  parts.push(
    kv([
      [t('anchoring.seabed'), t(`seabed.${a.seabed}` as StringKey)],
      [t('anchoring.anchorType'), t(`anchorType.${a.anchorType}`)],
      ...ANCHORING.map((k): [string, string] => [t(`anchoring.${k}` as StringKey), String(a[k])]),
      [t('anchoring.friction'), String(a.friction[a.seabed])],
    ]),
  );
  parts.push('</div></div>');

  // Anchoring plan and cost estimate.
  if (!model) {
    parts.push(`<h2>${esc(t('section.anchoringPlan'))}</h2><p>${esc(t('report.noPriceList'))}</p>`);
  } else {
    const { anchoring, estimate, priceList } = model;
    const name = (id: string | null) => (id ? (priceList.products.find((x) => x.id === id)?.name ?? id) : t('anchoring.none'));
    const sum = (key: (l: (typeof anchoring.lines)[number]) => string, value: (l: (typeof anchoring.lines)[number]) => number, lines = anchoring.lines) => {
      const map = new Map<string, number>();
      for (const l of lines) map.set(key(l), (map.get(key(l)) ?? 0) + value(l));
      return [...map.entries()];
    };
    parts.push(`<h2>${esc(t('section.anchoringPlan'))}</h2>`);
    parts.push(
      kv([
        [t('anchoring.lines'), formatCount(anchoring.lines.length, language)],
        [t('anchoring.maxLine'), `${formatKn(anchoring.lines.reduce((m, l) => Math.max(m, l.horizontalKn), 0), language)} kN`],
        [t('anchoring.maxMass'), `${formatCount(anchoring.lines.filter((l) => l.role !== 'buoy').reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0), language)} kg`],
        ...(anchoring.lines.some((l) => l.role === 'buoy')
          ? ([
              [t('anchoring.buoys'), formatCount(anchoring.lines.filter((l) => l.role === 'buoy').length, language)],
              [t('anchoring.maxSinker'), `${formatCount(anchoring.lines.filter((l) => l.role === 'buoy').reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0), language)} kg`],
            ] as [string, string][])
          : []),
        ...sum((l) => name(l.chainId), (l) => l.chainLength).map(([n, m]): [string, string] => [`${t('anchoring.chains')}: ${n}`, `${formatLength(m, language)} m`]),
        ...sum(
          (l) => name(l.anchorId),
          (l) => l.anchorCount,
          anchoring.lines.filter((l) => l.fixing === 'seabed'),
        ).map(([n, c]): [string, string] => [`${t('anchoring.anchors')}: ${n}`, formatCount(c, language)]),
        ...(anchoring.lines.some((l) => l.fixing === 'wall') ? [[t('anchoring.wallFixings'), formatCount(anchoring.lines.filter((l) => l.fixing === 'wall').length, language)] as [string, string]] : []),
        ...(anchoring.piles.length > 0 ? [[t('anchoring.endPiles'), formatCount(anchoring.piles.length, language)] as [string, string]] : []),
      ]),
    );
    parts.push(issues(anchoring.issues));
    parts.push(`<p class="small">${esc(t('anchoring.note'))}</p><p class="small">${esc(t('anchoring.compare'))}</p>`);

    parts.push(`<h2>${esc(t('section.cost'))}</h2>`);
    const euro = (v: number) => `${formatEuro(v, language)} €`;
    parts.push(
      kv([
        ...BOM_GROUPS.map((g): [string, string] => [t(BOM_GROUP_KEY[g]), euro(estimate.byGroup[g])]),
        [t('cost.subtotal'), euro(estimate.subtotal)],
        [t('cost.overhead'), euro(estimate.overhead)],
        [t('cost.contingency'), euro(estimate.contingency)],
        [t('cost.totalVat0'), euro(estimate.totalVat0)],
        [`${t('cost.vat')} ${String(estimate.vatPct).replace('.', language === 'fi' ? ',' : '.')} %`, euro(estimate.vat)],
        [t('cost.totalWithVat'), euro(estimate.totalWithVat)],
        [t('cost.range'), `${euro(estimate.range[0])} … ${euro(estimate.range[1])}`],
        [t('cost.perBerth'), euro(estimate.perBerth)],
        [t('cost.perPierMetre'), euro(estimate.perPierMetre)],
      ]),
    );
    parts.push(`<p class="small">${esc(t('cost.note'))} ${esc(t('cost.benchmark'))}</p>`);
    if (estimate.notes.length > 0) parts.push(`<ul class="small">${estimate.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
    parts.push(`<h3>${esc(t('cost.bom'))}</h3>`);
    parts.push(
      table(
        [t('cost.product'), t('cost.quantity'), t('report.unitPrice'), t('report.total'), t('report.basis')],
        estimate.lines.map((l) => [
          `${esc(l.name)}<br><span class="small">${esc(l.supplier)}</span>`,
          `${esc(String(l.orderQuantity).replace('.', language === 'fi' ? ',' : '.'))} ${esc(l.unit)}`,
          l.unitPrice === null ? '–' : esc(euro(l.unitPrice)),
          l.total === null ? '–' : esc(euro(l.total)),
          `<span class="small">${esc(l.basis)}</span>`,
        ]),
        [1, 2, 3],
      ),
    );

    // Sources: the price list's cost parameters and the products' sources.
    parts.push(`<h2>${esc(t('report.sources'))}</h2>`);
    parts.push(`<p>${esc(t('report.sourcesNote'))}</p>`);
    parts.push(`<h3>${esc(t('report.priceParams'))}</h3>`);
    parts.push(
      table(
        [t('report.item'), t('report.value'), t('report.source')],
        priceList.parameters.map((x) => [esc(x.description || x.key), esc(`${x.value} ${x.unit}`.trim()), `<span class="small">${esc(x.source)}</span>`]),
        [1],
      ),
    );
    parts.push(`<h3>${esc(t('report.productSources'))}</h3>`);
    const used = estimate.lines.filter((l, i, all) => all.findIndex((x) => x.productId === l.productId) === i);
    parts.push(
      table(
        [t('cost.product'), t('report.source'), t('report.date')],
        used.map((l) => [
          `${esc(l.name)}${/ESTIMATE|Assumption/.test(l.note) ? `<br><span class="small">${esc(l.note)}</span>` : ''}`,
          l.sourceUrl ? `<a href="${esc(l.sourceUrl)}">${esc(l.sourceUrl)}</a>` : '–',
          esc(l.sourceDate),
        ]),
      ),
    );
  }

  // The disclaimer is a fixed footer on every printed page; the repeated table footer keeps
  // its space free so that no content runs under it.
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><title>${esc(project.name || t('app.title'))} – ${esc(t('report.title'))}</title><style>${STYLE}</style></head><body><div class="foot">${esc(
    t('app.disclaimer'),
  )}</div><table class="pages"><tfoot><tr><td><div class="space"></div></td></tr></tfoot><tbody><tr><td>${parts.join('\n')}</td></tr></tbody></table></body></html>`;
}
