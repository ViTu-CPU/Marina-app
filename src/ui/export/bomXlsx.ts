/**
 * Bill of materials and cost estimate as an Excel workbook (D24): summary, product lines
 * with their sources, anchor lines and the parameters used. Every sheet carries the
 * disclaimer (SPEC §1).
 */
import { writeXlsx, type CellValue } from '../../catalog/xlsx';
import type { Layout, Project } from '../../engine/model';
import { DISCLAIMER } from '../../state/projectFile';
import type { CostModel } from '../costModel';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function bomWorkbook(project: Project, layout: Layout, model: CostModel, date: string): Uint8Array {
  const { estimate, anchoring, choices, priceList } = model;
  const summary: CellValue[][] = [
    ['Marina Layout Planner – bill of materials and cost estimate'],
    [DISCLAIMER],
    ['Cost figures are a feasibility-stage estimate from the price list below; they are not a quote. Rows marked ESTIMATE or Assumption in the price list have no public source.'],
    [],
    ['Project', project.name],
    ['Alternative', layout.name],
    ['Date', date],
    ['Price list', `${priceList.title}${model.imported ? ' (imported)' : ' (built-in)'}`],
    ['Pontoon series', choices.pontoonSeries ?? '–'],
    ['Finger series', choices.fingerSeries ?? '–'],
    ['Gangway series', choices.gangwaySeries ?? '–'],
    ['Berths', layout.stats.totalBerths],
    ['Main piers (m)', r1(layout.stats.mainPierLength)],
    ['Access pontoons (m)', r1(layout.stats.accessPontoonLength)],
    [],
    ['', '€ VAT 0 %'],
    ['Pontoons', r2(estimate.byGroup.pontoons)],
    ['Fingers', r2(estimate.byGroup.fingers)],
    ['Gangways', r2(estimate.byGroup.gangways)],
    ['Anchoring', r2(estimate.byGroup.anchoring)],
    ['Fittings', r2(estimate.byGroup.fittings)],
    ['Labour', r2(estimate.labour)],
    ['Plant and transport', r2(estimate.plant)],
    ['Subtotal', r2(estimate.subtotal)],
    ['Site overheads', r2(estimate.overhead)],
    ['Contingency', r2(estimate.contingency)],
    ['Total VAT 0 %', r2(estimate.totalVat0)],
    [`VAT ${estimate.vatPct} %`, r2(estimate.vat)],
    ['Total incl. VAT', r2(estimate.totalWithVat)],
    ['Range (VAT 0 %), low', r2(estimate.range[0])],
    ['Range (VAT 0 %), high', r2(estimate.range[1])],
    ['Per berth (VAT 0 %)', r2(estimate.perBerth)],
    ['Per metre of main pier and access pontoon (VAT 0 %)', r2(estimate.perPierMetre)],
    ['Lines without a price (not in the totals)', estimate.missingPrices],
    [],
    ['Notes'],
    ...estimate.notes.map((n) => [n]),
    ...anchoring.issues.map((i) => [i.message]),
  ];
  const bom: CellValue[][] = [
    ['group', 'product_id', 'name', 'supplier', 'unit', 'quantity', 'order_quantity', 'unit_price_vat0_eur', 'total_vat0_eur', 'basis', 'source_url', 'source_date', 'note'],
    ...estimate.lines.map((l) => [
      l.group,
      l.productId,
      l.name,
      l.supplier,
      l.unit,
      r2(l.quantity),
      l.orderQuantity,
      l.unitPrice === null ? null : r2(l.unitPrice),
      l.total === null ? null : r2(l.total),
      l.basis,
      l.sourceUrl,
      l.sourceDate,
      l.note,
    ]),
  ];
  const lines: CellValue[][] = [
    ['line', 'holds', 'kind', 'horizontal_kn', 'top_tension_kn', 'uplift_kn', 'chain_length_m', 'chain', 'required_anchor_kg', 'anchor', 'anchor_count', 'fix_x', 'fix_y', 'anchor_x', 'anchor_y'],
    ...anchoring.lines.map((l) => [
      l.id,
      l.holdsId,
      l.kind,
      r2(l.horizontalKn),
      r2(l.topTensionKn),
      r2(l.upliftKn),
      r1(l.chainLength),
      l.chainId ?? '',
      Math.round(l.requiredAnchorKg),
      l.anchorId ?? '',
      l.anchorCount,
      r2(l.fix.x),
      r2(l.fix.y),
      r2(l.anchor.x),
      r2(l.anchor.y),
    ]),
  ];
  const a = project.anchoring;
  const params: CellValue[][] = [
    ['parameter', 'value'],
    ...Object.entries(a).flatMap(([k, v]): CellValue[][] =>
      typeof v === 'object' ? Object.entries(v as Record<string, number>).map(([kk, vv]) => [`${k}.${kk}`, vv]) : [[k, v as CellValue]],
    ),
    [],
    ['price list parameter', 'value', 'unit', 'source'],
    ...priceList.parameters.map((p) => [p.key, p.value, p.unit, p.source]),
  ];
  return writeXlsx([
    { name: 'Summary', rows: summary, columnWidths: [48, 16] },
    { name: 'Bill of materials', rows: bom, header: true, columnWidths: [10, 30, 40, 22, 6, 10, 10, 12, 12, 40, 40, 11, 50] },
    { name: 'Anchor lines', rows: lines, header: true, columnWidths: [12, 10, 9, 12, 12, 10, 12, 28, 14, 24, 10, 9, 9, 9, 9] },
    { name: 'Parameters', rows: params, header: true, columnWidths: [32, 12, 10, 60] },
  ]);
}
