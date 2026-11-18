/**
 * The price list as an Excel workbook (DECISIONS D19, I44): conversion between the
 * workbook's sheets and `PriceList`, with validation that names the sheet, row and column
 * of every problem.
 *
 * Sheets: "Products" (one row per product, labour or plant rate), "Parameters" (cost and
 * labour parameters) and "Instructions" (not read). The first row of each read sheet holds
 * the column keys below; their order does not matter and unknown columns are ignored.
 */
import {
  ANCHOR_KINDS,
  CAPACITY_BASES,
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  SEABED_TYPES,
  type AnchorKind,
  type CapacityBasis,
  type PriceList,
  type PriceParameter,
  type Product,
  type ProductCategory,
  type ProductUnit,
  type SeabedType,
} from '../engine/catalog';
import { readXlsx, writeXlsx, type CellValue, type FormulaCell, type ReadSheet, type SheetData } from './xlsx';

type Kind = 'text' | 'number' | 'boolean';

interface Column {
  key: string;
  kind: Kind;
  required?: boolean;
  width: number;
  /** English and Finnish explanation, shown on the Instructions sheet. */
  help: [string, string];
}

export const PRODUCT_COLUMNS: Column[] = [
  { key: 'id', kind: 'text', required: true, width: 30, help: ['Unique key of the row; keep it when editing.', 'Rivin yksilöivä tunnus; älä muuta muokatessa.'] },
  { key: 'category', kind: 'text', required: true, width: 11, help: [`One of: ${PRODUCT_CATEGORIES.join(', ')}.`, 'Tuoteryhmä (ks. englanninkielinen luettelo).'] },
  { key: 'supplier', kind: 'text', width: 18, help: ['Supplier or source.', 'Toimittaja tai lähde.'] },
  { key: 'series', kind: 'text', width: 26, help: ['Products of one series are size alternatives (one pontoon width, one boom type).', 'Saman sarjan tuotteet ovat saman tuotteen kokovaihtoehtoja.'] },
  { key: 'name', kind: 'text', required: true, width: 34, help: ['Product name as published.', 'Tuotteen nimi kuten julkaistu.'] },
  { key: 'code', kind: 'text', width: 10, help: ['Product code.', 'Tuotekoodi.'] },
  { key: 'unit', kind: 'text', required: true, width: 6, help: [`One of: ${PRODUCT_UNITS.join(', ')}.`, 'Yksikkö: pcs = kpl, m, kg, h, day = päivä, lump = erä.'] },
  { key: 'price_eur', kind: 'number', width: 10, help: ['Price per unit exactly as published, €. Empty = no price known.', 'Yksikköhinta kuten julkaistu, €. Tyhjä = hintaa ei tiedetä.'] },
  { key: 'price_includes_vat', kind: 'boolean', width: 9, help: ['TRUE if the published price includes VAT (it is converted to VAT 0 % with vat_pct).', 'TRUE, jos hinta sisältää ALV:n (muunnetaan verottomaksi vat_pct-parametrilla).'] },
  { key: 'margin_pct', kind: 'number', width: 8, help: ['Extra quantity ordered on top of the calculated one (waste, cutting), %.', 'Lisämäärä lasketun päälle (hukka, katkaisu), %.'] },
  { key: 'length_m', kind: 'number', width: 8, help: ['Length, m (pontoons, booms, gangways).', 'Pituus, m.'] },
  { key: 'width_m', kind: 'number', width: 8, help: ['Width, m.', 'Leveys, m.'] },
  { key: 'weight_kg', kind: 'number', width: 9, help: ['Weight, kg.', 'Paino, kg.'] },
  { key: 'capacity_kg', kind: 'number', width: 9, help: ['Load capacity as published, kg.', 'Kantavuus kuten julkaistu, kg.'] },
  { key: 'freeboard_m', kind: 'number', width: 9, help: ['Freeboard (deck height above water), m.', 'Kansikorkeus vedenpinnasta, m.'] },
  { key: 'chain_diameter_mm', kind: 'number', width: 9, help: ['Chain wire diameter, mm.', 'Kettingin ainevahvuus, mm.'] },
  { key: 'chain_grade', kind: 'text', width: 16, help: ['Chain grade and standard as published.', 'Kettingin laatuluokka ja standardi.'] },
  { key: 'breaking_load_kn', kind: 'number', width: 9, help: ['Minimum breaking load as published, kN. Chains without it are not chosen by the anchoring calculation.', 'Murtokuorma kuten julkaistu, kN. Ankkurointilaskenta ei valitse kettinkiä ilman sitä.'] },
  { key: 'mass_kg_per_m', kind: 'number', width: 9, help: ['Chain mass, kg/m.', 'Kettingin paino, kg/m.'] },
  { key: 'anchor_mass_kg', kind: 'number', width: 9, help: ['Mass of a concrete anchor in air, kg.', 'Betoniankkurin massa ilmassa, kg.'] },
  {
    key: 'anchor_type',
    kind: 'text',
    width: 9,
    help: [
      `Anchors only: ${ANCHOR_KINDS.join(', ')}. Empty = block (concrete weight). Blocks are sized by the friction model from anchor_mass_kg; the other kinds only by their published capacity.`,
      'Vain ankkurit: block = betonipaino (mitoitetaan kitkamallilla massasta), screw = kierreankkuri, pile = paalu, rock_bolt = kallioankkuri, drag = laahausankkuri. Tyhjä = block.',
    ],
  },
  {
    key: 'capacity_horizontal_kn',
    kind: 'number',
    width: 9,
    help: [
      'Anchors other than blocks: holding capacity of one piece against horizontal pull as the supplier publishes it, kN (with capacity_basis = published). Empty = not known: the tool never chooses the product by itself.',
      'Muut kuin betonipainot: yhden kappaleen vaakapito kuten toimittaja julkaisee, kN (capacity_basis = published). Tyhjä = ei tiedossa: työkalu ei valitse tuotetta automaattisesti.',
    ],
  },
  {
    key: 'capacity_uplift_kn',
    kind: 'number',
    width: 9,
    help: [
      'Anchors other than blocks: holding capacity of one piece against uplift as published, kN. Needed for lines whose chain lifts at the anchor.',
      'Muut kuin betonipainot: yhden kappaleen nostopito kuten julkaistu, kN. Tarvitaan linjoille, joiden ketju nostaa ankkuria.',
    ],
  },
  {
    key: 'capacity_basis',
    kind: 'text',
    width: 12,
    help: [
      `Anchors: ${CAPACITY_BASES.join(' or ')}. friction_model = blocks (computed from the mass); published = the supplier's figure, which needs source_url and source_date.`,
      'Ankkurit: friction_model = betonipainot (lasketaan massasta); published = toimittajan julkaisema arvo, joka vaatii lähteen (source_url) ja päivämäärän (source_date).',
    ],
  },
  {
    key: 'seabed',
    kind: 'text',
    width: 12,
    help: [
      `Anchors: the seabeds the product suits, separated by commas (${SEABED_TYPES.join(', ')}). Empty = not stated: a block suits any seabed; other kinds are then not chosen.`,
      'Ankkurit: pohjatyypit, joihin tuote sopii, pilkuin eroteltuina (clay = savi, sand = hiekka, rock = kallio). Tyhjä = ei ilmoitettu: betonipaino sopii kaikkiin, muita tyyppejä ei silloin valita.',
    ],
  },
  {
    key: 'installed_unit_price_eur',
    kind: 'number',
    width: 10,
    help: [
      'Price of one piece installed (supply and installation), €, with the VAT status of price_includes_vat. Empty = price_eur is the supply price and the installation is estimated from the labour parameters.',
      'Asennetun kappaleen hinta (toimitus ja asennus), €, ALV kuten price_includes_vat. Tyhjä = price_eur on toimitushinta ja asennus arvioidaan työparametreista.',
    ],
  },
  { key: 'shackle_mm', kind: 'number', width: 8, help: ['Nominal shackle size, mm.', 'Sakkelin koko, mm.'] },
  { key: 'source_url', kind: 'text', width: 40, help: ['Where the price and data come from.', 'Hinnan ja tietojen lähde.'] },
  { key: 'source_date', kind: 'text', width: 11, help: ['Date the source was read, YYYY-MM-DD.', 'Lähteen lukupäivä, VVVV-KK-PP.'] },
  { key: 'note', kind: 'text', width: 50, help: ['What the price includes, unverified data, assumptions.', 'Mitä hinta sisältää, varmistamattomat tiedot, oletukset.'] },
];

