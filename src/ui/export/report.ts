/**
 * Printable report of the selected alternative (U24): one self-contained HTML document
 * with A4 print styles. The browser prints it; "Save as PDF" gives the PDF report
 * (SPEC Phase 3). Every page carries the disclaimer (SPEC §1).
 */
import { frictionSensitivity, MOORING_NOTES, type AnchoringParams } from '../../engine/anchoring';
import { BOM_GROUPS, type BomGroup } from '../../engine/bom';
import { as3962NotesFor } from '../as3962Notes';
import type { Layout, Params, Project } from '../../engine/model';
import { targetCount } from '../../engine/targets';
import { translate, type Language, type StringKey } from '../../i18n';
import { comparisonRows } from '../compare';
import { anchoringStatusLabel, excludesLabel, type CostModel } from '../costModel';
import { formatCount, formatEuro, formatKn, formatLength } from '../format';
import { groupIssues } from '../issueGroups';
import { esc, printDocument, tableHelpers } from './htmlDoc';
import { waveScreeningParts } from './waveReport';

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
  'leewardFactor',
  'waveLineLoad',
  'waveMin',
  'currentSpeed',
  'pontoonDraft',
  'extraStatic',
  'iceLineLoad',
  'unevenFactor',
  'slopeDeg',
  'capacityFactor',
  'lineSpacing',
  'splayAngle',
  'chainLengthFactor',
  'chainSafetyFactor',
  'corrosionAllowance',
  'slidingSafetyFactor',
  'maxAnchorMass',
  'maxAnchorsPerLine',
  'tipAnchorMinLength',
  'fingerPileMinLength',
];

