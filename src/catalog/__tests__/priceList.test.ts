import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { anchorKindOf, installedPriceVat0, parameter, PRODUCT_CATEGORIES, unitPriceVat0, type PriceList, type Product } from '../../engine/catalog';
import { anchorRowErrors, parsePriceListFile, priceListFromSheets, priceListToSheets, priceListToXlsx, seabedList } from '../priceList';
import { readXlsx } from '../xlsx';

const parsed = parsePriceListFile(readFileSync('data/hinnasto.xlsx'), 'hinnasto.xlsx');
const list = (): PriceList => {
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.priceList;
};

describe('data/hinnasto.xlsx (D19)', () => {
  it('parses without errors', () => {
    expect(parsed.ok ? [] : parsed.errors).toEqual([]);
  });

  it('every row has a source, a reading date and a price', () => {
    for (const p of list().products) {
      expect(p.sourceUrl, p.id).toMatch(/^https:\/\//);
      expect(p.sourceDate, p.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.price, p.id).not.toBeNull();
      expect(p.price!, p.id).toBeGreaterThan(0);
    }
  });

  it('rows without a public source say so in the note', () => {
    for (const p of list().products.filter((x) => x.supplier === '(estimate)' || x.supplier === 'Marinetek')) {
      expect(p.note, p.id).toMatch(/^ESTIMATE/);
    }
  });

  it('has what the bill of materials needs', () => {
    const products = list().products;
    for (const c of ['pontoon', 'finger', 'gangway', 'chain', 'anchor', 'shackle', 'labour', 'plant'] as const) {
      expect(products.some((p) => p.category === c), c).toBe(true);
    }
    // Chains the anchoring calculation can choose need a breaking load and a mass per metre.
    expect(products.filter((p) => p.category === 'chain' && p.breakingLoadKn !== null && p.massKgPerM !== null).length).toBeGreaterThanOrEqual(5);
    for (const id of ['rate-installer', 'rate-diving-team', 'rate-crane', 'rate-work-boat']) {
      expect(products.some((p) => p.id === id), id).toBe(true);
    }
    expect(parameter(list(), 'vat_pct', NaN)).toBe(25.5);
  });

  it('its anchors are concrete blocks sized by the friction model, without published capacities (D62)', () => {
    const anchors = list().products.filter((p) => p.category === 'anchor');
    expect(anchors.length).toBeGreaterThan(10);
    for (const a of anchors) {
      expect([a.anchorKind, a.capacityBasis, a.capacityHorizontalKn, a.capacityUpliftKn], a.id).toEqual(['block', 'friction_model', null, null]);
      expect(a.anchorMassKg, a.id).toBeGreaterThan(0);
    }
    // No row other than an anchor carries an anchor type.
    expect(list().products.filter((p) => p.category !== 'anchor' && p.anchorKind !== null)).toEqual([]);
  });

  it('prices are converted to VAT 0 %', () => {
    const mx = list().products.find((p) => p.id === 'pontoon-alaiturit-mx12-3')!;
    expect(mx.price).toBe(17490);
    expect(mx.priceIncludesVat).toBe(true);
    // 17 490 / 1.255 = 13 936.25
    expect(unitPriceVat0(mx, 25.5)).toBeCloseTo(13936.25, 2);
    const diver = list().products.find((p) => p.id === 'rate-diving-team')!;
    expect(unitPriceVat0(diver, 25.5)).toBe(180);
  });

  it('the calculated VAT 0 % column agrees with the tool', () => {
    const sheet = readXlsx(readFileSync('data/hinnasto.xlsx')).find((s) => s.name === 'Products')!;
    const header = sheet.rows[0]!;
    const col = header.length - 1;
    const id = header.indexOf('id');
    for (const row of sheet.rows.slice(1)) {
      const p = list().products.find((x) => x.id === row[id])!;
      expect(row[col], p.id).toBeCloseTo(unitPriceVat0(p, 25.5)!, 2);
    }
  });
});

describe('anchor columns of the price list (D62)', () => {
  const base = list().products.find((p) => p.category === 'anchor')!;
  const screw: Product = {
    ...base,
    id: 'screw-test',
    name: 'Screw anchor (test)',
    anchorMassKg: null,
    anchorKind: 'screw',
    capacityHorizontalKn: 50,
    capacityUpliftKn: 60,
    capacityBasis: 'published',
    seabeds: ['clay', 'sand'],
    installedPrice: 1255,
    priceIncludesVat: true,
  };

  it('a screw anchor with published capacities, seabeds and an installed price survives writing and reading', () => {
    const withScrew: PriceList = { ...list(), products: [...list().products, screw] };
    const again = parsePriceListFile(priceListToXlsx(withScrew, 25.5), 'x');
    expect(again.ok ? [] : again.errors).toEqual([]);
    expect(again.ok && again.priceList.products.at(-1)).toEqual(screw);
    expect(installedPriceVat0(screw, 25.5)).toBeCloseTo(1000, 9);
    expect(anchorKindOf(screw)).toBe('screw');
    // A row without anchor_type is a concrete block.
    expect(anchorKindOf({ ...base, anchorKind: null })).toBe('block');
  });

  it('seabeds are separated by commas, semicolons or spaces', () => {
    expect(seabedList('Clay, sand;rock')).toEqual(['clay', 'sand', 'rock']);
    expect(seabedList('')).toEqual([]);
  });

  it('blocks are sized by the friction model; other kinds only by a published capacity with source and date', () => {
    const at = 'Products, row 9';
    expect(anchorRowErrors(screw, at)).toEqual([]);
    expect(anchorRowErrors({ ...base, capacityBasis: 'published' }, at)).toEqual([
      `${at}, capacity_basis: concrete blocks are sized by the friction model; use friction_model or leave it empty.`,
    ]);
    expect(anchorRowErrors({ ...base, capacityHorizontalKn: 20 }, at)).toEqual([
      `${at}: concrete blocks are sized by the friction model from anchor_mass_kg; leave capacity_horizontal_kn and capacity_uplift_kn empty.`,
    ]);
    expect(anchorRowErrors({ ...screw, capacityBasis: null }, at)).toEqual([`${at}, capacity_basis: a capacity needs capacity_basis = published (the supplier's figure).`]);
    expect(anchorRowErrors({ ...screw, capacityBasis: 'friction_model' }, at)).toEqual([
      `${at}, capacity_basis: only concrete blocks use the friction model; a screw needs a published capacity.`,
      `${at}, capacity_basis: a capacity needs capacity_basis = published (the supplier's figure).`,
    ]);
    expect(anchorRowErrors({ ...screw, sourceUrl: '' }, at)).toEqual([`${at}: a published capacity needs source_url and source_date (YYYY-MM-DD).`]);
    expect(anchorRowErrors({ ...screw, sourceDate: '2026' }, at)).toEqual([`${at}: a published capacity needs source_url and source_date (YYYY-MM-DD).`]);
    // A screw anchor without a capacity is allowed (it is then never chosen by itself).
    expect(anchorRowErrors({ ...screw, capacityHorizontalKn: null, capacityUpliftKn: null, capacityBasis: null }, at)).toEqual([]);
  });

  it('unknown kinds, bases and seabeds, negative values and anchor types on other rows are refused', () => {
    const at = 'Products, row 9';
    const errors = anchorRowErrors(
      { ...screw, anchorKind: 'helix' as Product['anchorKind'], capacityBasis: 'guess' as Product['capacityBasis'], seabeds: ['mud' as Product['seabeds'][number]], capacityUpliftKn: -1 },
      at,
    );
    expect(errors).toEqual([
      `${at}, anchor_type: "helix" is not one of block, screw, pile, rock_bolt, drag.`,
      `${at}, capacity_basis: "guess" is not one of friction_model, published.`,
      `${at}, seabed: "mud" is not one of clay, sand, rock.`,
      `${at}, capacity_uplift_kn: must not be negative.`,
      `${at}, capacity_basis: a capacity needs capacity_basis = published (the supplier's figure).`,
    ]);
    expect(anchorRowErrors({ ...base, category: 'chain', anchorKind: 'block', capacityBasis: null }, at)).toEqual([`${at}, anchor_type: only for rows of category anchor.`]);
  });

  it('the workbook check reports anchor problems by row', () => {
    const sheets = priceListToSheets({ ...list(), products: [...list().products, { ...screw, sourceUrl: '' }] }, 25.5).map((s) => ({
      name: s.name,
      rows: s.rows.map((r) => r.map((c) => (c !== null && typeof c === 'object' ? c.value : c))),
    }));
    const result = priceListFromSheets(sheets, 'x');
    expect(!result.ok && result.errors).toEqual([`Products, row ${list().products.length + 2}: a published capacity needs source_url and source_date (YYYY-MM-DD).`]);
  });
});

describe('price list workbook conversion', () => {
  it('writing and reading gives the same price list', () => {
    const again = parsePriceListFile(priceListToXlsx(list(), 25.5), 'hinnasto.xlsx');
    expect(again.ok && again.priceList).toEqual(list());
  });

  it('reports problems by sheet, row and column', () => {
    const sheets = priceListToSheets(list(), 25.5).map((s) => ({
      name: s.name,
      rows: s.rows.map((r) => r.map((c) => (c !== null && typeof c === 'object' ? c.value : c))),
    }));
    const products = sheets.find((s) => s.name === 'Products')!;
    const col = (key: string) => products.rows[0]!.indexOf(key);
    products.rows[2]![col('category')] = 'boat';
    products.rows[3]![col('price_eur')] = 'cheap';
    products.rows[4]![col('id')] = products.rows[1]![col('id')]!;
    products.rows[5]![col('price_includes_vat')] = 'maybe';
    products.rows[6]![col('unit')] = 'box';
    const result = priceListFromSheets(sheets, 'x');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([
      'Products, row 4, price_eur: "cheap" is not a number.',
      'Products, row 6, price_includes_vat: use TRUE or FALSE.',
      `Products, row 3, category: "boat" is not one of ${PRODUCT_CATEGORIES.join(', ')}.`,
      'Products, row 5: the id "pontoon-alaiturit-mx8-2_4" is used twice.',
      'Products, row 7, unit: "box" is not one of pcs, m, kg, h, day, lump.',
    ]);
  });

  it('accepts a decimal comma and yes/no typed as text', () => {
    const sheets = priceListToSheets(list(), 25.5).map((s) => ({
      name: s.name,
      rows: s.rows.map((r) => r.map((c) => (c !== null && typeof c === 'object' ? c.value : c))),
    }));
    const products = sheets.find((s) => s.name === 'Products')!;
    const col = (key: string) => products.rows[0]!.indexOf(key);
    products.rows[1]![col('price_eur')] = '10 960,50';
    products.rows[1]![col('price_includes_vat')] = 'kyllä';
    const result = priceListFromSheets(sheets, 'x');
    expect(result.ok && result.priceList.products[0]!.price).toBe(10960.5);
    expect(result.ok && result.priceList.products[0]!.priceIncludesVat).toBe(true);
  });

  it('needs the Products and Parameters sheets and the required columns', () => {
    expect(priceListFromSheets([{ name: 'Other', rows: [] }], 'x')).toEqual({
      ok: false,
      errors: ['The workbook has no sheet named "Products".', 'The workbook has no sheet named "Parameters".'],
    });
    const result = priceListFromSheets(
      [
        { name: 'Products', rows: [['id', 'name']] },
        { name: 'Parameters', rows: [['key', 'value']] },
      ],
      'x',
    );
    expect(!result.ok && result.errors).toEqual([
      'Products: column "category" is missing from the first row.',
      'Products: column "unit" is missing from the first row.',
    ]);
    expect(parsePriceListFile(new Uint8Array([1, 2, 3]), 'x')).toEqual({
      ok: false,
      errors: ['The file is not an Excel workbook (.xlsx).'],
    });
  });
});