/** Extra column written for the reader's convenience; it is never read back. */
const VAT0_HEADER = 'price_vat0_eur (calculated, not read)';

export const PARAMETER_COLUMNS: Column[] = [
  { key: 'key', kind: 'text', required: true, width: 30, help: ['Parameter key used by the tool.', 'Ohjelman käyttämä parametrin tunnus.'] },
  { key: 'value', kind: 'number', required: true, width: 10, help: ['Value.', 'Arvo.'] },
  { key: 'unit', kind: 'text', width: 10, help: ['Unit.', 'Yksikkö.'] },
  { key: 'description', kind: 'text', width: 60, help: ['What it is used for.', 'Mihin arvoa käytetään.'] },
  { key: 'source', kind: 'text', width: 60, help: ['Source, or "Assumption".', 'Lähde tai "Oletus".'] },
];

export const SHEET_PRODUCTS = 'Products';
export const SHEET_PARAMETERS = 'Parameters';
export const SHEET_INSTRUCTIONS = 'Instructions';

export type ParseResult = { ok: true; priceList: PriceList } | { ok: false; errors: string[] };

/** "clay, sand" → ['clay', 'sand']; commas, semicolons or spaces between. Unknown words are kept for the check. */
export const seabedList = (text: string): SeabedType[] =>
  text
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x !== '') as SeabedType[];

