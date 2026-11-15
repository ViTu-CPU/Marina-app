import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { columnIndex, columnName, readXlsx, writeXlsx } from '../xlsx';

describe('xlsx writer and reader', () => {
  it('column names and indices', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(['A1', 'Z9', 'AA10', 'ZZ3', 'AAA1'].map(columnIndex)).toEqual([0, 25, 26, 701, 702]);
  });

  it('round trip: text, numbers, booleans, empty cells, formulas (cached value), special characters', () => {
    const bytes = writeXlsx([
      {
        name: 'Products',
        header: true,
        columnWidths: [10, 20],
        rows: [
          ['id', 'price', 'vat', 'note'],
          ['a', 12.5, true, 'Ä & ö <tag> "quoted"'],
          ['b', null, false, ''],
          ['c', { formula: 'B2*2', value: 25 }, null, 'line\nbreak'],
        ],
      },
      { name: 'Notes', rows: [['only one cell']] },
    ]);
    const sheets = readXlsx(bytes);
    expect(sheets.map((s) => s.name)).toEqual(['Products', 'Notes']);
    expect(sheets[0]!.rows).toEqual([
      ['id', 'price', 'vat', 'note'],
      ['a', 12.5, true, 'Ä & ö <tag> "quoted"'],
      ['b', null, false],
      ['c', 25, null, 'line\nbreak'],
    ]);
    expect(sheets[1]!.rows).toEqual([['only one cell']]);
  });

  it('the same content gives the same bytes', () => {
    const sheet = { name: 'S', rows: [['x', 1]] };
    expect(writeXlsx([sheet])).toEqual(writeXlsx([sheet]));
  });

  it('reads a workbook as Excel saves it: shared strings, rich text runs, sparse cells, str formulas', () => {
    const files = {
      'xl/workbook.xml': strToU8(
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hinnat" sheetId="7" r:id="rId3"/></sheets></workbook>',
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId3" Type="worksheet" Target="/xl/worksheets/sheet9.xml"/></Relationships>',
      ),
      'xl/sharedStrings.xml': strToU8(
        '<?xml version="1.0"?><sst count="3" uniqueCount="3"><si><t>id</t></si><si><r><rPr><b/></rPr><t>Kettinki </t></r><r><t xml:space="preserve">16 mm</t></r></si><si><t>a&amp;b</t></si></sst>',
      ),
      'xl/worksheets/sheet9.xml': strToU8(
        '<?xml version="1.0"?><worksheet><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" s="4"><v>27.8</v></c><c r="C3" t="b"><v>1</v></c><c r="D3" t="str"><f>A3</f><v>Kettinki 16 mm</v></c><c r="E3"/></row>' +
          '</sheetData></worksheet>',
      ),
    };
    const [sheet] = readXlsx(zipSync(files));
    expect(sheet!.name).toBe('Hinnat');
    expect(sheet!.rows).toEqual([['id', null, 'a&b'], [], ['Kettinki 16 mm', 27.8, true, 'Kettinki 16 mm', null]]);
  });

  it('rejects a file that is not a workbook', () => {
    expect(() => readXlsx(strToU8('not a zip'))).toThrow('not an Excel workbook');
    expect(() => readXlsx(zipSync({ 'a.txt': strToU8('x') }))).toThrow('not an Excel workbook');
  });
});
