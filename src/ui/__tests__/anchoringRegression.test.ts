/**
 * D62 regression: the owner's test project ("Untitled project", alternative C – Best orientation
 * 30°, 267 berths, 3 main piers + P4 + access-1 + breakwater-1) exported 1 828 concrete weights of
 * 3 000 kg, 11–12 per line on P1–P3: the required mass (about 33 922 kg for H = 36.22 kN,
 * V = 8.69 kN on clay) was split into ⌈m / 3 000⌉ pieces.
 *
 * The owner's project file was not available, so `fixtures/anchoring-regression.project.json` is a
 * stand-in that reproduces the case: the rectangular-basin demo with an access pontoon (access-1)
 * and a Marinetek 4300K breakwater (breakwater-1), open water to the N, NE and NW (fetch 3 km, no
 * wind data: the full 2 kN/m wave load), alternative "C – Best orientation (10°)". Its main-pier
 * lines carry H 29.5–36.1 kN and V up to 8.7 kN on clay, as in the owner's case. The layout is
 * stored in the file; the anchoring and the estimate are computed from it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePriceListFile } from '../../catalog/priceList';
import { readXlsx } from '../../catalog/xlsx';
import { ANCHOR_BY_DESIGN_NAME } from '../../engine/bom';
import type { PriceList, Product } from '../../engine/catalog';
import { parseProject } from '../../state/projectFile';
import { computeCostModel } from '../costModel';
import { bomWorkbook } from '../export/bomXlsx';

const parsedList = parsePriceListFile(readFileSync('data/hinnasto.xlsx'), 'hinnasto.xlsx');
if (!parsedList.ok) throw new Error(parsedList.errors.join('\n'));
const builtIn = parsedList.priceList;
const parsed = parseProject(readFileSync('src/ui/__tests__/fixtures/anchoring-regression.project.json', 'utf8'));
if (!parsed.ok) throw new Error(parsed.error);
const project = parsed.project;
const layout = project.layouts[0]!;

/** The built-in list with only its 3 000 kg concrete weight left as an anchor (as in the owner's export). */
const only3000: PriceList = { ...builtIn, products: builtIn.products.filter((p) => p.category !== 'anchor' || p.id === 'anchor-laatulaituri-3000') };
const mainPiers = ['P1', 'P2', 'P3'];