const toProduct = (row: Record<string, CellValue>): Product => {
  const text = (k: string) => (row[k] === null || row[k] === undefined ? '' : String(row[k]).trim());
  const num = (k: string) => (typeof row[k] === 'number' ? (row[k] as number) : null);
  return {
    id: text('id'),
    category: text('category') as ProductCategory,
    supplier: text('supplier'),
    series: text('series'),
    name: text('name'),
    code: text('code'),
    unit: text('unit') as ProductUnit,
    price: num('price_eur'),
    priceIncludesVat: row.price_includes_vat === true,
    marginPct: num('margin_pct') ?? 0,
    lengthM: num('length_m'),
    widthM: num('width_m'),
    weightKg: num('weight_kg'),
    capacityKg: num('capacity_kg'),
    freeboardM: num('freeboard_m'),
    chainDiameterMm: num('chain_diameter_mm'),
    chainGrade: text('chain_grade'),
    breakingLoadKn: num('breaking_load_kn'),
    massKgPerM: num('mass_kg_per_m'),
    anchorMassKg: num('anchor_mass_kg'),
    anchorKind: text('anchor_type') === '' ? null : (text('anchor_type').toLowerCase() as AnchorKind),
    capacityHorizontalKn: num('capacity_horizontal_kn'),
    capacityUpliftKn: num('capacity_uplift_kn'),
    capacityBasis: text('capacity_basis') === '' ? null : (text('capacity_basis').toLowerCase() as CapacityBasis),
    seabeds: seabedList(text('seabed')),
    installedPrice: num('installed_unit_price_eur'),
    shackleMm: num('shackle_mm'),
    sourceUrl: text('source_url'),
    sourceDate: text('source_date'),
    note: text('note'),
  };
};

/**
 * Rows of a sheet as records keyed by the header row. Checks the cell types; problems are
 * appended to `errors` as "Sheet, row N, column: message".
 */
function records(sheet: ReadSheet, columns: Column[], errors: string[]): Record<string, CellValue>[] {
  const header = (sheet.rows[0] ?? []).map((h) => (typeof h === 'string' ? h.trim() : ''));
  const indexOf = new Map(header.map((h, i) => [h, i]));
  for (const c of columns) {
    if (c.required && !indexOf.has(c.key)) errors.push(`${sheet.name}: column "${c.key}" is missing from the first row.`);
  }
  const out: Record<string, CellValue>[] = [];
  sheet.rows.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c === null || c === '')) return; // empty row
    const rowNo = i + 2;
    const record: Record<string, CellValue> = {};
    for (const c of columns) {
      const index = indexOf.get(c.key);
      let value: CellValue = index === undefined ? null : (cells[index] ?? null);
      if (typeof value === 'string' && value.trim() === '') value = null;
      const where = `${sheet.name}, row ${rowNo}, ${c.key}`;
      if (value === null) {
        if (c.required) errors.push(`${where}: a value is required.`);
      } else if (c.kind === 'number' && typeof value !== 'number') {
        // A decimal comma typed as text is accepted.
        const n = typeof value === 'string' ? Number(value.replace(',', '.').replace(/\s/g, '')) : NaN;
        if (Number.isFinite(n)) value = n;
        else errors.push(`${where}: "${String(value)}" is not a number.`);
      } else if (c.kind === 'boolean' && typeof value !== 'boolean') {
        const t = String(value).trim().toLowerCase();
        if (['true', 'yes', 'kyllä', '1'].includes(t)) value = true;
        else if (['false', 'no', 'ei', '0'].includes(t)) value = false;
        else errors.push(`${where}: use TRUE or FALSE.`);
      }
      record[c.key] = value;
    }
    out.push(record);
  });
  return out;
}

