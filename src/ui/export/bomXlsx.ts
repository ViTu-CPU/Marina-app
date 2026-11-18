/**
 * Bill of materials and cost estimate as an Excel workbook (D24): summary, product lines
 * with their sources, anchor lines and the parameters used. Every sheet carries the
 * disclaimer (SPEC §1).
 */
import { writeXlsx, type CellValue } from '../../catalog/xlsx';
import { anchoringStatus, anchoringStatusText, frictionSensitivity, MOORING_DISCLAIMER, MOORING_NOTES, SOFT_CLAY_NOTE, type AnchorLine } from '../../engine/anchoring';
import { excludesNote } from '../../engine/bom';
import type { Layout, Project } from '../../engine/model';
import { DISCLAIMER } from '../../state/projectFile';
import type { CostModel } from '../costModel';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;

export function bomWorkbook(project: Project, layout: Layout, model: CostModel, date: string): Uint8Array {
  const { estimate, anchoring, choices, priceList } = model;
  // D62: the totals say what they leave out.
  const excludes = excludesNote(estimate);
  // D62: block masses for other friction coefficients (the least certain input).
  const sens = frictionSensitivity(anchoring.lines, project.anchoring, priceList);
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
    [`Total VAT 0 %${excludes}`, r2(estimate.totalVat0)],
    [`VAT ${estimate.vatPct} %`, r2(estimate.vat)],
    [`Total incl. VAT${excludes}`, r2(estimate.totalWithVat)],
    ['Range (VAT 0 %), low', r2(estimate.range[0])],
    ['Range (VAT 0 %), high', r2(estimate.range[1])],
    ['Per berth (VAT 0 %)', r2(estimate.perBerth)],
    ['Per metre of main pier and access pontoon (VAT 0 %)', r2(estimate.perPierMetre)],
    ['Lines without a price (not in the totals)', estimate.unpriced.length],
    ['Anchoring status', anchoringStatusText(anchoringStatus(anchoring.lines))],
    ...(estimate.unpriced.length > 0
      ? [
          [],
          [`Unpriced items (not in the totals, the range or the per-berth figures): ${estimate.unpriced.length}`],
          ['item', 'quantity', 'unit', 'why not priced'],
          ...estimate.unpriced.map((u): CellValue[] => [u.name, r1(u.quantity), u.unit, u.reason]),
        ]
      : []),
    ...(sens.lines > 0
      ? [
          [],
          [`Friction sensitivity: plain concrete blocks on the ${sens.lines} seabed lines of piers, access pontoons and breakwaters (seabed ${sens.seabed})`],
          ['friction coefficient', 'largest block needed (kg)', 'blocks in total (t)', `lines that ${sens.maxPerLine > 1 ? `${sens.maxPerLine} × ` : ''}${sens.heaviestBlockKg} kg holds`],
          ...sens.rows.map((r): CellValue[] => [r.current ? `${r.friction} (in use)` : r.friction, Math.round(r.maxKg), r1(r.totalKg / 1000), r.feasible]),
          [SOFT_CLAY_NOTE],
        ]
      : []),
    [],
    // D64: the spec's required text and notes with their sources.
    ['Mooring sizing (docs/ANKKUROINTI_MITOITUS_SPEC.md)'],
    [MOORING_DISCLAIMER],
    ...MOORING_NOTES.map((n) => [n.text]),
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
  // D64: per line the governing case of the spec (§8): direction, water level, Th, T_fair, Fv, uplift
  // angle, chain factor of safety, anchor capacity and factor of safety, required dry mass; the colour
  // (green / yellow / red) as text.
  const target = project.anchoring.slidingSafetyFactor;
  const colour = (fos: number | null, goal: number) => (fos === null || !Number.isFinite(fos) ? '' : fos >= goal - 1e-9 ? 'green' : fos >= 1 ? 'yellow' : 'red');
  const note = (l: AnchorLine) =>
    l.status === 'PILE' ? `pile anchor: ${l.pileReason}` : l.anchorCount > 1 ? 'TANDEM: 2 anchors on one line (user choice); several anchors on one chain do not necessarily equal one of the same total mass' : '';
  const lines: CellValue[][] = [
    ['line', 'holds', 'role', 'fixing', 'splay', 'dir_deg', 'governing_case', 'water_level', 'th_kn', 't_fair_kn', 't_anchor_kn', 'fv_kn', 'uplift_deg', 'chain', 'chain_length_m', 'chain_fos', 'chain_colour', 'anchor_kind', 'anchor', 'anchor_count', 'anchor_capacity_kn', 'anchor_fos', 'anchor_colour', 'anchor_fos_ge_1_8', 'required_dry_mass_kg', 'status', 'status_note', 'fix_x', 'fix_y', 'anchor_x', 'anchor_y'],
    ...anchoring.lines.map((l) => {
      const g = l.governing;
      return [
        l.id,
        l.holdsId,
        l.role,
        l.fixing,
        l.splay,
        r1(l.dirDeg),
        g?.case ?? '',
        g?.waterLevel ?? '',
        g ? r2(g.Th) : null,
        g ? r2(g.Tfair) : null,
        g ? r2(g.Tanchor) : null,
        g ? r2(g.Fv) : null,
        g ? r1(g.upliftDeg) : null,
        l.chainId ?? '',
        r1(l.chainLength),
        g ? r2(g.chainFoS) : null,
        colour(g?.chainFoS ?? null, project.anchoring.chainSafetyFactor),
        l.anchorKind ?? '',
        l.anchorId ?? '',
        l.anchorCount,
        g?.anchorCapacity === null || g?.anchorCapacity === undefined ? null : r2(g.anchorCapacity),
        g?.anchorFoS === null || g?.anchorFoS === undefined || !Number.isFinite(g.anchorFoS) ? null : r2(g.anchorFoS),
        colour(g?.anchorFoS ?? null, target),
        g?.anchorFoS === null || g?.anchorFoS === undefined ? '' : g.anchorFoS >= 1.8 - 1e-9 ? 'yes' : 'no',
        Number.isFinite(l.requiredAnchorKg) ? Math.round(l.requiredAnchorKg) : null,
        l.fixing === 'seabed' ? l.status : '',
        note(l),
        r2(l.fix.x),
        r2(l.fix.y),
        r2(l.anchor.x),
        r2(l.anchor.y),
      ];
    }),
  ];
  // D64: the load table of the spec (§8): wind, current, wave and the ULS sum per direction.
  const loadRows: CellValue[][] = [
    ['pontoon', 'kind', 'case', 'q_kpa', 'wind_kn', 'current_kn', 'wave_kn', 'uls_kn', 'ice_kn (reported only)'],
    ...anchoring.loads.flatMap((p) =>
      p.cases.map((c): CellValue[] => [p.id, p.kind, c.id, r2(p.q * 1000) / 1000, r2(c.wind), r2(c.current), r2(c.wave), r2(c.F_uls), p.ice ? r2(c.id.startsWith('perp') ? p.ice.F_perp : p.ice.F_par) : null]),
    ),
  ];
  const a = project.anchoring;
  const params: CellValue[][] = [
    ['parameter', 'value'],
    ...Object.entries(a).flatMap(([k, v]): CellValue[][] =>
      // D50: unknown normal water levels are null (an empty cell).
      v === null ? [[k, '']] : typeof v === 'object' ? Object.entries(v as Record<string, number>).map(([kk, vv]) => [`${k}.${kk}`, vv]) : [[k, v as CellValue]],
    ),
    [],
    ['price list parameter', 'value', 'unit', 'source'],
    ...priceList.parameters.map((p) => [p.key, p.value, p.unit, p.source]),
  ];
  return writeXlsx([
    { name: 'Summary', rows: summary, columnWidths: [48, 16] },
    { name: 'Bill of materials', rows: bom, header: true, columnWidths: [10, 30, 40, 22, 6, 10, 10, 12, 12, 40, 40, 11, 50] },
    { name: 'Loads', rows: loadRows, header: true, columnWidths: [14, 10, 8, 8, 10, 10, 10, 10, 14] },
    { name: 'Anchor lines', rows: lines, header: true, columnWidths: [12, 10, 9, 8, 8, 8, 10, 10, 9, 10, 24, 12, 24, 9, 8, 11, 50, 9, 9, 9, 9] },
    { name: 'Parameters', rows: params, header: true, columnWidths: [32, 12, 10, 60] },
  ]);
}