describe('anchoring regression (D62): never several weights per line', () => {
  const model = computeCostModel(project, layout, only3000)!;
  const { anchoring, estimate } = model;
  const seabed = anchoring.lines.filter((l) => l.fixing === 'seabed');

  it('the stand-in carries the owner’s loads: P1–P3 lines need about 30–34 t of concrete each', () => {
    expect(layout.name).toBe('C – Best orientation (10°)');
    expect(project.site.accessPontoons!.map((a) => a.id)).toEqual(['access-1']);
    expect(project.site.breakwaters!.map((b) => b.id)).toEqual(['breakwater-1']);
    const p13 = seabed.filter((l) => mainPiers.includes(l.holdsId));
    expect(p13.length).toBeGreaterThan(50);
    expect(Math.max(...p13.map((l) => l.horizontalKn))).toBeGreaterThan(33);
    expect(Math.max(...p13.map((l) => l.requiredAnchorKg))).toBeGreaterThan(30000);
  });

  it('no line has more anchors than maxAnchorsPerLine (1)', () => {
    expect(project.anchoring.maxAnchorsPerLine).toBe(1);
    expect(anchoring.lines.filter((l) => l.anchorCount > project.anchoring.maxAnchorsPerLine)).toEqual([]);
  });

  it('the bill of materials has at most one anchor per seabed line', () => {
    const anchorIds = new Set(only3000.products.filter((p) => p.category === 'anchor').map((p) => p.id));
    const pieces = estimate.lines.filter((l) => anchorIds.has(l.productId)).reduce((n, l) => n + l.orderQuantity, 0);
    expect(pieces).toBeLessThanOrEqual(seabed.length);
  });

  it('P1–P3 lines are INFEASIBLE with only the 3 000 kg weight, and are not priced as weights', () => {
    for (const l of seabed.filter((x) => mainPiers.includes(x.holdsId))) {
      expect(l, l.id).toMatchObject({ status: 'INFEASIBLE', anchorId: null, anchorCount: 0 });
      expect(l.infeasibleReason, l.id).toMatch(/^block: needs \d{1,3}( \d{3})* kg, max product 3 000 kg$/);
    }
    const byDesign = estimate.lines.find((l) => l.name === ANCHOR_BY_DESIGN_NAME)!;
    expect(byDesign).toMatchObject({ unitPrice: null, total: null });
    expect(byDesign.quantity).toBe(seabed.filter((l) => l.status === 'INFEASIBLE').length);
    expect(estimate.lines.find((l) => l.productId === 'anchor-laatulaituri-3000')?.orderQuantity ?? 0).toBe(seabed.filter((l) => l.anchorId !== null).length);
  });

  it('the summary counts every unpriced item, names breakwater-1, and the totals say so', () => {
    expect(estimate.missingPrices).toBe(estimate.unpriced.length);
    expect(estimate.unpriced.length).toBeGreaterThan(0);
    expect(estimate.unpriced.some((u) => u.name.includes('breakwater-1'))).toBe(true);
    expect(estimate.unpriced.some((u) => u.name === ANCHOR_BY_DESIGN_NAME)).toBe(true);
    const sheets = readXlsx(bomWorkbook(project, layout, model, '2026-11-18'));
    const summary = sheets.find((s) => s.name === 'Summary')!.rows;
    const row = (label: string | RegExp) => summary.find((r) => (typeof label === 'string' ? r[0] === label : label.test(String(r[0] ?? ''))));
    const n = estimate.unpriced.length;
    expect(row(`Total VAT 0 % (excludes ${n} unpriced items, see list)`)).toBeTruthy();
    expect(row(`Total incl. VAT (excludes ${n} unpriced items, see list)`)).toBeTruthy();
    expect(row('Total VAT 0 %')).toBeUndefined();
    expect(row('Lines without a price (not in the totals)')![1]).toBe(n);
    expect(row('Anchoring status')![1]).toMatch(/^\d+ lines OK, \d+ lines INFEASIBLE$/);
    expect(row(/^Breakwater breakwater-1: /)).toBeTruthy();
    expect(row(ANCHOR_BY_DESIGN_NAME)).toBeTruthy();
    // The friction sensitivity table and its note.
    const head = summary.findIndex((r) => String(r[0] ?? '').startsWith('Friction sensitivity: plain concrete blocks'));
    expect(head).toBeGreaterThan(0);
    expect(summary.slice(head + 2, head + 5).map((r) => r[0])).toEqual([0.2, '0.3 (in use)', 0.5]);
    expect(summary[head + 5]![0]).toBe('Gravity block capacity in soft clay is highly uncertain; requires geotechnical data.');
    // The anchor lines sheet: one anchor at most, the status and the reason.
    const lines = sheets.find((s) => s.name === 'Anchor lines')!.rows;
    const col = (key: string) => lines[0]!.indexOf(key);
    expect(lines.slice(1).every((r) => Number(r[col('anchor_count')]) <= 1)).toBe(true);
    expect(lines.slice(1).filter((r) => r[col('status')] === 'INFEASIBLE').length).toBe(seabed.filter((l) => l.status === 'INFEASIBLE').length);
    expect(String(lines.find((r) => r[col('status')] === 'INFEASIBLE')![col('status_note')])).toMatch(/^block: needs .* kg, max product 3 000 kg; anchor point by geotechnical\/mooring design$/);
  });
});

describe('anchoring regression (D62): another anchor type from the price list', () => {
  // TEST DATA, not a product: a screw anchor of 50 kN horizontal for clay. The lines also lift
  // their anchors (V up to 8.7 kN), so it needs an uplift capacity too.
  const screw: Product = {
    ...builtIn.products.find((p) => p.id === 'anchor-laatulaituri-3000')!,
    id: 'test-screw-50kn',
    supplier: '(test data)',
    name: 'Screw anchor 50 kN (test data)',
    price: 2000,
    priceIncludesVat: false,
    anchorMassKg: null,
    anchorKind: 'screw',
    capacityHorizontalKn: 50,
    capacityUpliftKn: 50,
    capacityBasis: 'published',
    seabeds: ['clay'],
    installedPrice: null,
    sourceUrl: 'https://example.com/test-data',
    sourceDate: '2026-11-18',
    note: 'TEST DATA – not a real product.',
  };
  const withScrew: PriceList = { ...only3000, products: [...only3000.products, screw] };
  const model = computeCostModel(project, layout, withScrew)!;

  it('P1–P3 lines choose it, one per line, status OK', () => {
    const p13 = model.anchoring.lines.filter((l) => l.fixing === 'seabed' && mainPiers.includes(l.holdsId));
    expect(p13.length).toBeGreaterThan(50);
    for (const l of p13) expect(l, l.id).toMatchObject({ status: 'OK', anchorId: 'test-screw-50kn', anchorKind: 'screw', anchorCount: 1, infeasibleReason: null });
    expect(model.estimate.lines.find((l) => l.productId === 'test-screw-50kn')!.orderQuantity).toBeGreaterThanOrEqual(p13.length);
  });

  it('on a seabed the product does not list, it is not chosen', () => {
    const sand = computeCostModel({ ...project, anchoring: { ...project.anchoring, seabed: 'sand' } }, layout, withScrew)!;
    expect(sand.anchoring.lines.some((l) => l.anchorId === 'test-screw-50kn')).toBe(false);
  });
});
