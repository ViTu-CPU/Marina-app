import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePriceListFile } from '../../catalog/priceList';
import { BREAKWATERS } from '../../engine/breakwater';
import { DEMO_PROJECTS } from '../../engine/demos';
import { generateLayouts } from '../../engine/generate';
import { computeCostModel } from '../costModel';
import { anchorSymbolSide, blockName, buildDxf, dxfSummary, dxfText } from './dxf';

const parsed = parsePriceListFile(readFileSync('data/hinnasto.xlsx'), 'hinnasto.xlsx');
if (!parsed.ok) throw new Error(parsed.errors.join('; '));
const project = DEMO_PROJECTS[0]!.create();
project.layouts = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params: project.params, objective: project.objective }).layouts;
const layout = project.layouts[0]!;
project.site = { ...project.site, breakwaters: [{ id: 'breakwater-1', start: { x: 0, y: 135 }, end: { x: 60, y: 135 }, product: '3300BR' }] };
const model = computeCostModel(project, layout, parsed.priceList)!;
const text = buildDxf({ project, layout, priceList: model.priceList, choices: model.choices, vatPct: model.vatPct, date: '2026-11-16' });
const summary = dxfSummary(text);

describe('DXF export with the product library (D61, I111)', () => {
  it('is an R12 DXF: header, tables, blocks, entities, EOF; CRLF lines in code/value pairs', () => {
    expect(text.startsWith('0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009\r\n')).toBe(true);
    expect(text.endsWith('0\r\nENDSEC\r\n0\r\nEOF\r\n')).toBe(true);
    const lines = text.split('\r\n');
    expect(lines.length % 2).toBe(1); // pairs plus the final empty string
    for (let i = 0; i + 1 < lines.length; i += 2) expect(lines[i]).toMatch(/^\s*\d+$/);
    expect(['SECTION', 'TABLES', 'BLOCKS', 'ENTITIES'].every((w) => text.includes(`\r\n${w}\r\n`))).toBe(true);
    // Only ASCII in the file (other characters as \U+XXXX).
    expect(/^[\x00-\x7f]*$/.test(text)).toBe(true);
  });

  it('every product with a plan size is a block, every block is defined once, and every insert has a block', () => {
    const withSize = parsed.priceList.products.filter((p) => (p.lengthM && p.widthM && ['pontoon', 'finger', 'gangway'].includes(p.category)) || (p.category === 'anchor' && p.anchorMassKg) || p.category === 'buoy');
    const breakwaterModules = BREAKWATERS.flatMap((b) => b.modules).length;
    expect(summary.blocks.length).toBeGreaterThanOrEqual(withSize.length + breakwaterModules);
    expect(new Set(summary.blocks).size).toBe(summary.blocks.length);
    expect(summary.blocks.every((b) => /^[A-Z0-9_-]{1,31}$/.test(b))).toBe(true);
    const defined = new Set(summary.blocks);
    expect(summary.inserts.every((i) => defined.has(i))).toBe(true);
  });

  it('the layout is built of inserts: pontoon modules, fingers, gangways, breakwater modules, anchors; the library has one insert per block', () => {
    const count = (prefix: string) => summary.inserts.filter((i) => i.startsWith(prefix)).length;
    expect(count('PON_')).toBeGreaterThan(layout.piers.length); // several modules per pier, plus the library
    expect(count('FIN_')).toBeGreaterThanOrEqual(layout.fingers.length);
    expect(count('GW_')).toBeGreaterThan(0);
    expect(count('BW_')).toBeGreaterThanOrEqual(3 + BREAKWATERS.flatMap((b) => b.modules).length); // 60 m = 3 × 19.9 m
    expect(count('ANC_')).toBeGreaterThan(0);
    expect(text).toContain('PRODUCT LIBRARY');
    expect(summary.layers).toEqual(expect.arrayContaining(['WATER', 'PONTOONS', 'FINGERS', 'BERTHS', 'CHAINS', 'ANCHORS', 'BREAKWATERS', 'LIBRARY']));
  });

  it('helpers: block names, text escapes, anchor symbols', () => {
    const used = new Set<string>();
    expect(blockName('PON', 'marinetek-premier-2712', used)).toBe('PON_MARINETEK-PREMIER-2712');
    expect(blockName('PON', 'marinetek-premier-2712', used)).toBe('PON_MARINETEK-PREMIER-2712_2');
    expect(blockName('GW', 'käyntisilta 1,2 × 5 m with a very long name', new Set())).toHaveLength(31);
    expect(dxfText('Käyntisilta 1,2 × 5 m')).toBe('K\\U+00E4yntisilta 1,2 \\U+00D7 5 m');
    expect(anchorSymbolSide(2400)).toBeCloseTo(1, 9);
  });

  it('without a price list: outlines and per-metre pontoons only', () => {
    const bare = buildDxf({ project, layout, priceList: null, choices: null, vatPct: 0, date: '2026-11-16' });
    const s = dxfSummary(bare);
    expect(s.inserts.some((i) => i.startsWith('PON_PER_M'))).toBe(true);
    expect(s.inserts.some((i) => i.startsWith('ANC_'))).toBe(false);
  });
});