/** The price list in an Excel workbook, or the list of problems found in it. */
export function priceListFromSheets(sheets: ReadSheet[], title: string): ParseResult {
  const errors: string[] = [];
  const productSheet = sheets.find((s) => s.name === SHEET_PRODUCTS);
  const parameterSheet = sheets.find((s) => s.name === SHEET_PARAMETERS);
  if (!productSheet) errors.push(`The workbook has no sheet named "${SHEET_PRODUCTS}".`);
  if (!parameterSheet) errors.push(`The workbook has no sheet named "${SHEET_PARAMETERS}".`);
  if (!productSheet || !parameterSheet) return { ok: false, errors };

  const products = records(productSheet, PRODUCT_COLUMNS, errors).map(toProduct);
  const seen = new Set<string>();
  products.forEach((p, i) => {
    const where = `${SHEET_PRODUCTS}, row ${i + 2}`;
    if (seen.has(p.id)) errors.push(`${where}: the id "${p.id}" is used twice.`);
    seen.add(p.id);
    if (p.id && !(PRODUCT_CATEGORIES as readonly string[]).includes(p.category)) {
      errors.push(`${where}, category: "${p.category}" is not one of ${PRODUCT_CATEGORIES.join(', ')}.`);
    }
    if (p.id && !(PRODUCT_UNITS as readonly string[]).includes(p.unit)) {
      errors.push(`${where}, unit: "${p.unit}" is not one of ${PRODUCT_UNITS.join(', ')}.`);
    }
    if (p.price !== null && p.price < 0) errors.push(`${where}, price_eur: must not be negative.`);
    errors.push(...anchorRowErrors(p, where));
  });

  const parameters: PriceParameter[] = records(parameterSheet, PARAMETER_COLUMNS, errors).map((r) => ({
    key: String(r.key ?? '').trim(),
    value: typeof r.value === 'number' ? r.value : NaN,
    unit: String(r.unit ?? ''),
    description: String(r.description ?? ''),
    source: String(r.source ?? ''),
  }));
  const keys = new Set<string>();
  parameters.forEach((p, i) => {
    if (keys.has(p.key)) errors.push(`${SHEET_PARAMETERS}, row ${i + 2}: the key "${p.key}" is used twice.`);
    keys.add(p.key);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, priceList: { title, products, parameters } };
}

/**
 * D62: checks of the anchor columns of one product row: known kinds, bases and seabeds; blocks are
 * sized by the friction model; other kinds only by a published capacity with its source and date.
 */
export function anchorRowErrors(p: Product, where: string): string[] {
  const errors: string[] = [];
  if (p.anchorKind !== null && !(ANCHOR_KINDS as readonly string[]).includes(p.anchorKind)) {
    errors.push(`${where}, anchor_type: "${p.anchorKind}" is not one of ${ANCHOR_KINDS.join(', ')}.`);
  }
  if (p.anchorKind !== null && p.category !== 'anchor') errors.push(`${where}, anchor_type: only for rows of category anchor.`);
  if (p.capacityBasis !== null && !(CAPACITY_BASES as readonly string[]).includes(p.capacityBasis)) {
    errors.push(`${where}, capacity_basis: "${p.capacityBasis}" is not one of ${CAPACITY_BASES.join(', ')}.`);
  }
  for (const s of p.seabeds) {
    if (!(SEABED_TYPES as readonly string[]).includes(s)) errors.push(`${where}, seabed: "${s}" is not one of ${SEABED_TYPES.join(', ')}.`);
  }
  for (const [key, value] of [
    ['capacity_horizontal_kn', p.capacityHorizontalKn],
    ['capacity_uplift_kn', p.capacityUpliftKn],
    ['installed_unit_price_eur', p.installedPrice],
  ] as const) {
    if (value !== null && value < 0) errors.push(`${where}, ${key}: must not be negative.`);
  }
  const hasCapacity = p.capacityHorizontalKn !== null || p.capacityUpliftKn !== null;
  const block = p.anchorKind === null || p.anchorKind === 'block';
  if (block) {
    if (p.capacityBasis === 'published') errors.push(`${where}, capacity_basis: concrete blocks are sized by the friction model; use friction_model or leave it empty.`);
    if (hasCapacity) errors.push(`${where}: concrete blocks are sized by the friction model from anchor_mass_kg; leave capacity_horizontal_kn and capacity_uplift_kn empty.`);
  } else {
    if (p.capacityBasis === 'friction_model') errors.push(`${where}, capacity_basis: only concrete blocks use the friction model; a ${p.anchorKind} needs a published capacity.`);
    if (hasCapacity && p.capacityBasis !== 'published') errors.push(`${where}, capacity_basis: a capacity needs capacity_basis = published (the supplier's figure).`);
  }
  if (p.capacityBasis === 'published' && (!p.sourceUrl || !/^\d{4}-\d{2}-\d{2}$/.test(p.sourceDate))) {
    errors.push(`${where}: a published capacity needs source_url and source_date (YYYY-MM-DD).`);
  }
  return errors;
}

export function parsePriceListFile(data: Uint8Array, title: string): ParseResult {
  try {
    return priceListFromSheets(readXlsx(data), title);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

const INSTRUCTIONS: string[][] = [
  ['Marina Layout Planner – price list / hinnasto'],
  [''],
  ['EN: This workbook holds the prices, labour and plant rates and cost parameters the tool uses for the bill of materials and the cost estimate. Edit the "Products" and "Parameters" sheets and import the file in the tool (Cost estimate → Import price list), or replace data/hinnasto.xlsx in the repository and rebuild.'],
  ['FI: Työkirjassa ovat hinnat, työ- ja konekustannukset sekä kustannusparametrit, joita työkalu käyttää tuoteluetteloon ja kustannusarvioon. Muokkaa välilehtiä "Products" ja "Parameters" ja tuo tiedosto työkaluun (Kustannusarvio → Tuo hinnasto) tai korvaa repositorion tiedosto data/hinnasto.xlsx ja käännä sovellus uudelleen.'],
  [''],
  ['EN: Enter prices exactly as the source publishes them and say whether they include VAT; the tool converts them to VAT 0 % with the parameter vat_pct and adds VAT to the total only. Keep source_url and source_date up to date: the estimate shows them. Rows marked "Assumption" or "ESTIMATE" in the note have no public source and should be replaced with quotes.'],
  ['FI: Syötä hinnat kuten lähde ne julkaisee ja kerro, sisältävätkö ne ALV:n; työkalu muuntaa ne verottomiksi parametrilla vat_pct ja lisää ALV:n vain loppusummaan. Pidä source_url ja source_date ajan tasalla: arvio näyttää ne. Rivit, joiden huomautuksessa lukee "Assumption" tai "ESTIMATE", eivät perustu julkiseen lähteeseen ja ne kannattaa korvata tarjoushinnoilla.'],
  [''],
  ['Not an engineering design. Product data (capacities, breaking loads) must be confirmed by the supplier and checked by a qualified marina engineer. / Ei rakennesuunnitelma. Tuotetiedot (kantavuudet, murtokuormat) on varmistettava toimittajalta ja pätevän suunnittelijan tarkastettava.'],
  [''],
  ['Columns of "Products" / välilehden "Products" sarakkeet:'],
  ...PRODUCT_COLUMNS.map((c) => [`${c.key}${c.required ? ' (required)' : ''}: ${c.help[0]} / ${c.help[1]}`]),
  [`${VAT0_HEADER}: shown for convenience, never read. / Näytetään vain avuksi, ei lueta.`],
  [''],
  ['Columns of "Parameters" / välilehden "Parameters" sarakkeet:'],
  ...PARAMETER_COLUMNS.map((c) => [`${c.key}${c.required ? ' (required)' : ''}: ${c.help[0]} / ${c.help[1]}`]),
];

const productCell = (p: Product, key: string): CellValue => {
  switch (key) {
    case 'id':
      return p.id;
    case 'category':
      return p.category;
    case 'supplier':
      return p.supplier;
    case 'series':
      return p.series;
    case 'name':
      return p.name;
    case 'code':
      return p.code;
    case 'unit':
      return p.unit;
    case 'price_eur':
      return p.price;
    case 'price_includes_vat':
      return p.priceIncludesVat;
    case 'margin_pct':
      return p.marginPct;
    case 'length_m':
      return p.lengthM;
    case 'width_m':
      return p.widthM;
    case 'weight_kg':
      return p.weightKg;
    case 'capacity_kg':
      return p.capacityKg;
    case 'freeboard_m':
      return p.freeboardM;
    case 'chain_diameter_mm':
      return p.chainDiameterMm;
    case 'chain_grade':
      return p.chainGrade;
    case 'breaking_load_kn':
      return p.breakingLoadKn;
    case 'mass_kg_per_m':
      return p.massKgPerM;
    case 'anchor_mass_kg':
      return p.anchorMassKg;
    case 'anchor_type':
      return p.anchorKind;
    case 'capacity_horizontal_kn':
      return p.capacityHorizontalKn;
    case 'capacity_uplift_kn':
      return p.capacityUpliftKn;
    case 'capacity_basis':
      return p.capacityBasis;
    case 'seabed':
      return p.seabeds.length > 0 ? p.seabeds.join(', ') : null;
    case 'installed_unit_price_eur':
      return p.installedPrice;
    case 'shackle_mm':
      return p.shackleMm;
    case 'source_url':
      return p.sourceUrl;
    case 'source_date':
      return p.sourceDate;
    case 'note':
      return p.note;
    default:
      return null;
  }
};

/** The price list as workbook sheets: Instructions, Products, Parameters. */
export function priceListToSheets(list: PriceList, vatPct: number): SheetData[] {
  const priceCol = PRODUCT_COLUMNS.findIndex((c) => c.key === 'price_eur');
  const vatCol = PRODUCT_COLUMNS.findIndex((c) => c.key === 'price_includes_vat');
  const letter = (i: number) => String.fromCharCode(65 + i); // both columns are within A–Z
  const vatRef = `Parameters!$B$${list.parameters.findIndex((p) => p.key === 'vat_pct') + 2}`;
  const hasVat = list.parameters.some((p) => p.key === 'vat_pct');
  const products: (CellValue | FormulaCell)[][] = [
    [...PRODUCT_COLUMNS.map((c) => c.key), VAT0_HEADER],
    ...list.products.map((p, i) => {
      const row = i + 2;
      const vat0 = p.price === null ? null : p.priceIncludesVat ? p.price / (1 + vatPct / 100) : p.price;
      const formula = hasVat
        ? `IF(${letter(priceCol)}${row}="","",IF(${letter(vatCol)}${row},${letter(priceCol)}${row}/(1+${vatRef}/100),${letter(priceCol)}${row}))`
        : null;
      const calculated: CellValue | FormulaCell =
        vat0 === null ? null : formula ? { formula, value: Math.round(vat0 * 100) / 100 } : Math.round(vat0 * 100) / 100;
      return [...PRODUCT_COLUMNS.map((c) => productCell(p, c.key)), calculated];
    }),
  ];
  const parameters: CellValue[][] = [
    PARAMETER_COLUMNS.map((c) => c.key),
    ...list.parameters.map((p) => [p.key, p.value, p.unit, p.description, p.source]),
  ];
  return [
    { name: SHEET_INSTRUCTIONS, rows: INSTRUCTIONS, columnWidths: [160], wrap: true },
    { name: SHEET_PRODUCTS, rows: products, columnWidths: [...PRODUCT_COLUMNS.map((c) => c.width), 16], header: true },
    { name: SHEET_PARAMETERS, rows: parameters, columnWidths: PARAMETER_COLUMNS.map((c) => c.width), header: true },
  ];
}

export function priceListToXlsx(list: PriceList, vatPct: number): Uint8Array {
  return writeXlsx(priceListToSheets(list, vatPct));
}