export function buildReportHtml(input: ReportInput): string {
  const { project, layout, model, image, language, date } = input;
  const t = (key: StringKey) => translate(language, key);
  const { table, kv } = tableHelpers(t);
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
      ...ANCHORING.map((k): [string, string] => [t(`anchoring.${k}` as StringKey), String(a[k])]),
      ...(a.normalHighWater === null ? [] : [[t('anchoring.normalHighWater'), String(a.normalHighWater)] as [string, string]]),
      ...(a.normalLowWater === null ? [] : [[t('anchoring.normalLowWater'), String(a.normalLowWater)] as [string, string]]),
      [t('anchoring.friction'), a.seabed === 'softClayMud' ? '–' : String(a.friction[a.seabed])],
      [t('anchoring.winterInWater'), t(a.winterInWater ? 'common.yes' : 'common.no')],
      ...(a.capacityFactorSource ? [[t('anchoring.capacityFactorSource'), a.capacityFactorSource] as [string, string]] : []),
      ...(a.cohesive
        ? (Object.entries(a.cohesive) as [keyof NonNullable<typeof a.cohesive>, number][]).map(([k, v]): [string, string] => [`${t('anchoring.cohesive')}: ${t(`cohesive.${k}` as StringKey)}`, String(v)])
        : []),
    ]),
  );
  // D50: where the water levels came from.
  const wl = project.waterLevels;
  if (wl) {
    const m = (x: number) => formatLength(x, language);
    parts.push(
      `<p class="small">${esc(t('levels.applied'))} ${esc(wl.station)} (${esc(t(wl.source === 'fmi' ? 'levels.sea' : 'levels.lake'))}, ${esc(m(wl.distance / 1000))} km, ${wl.startYear}–${wl.endYear}): ${esc(t('levels.values'))} ${esc([wl.levels.hw, wl.levels.mhw, wl.levels.mw, wl.levels.mnw, wl.levels.nw].map(m).join(' / '))} m; ${esc(wl.fetchedOn)}. ${esc(t('levels.note'))}</p>`,
    );
  }
  parts.push('</div></div>');

  // D40, D41, D47: wave screening, when a fetch and a wind are entered.
  parts.push(...waveScreeningParts(project, layout.piers, language));

  // D52: AS 3962-2001 advisory checks.
  const asNotes = as3962NotesFor(project, layout, model?.choices.pontoonFreeboard ?? null);
  parts.push(`<h2>${esc(t('as3962.title'))}</h2>`);
  parts.push(
    asNotes.length === 0
      ? `<p>${esc(t('as3962.none'))}</p>`
      : `<ul>${asNotes.map((n) => `<li${n.severity === 'warning' ? ' class="warn"' : ''}><strong>${esc(n.clause)}</strong> ${esc(n.message)}</li>`).join('')}</ul>`,
  );
  parts.push(`<p class="small">${esc(t('as3962.note'))}</p>`);

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
        [t('anchoring.status'), anchoringStatusLabel(t, anchoring.lines, language)],
        [t('anchoring.maxLine'), `${formatKn(anchoring.lines.reduce((m, l) => Math.max(m, l.horizontalKn), 0), language)} kN`],
        [t('anchoring.maxMass'), `${formatCount(anchoring.lines.filter((l) => l.role !== 'buoy' && Number.isFinite(l.requiredAnchorKg)).reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0), language)} kg`],
        ...(anchoring.lines.some((l) => l.role === 'buoy')
          ? ([
              [t('anchoring.buoys'), formatCount(anchoring.lines.filter((l) => l.role === 'buoy').length, language)],
              [t('anchoring.maxSinker'), `${formatCount(anchoring.lines.filter((l) => l.role === 'buoy').reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0), language)} kg`],
            ] as [string, string][])
          : []),
        ...sum((l) => name(l.chainId), (l) => l.chainLength).map(([n, m]): [string, string] => [`${t('anchoring.chains')}: ${n}`, `${formatLength(m, language)} m`]),
        ...sum(
          (l) => (l.status === 'PILE' && !l.anchorId ? t('anchoring.pileAnchor') : name(l.anchorId)),
          (l) => l.anchorCount,
          anchoring.lines.filter((l) => l.fixing === 'seabed'),
        ).map(([n, c]): [string, string] => [`${t('anchoring.anchors')}: ${n}`, formatCount(c, language)]),
        ...(anchoring.lines.some((l) => l.fixing === 'wall') ? [[t('anchoring.wallFixings'), formatCount(anchoring.lines.filter((l) => l.fixing === 'wall').length, language)] as [string, string]] : []),
        ...(anchoring.piles.length > 0 ? [[t('anchoring.endPiles'), formatCount(anchoring.piles.length, language)] as [string, string]] : []),
      ]),
    );
    // D64: the spec's required text, the load table and the governing cases.
    parts.push(`<p class="disclaimer">${esc(t('mooring.disclaimer'))}</p>`);
    const n2 = (x: number) => formatKn(x, language);
    parts.push(`<h3>${esc(t('mooring.loads'))}</h3>`);
    parts.push(
      table(
        [t('mooring.pontoon'), t('mooring.case'), t('mooring.wind'), t('mooring.current'), t('mooring.wave'), t('mooring.uls')],
        anchoring.loads.flatMap((pl) => pl.cases.map((c) => [esc(pl.id), esc(c.id), esc(n2(c.wind)), esc(n2(c.current)), esc(n2(c.wave)), esc(n2(c.F_uls))])),
        [2, 3, 4, 5],
      ),
    );
    // I122: an access pontoon's load carried by the piers attached to it.
    const transfers = anchoring.loads.flatMap((pl) => pl.transfers.map((x) => `${pl.id} ${x.case} → ${x.to} ${x.toCase}: ${n2(x.kN)} kN`));
    if (transfers.length > 0) parts.push(`<p>${esc(t('mooring.transfers'))} ${esc(transfers.join('; '))}</p>`);
    parts.push(`<h3>${esc(t('mooring.governing'))}</h3>`);
    // Factor of safety with its colour of the spec (§8): ● target met, ◐ at least 1, ○ below 1.
    const fosText = (x: number | null | undefined, goal: number) =>
      x === null || x === undefined || !Number.isFinite(x) ? '–' : `${x.toFixed(2).replace('.', language === 'fi' ? ',' : '.')} ${x >= goal - 1e-9 ? '●' : x >= 1 ? '◐' : '○'}`;
    parts.push(
      table(
        [t('mooring.pontoon'), t('anchoring.lines'), t('mooring.case'), 'Th (kN)', 'Fv (kN)', t('mooring.chainFoS'), t('mooring.anchorFoS'), t('mooring.massReq'), t('mooring.anchors')],
        anchoring.loads.map((pl) => {
          const own = anchoring.lines.filter((l) => l.holdsId === pl.id && l.fixing === 'seabed');
          const worst = own.reduce<(typeof own)[number] | null>((w, l) => (!w || (l.governing?.anchorFoS ?? Infinity) < (w.governing?.anchorFoS ?? Infinity) ? l : w), null);
          const g = worst?.governing ?? null;
          const masses = own.map((l) => l.requiredAnchorKg).filter((x) => Number.isFinite(x));
          const piles = own.filter((l) => l.status === 'PILE').length;
          return [
            esc(pl.id),
            esc(formatCount(own.length, language)),
            esc(g ? `${g.case} ${g.waterLevel}` : '–'),
            esc(g ? n2(g.Th) : '–'),
            esc(g ? n2(g.Fv) : '–'),
            esc(fosText(own.reduce((m, l) => Math.min(m, l.chainFoS ?? Infinity), Infinity), project.anchoring.chainSafetyFactor)),
            esc(fosText(g?.anchorFoS, project.anchoring.slidingSafetyFactor)),
            esc(masses.length > 0 ? `${formatCount(Math.max(...masses), language)} kg` : '–'),
            esc(`${formatCount(own.length - piles, language)} / ${formatCount(piles, language)}`),
          ];
        }),
        [1, 3, 4, 5, 6, 7],
      ),
    );
    parts.push(`<p class="small">${esc(t('mooring.legend'))}</p>`);
    parts.push(issues(anchoring.issues));
    parts.push(`<h3>${esc(t('mooring.notes'))}</h3><ul class="small">${MOORING_NOTES.map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul>`);
    // D62: block masses for other friction coefficients.
    const sens = frictionSensitivity(anchoring.lines, project.anchoring, priceList);
    if (sens.lines > 0) {
      const dec = (x: number) => String(x).replace('.', language === 'fi' ? ',' : '.');
      parts.push(`<h3>${esc(t('sensitivity.title'))}</h3>`);
      parts.push(
        table(
          [t('sensitivity.friction'), `${t('sensitivity.largest')} (kg)`, `${t('sensitivity.total')} (t)`, `${t('sensitivity.feasible')} (${sens.maxPerLine > 1 ? `${sens.maxPerLine} × ` : ''}${formatCount(sens.heaviestBlockKg, language)} kg)`],
          sens.rows.map((r) => [
            `${esc(dec(r.friction))}${r.current ? ` (${esc(t('sensitivity.inUse'))})` : ''}`,
            esc(formatCount(r.maxKg, language)),
            esc(formatCount(r.totalKg / 1000, language)),
            `${esc(formatCount(r.feasible, language))} / ${esc(formatCount(sens.lines, language))}`,
          ]),
          [1, 2, 3],
        ),
      );
      parts.push(`<p class="small">${esc(t('sensitivity.note'))}</p>`);
    }
    parts.push(`<p class="small">${esc(t('anchoring.note'))}</p><p class="small">${esc(t('anchoring.compare'))}</p>`);

    parts.push(`<h2>${esc(t('section.cost'))}</h2>`);
    const euro = (v: number) => `${formatEuro(v, language)} €`;
    const excludes = excludesLabel(t, estimate.unpriced.length);
    parts.push(
      kv([
        ...BOM_GROUPS.map((g): [string, string] => [t(BOM_GROUP_KEY[g]), euro(estimate.byGroup[g])]),
        [t('cost.subtotal'), euro(estimate.subtotal)],
        [t('cost.overhead'), euro(estimate.overhead)],
        [t('cost.contingency'), euro(estimate.contingency)],
        [`${t('cost.totalVat0')}${excludes}`, euro(estimate.totalVat0)],
        [`${t('cost.vat')} ${String(estimate.vatPct).replace('.', language === 'fi' ? ',' : '.')} %`, euro(estimate.vat)],
        [`${t('cost.totalWithVat')}${excludes}`, euro(estimate.totalWithVat)],
        [t('cost.range'), `${euro(estimate.range[0])} … ${euro(estimate.range[1])}`],
        [t('cost.perBerth'), euro(estimate.perBerth)],
        [t('cost.perPierMetre'), euro(estimate.perPierMetre)],
      ]),
    );
    // D62: what the totals leave out, by name.
    if (estimate.unpriced.length > 0) {
      parts.push(`<h3>${esc(t('cost.unpriced'))}: ${formatCount(estimate.unpriced.length, language)}</h3>`);
      parts.push(
        table(
          [t('cost.product'), t('cost.quantity'), t('report.basis')],
          estimate.unpriced.map((u) => [esc(u.name), `${esc(String(Math.round(u.quantity * 10) / 10).replace('.', language === 'fi' ? ',' : '.'))} ${esc(u.unit)}`, `<span class="small">${esc(u.reason)}</span>`]),
          [1],
        ),
      );
    }
    // D65: rescue ladders, safety equipment posts and power and water pedestals.
    const eq = estimate.equipment.items;
    const nOf = (k: string) => formatCount(eq.filter((x) => x.kind === k).length, language);
    parts.push(`<h3>${esc(t('equipment.title'))}</h3>`);
    parts.push(
      kv([
        [t('legend.ladder'), nOf('ladder')],
        [t('legend.safetyPost'), nOf('safetyPost')],
        [t('legend.pedestal'), `${nOf('pedestal')} (${formatCount(estimate.equipment.berths, language)} ${t('equipment.berths')})`],
      ]),
    );
    parts.push(`<p class="small">${esc(t('equipment.note'))}</p>`);
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

  return printDocument(language, `${project.name || t('app.title')} – ${t('report.title')}`, parts.join('\n'));
}
