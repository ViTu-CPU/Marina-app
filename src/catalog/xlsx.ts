/**
 * Minimal reader and writer for Excel workbooks (.xlsx, Office Open XML), enough for the
 * price list (DECISIONS D19, I44): plain tables of text, numbers and booleans.
 *
 * Writing: one worksheet per table, inline strings, a bold header row, column widths, a
 * frozen header and optional formulas. Reading: shared and inline strings, numbers,
 * booleans and the cached results of formulas, as Excel and LibreOffice save them.
 * Styles, merged cells, dates and rich text formatting are ignored on reading.
 *
 * No DOM is used, so the same code runs in the browser and in Node (tests).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type CellValue = string | number | boolean | null;

/** A cell with a formula; `value` is stored as the cached result. */
export interface FormulaCell {
  formula: string;
  value: number | string;
}

export interface SheetData {
  name: string;
  rows: (CellValue | FormulaCell)[][];
  /** Column widths in characters. */
  columnWidths?: number[];
  /** Bold first row, frozen below it. */
  header?: boolean;
  /** Wrap text in every cell (for instructions). */
  wrap?: boolean;
}

export interface ReadSheet {
  name: string;
  /** Rows from the first row of the sheet; missing cells are null. */
  rows: CellValue[][];
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters not allowed in XML 1.0 are dropped.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const unescapeXml = (text: string): string =>
  text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_, entity: string) => {
    switch (entity) {
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      default:
        return String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
    }
  });

const attribute = (attrs: string, name: string): string | undefined => {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return match ? unescapeXml(match[1]!) : undefined;
};

/** Text of all <t> elements inside a fragment (shared string items, inline strings). */
const textOf = (fragment: string): string => {
  let text = '';
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) text += unescapeXml(m[1] ?? '');
  return text;
};

/** 0-based column index of a cell reference such as "AB12". */
export function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function sheetXml(sheet: SheetData): string {
  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const pane = sheet.header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const rows = sheet.rows
    .map((row, r) => {
      const style = sheet.header && r === 0 ? 1 : sheet.wrap ? 2 : 0;
      const cells = row
        .map((value, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          const s = style ? ` s="${style}"` : '';
          if (value === null || value === undefined || value === '') return '';
          if (typeof value === 'object') {
            const cached =
              typeof value.value === 'number' ? `<v>${value.value}</v>` : `<v>${escapeXml(String(value.value))}</v>`;
            const t = typeof value.value === 'number' ? '' : ' t="str"';
            return `<c r="${ref}"${s}${t}><f>${escapeXml(value.formula)}</f>${cached}</c>`;
          }
          if (typeof value === 'number') return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
          if (typeof value === 'boolean') return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
          return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const filter =
    sheet.header && sheet.rows.length > 0 && (sheet.rows[0]?.length ?? 0) > 0
      ? `<autoFilter ref="A1:${columnName(sheet.rows[0]!.length - 1)}${sheet.rows.length}"/>`
      : '';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${filter}</worksheet>`
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/** A workbook with the given sheets, as the bytes of an .xlsx file. */
export function writeXlsx(sheets: SheetData[]): Uint8Array {
  if (sheets.length === 0) throw new Error('A workbook needs at least one sheet');
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, xml: string) => (files[path] = strToU8(xml));
  add(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
  );
  add(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  );
  add(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
  );
  add(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>',
  );
  add('xl/styles.xml', STYLES);
  sheets.forEach((sheet, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)));
  // A fixed modification time keeps the file identical for identical content.
  return zipSync(files, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') });
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Resolve a relationship target against the folder of the part that refers to it. */
const resolvePath = (base: string, target: string): string => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
};

/** All sheets of an .xlsx file, in workbook order. Throws when the file is not a workbook. */
export function readXlsx(data: Uint8Array): ReadSheet[] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new Error('The file is not an Excel workbook (.xlsx).');
  }
  const text = (path: string): string | undefined => (files[path] ? strFromU8(files[path]!) : undefined);
  const workbook = text('xl/workbook.xml');
  const rels = text('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('The file is not an Excel workbook (.xlsx).');

  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attribute(m[1]!, 'Id');
    const target = attribute(m[1]!, 'Target');
    if (id && target) targets.set(id, resolvePath('xl/workbook.xml', target));
  }

  const shared: string[] = [];
  const sharedXml = text('xl/sharedStrings.xml');
  if (sharedXml) for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(textOf(m[1] ?? ''));

  const sheets: ReadSheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = attribute(m[1]!, 'name') ?? '';
    const rid = attribute(m[1]!, 'r:id');
    const xml = rid ? text(targets.get(rid) ?? '') : undefined;
    if (xml === undefined) continue;
    const rows: CellValue[][] = [];
    let nextRow = 0;
    for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rAttr = attribute(row[1]!, 'r');
      const r = rAttr ? Number(rAttr) - 1 : nextRow;
      nextRow = r + 1;
      const cells: CellValue[] = [];
      let nextCol = 0;
      for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1]!;
        const ref = attribute(attrs, 'r');
        const c = ref ? columnIndex(ref) : nextCol;
        nextCol = c + 1;
        const inner = cell[2] ?? '';
        const type = attribute(attrs, 't');
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value: CellValue = null;
        if (type === 'inlineStr') value = textOf(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? '');
        else if (raw === undefined) value = null;
        else if (type === 's') value = shared[Number(raw)] ?? '';
        else if (type === 'b') value = raw.trim() === '1';
        else if (type === 'str' || type === 'e') value = unescapeXml(raw);
        else {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : unescapeXml(raw);
        }
        while (cells.length < c) cells.push(null);
        cells[c] = value;
      }
      while (rows.length < r) rows.push([]);
      rows[r] = cells;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
