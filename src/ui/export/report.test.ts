import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePriceListFile } from '../../catalog/priceList';
import { DEMO_PROJECTS } from '../../engine/demos';
import { generateLayouts } from '../../engine/generate';
import { translate } from '../../i18n';
import { computeCostModel, waveInput } from '../costModel';
import { formatEuro } from '../format';
import { bomWorkbook } from './bomXlsx';
import { buildReportHtml } from './report';

const parsed = parsePriceListFile(readFileSync('data/hinnasto.xlsx'), 'hinnasto.xlsx');
if (!parsed.ok) throw new Error(parsed.errors.join());
const project = DEMO_PROJECTS[0]!.create();
project.name = 'Demo <script>alert(1)</script>';
project.layouts = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params: project.params, objective: project.objective }).layouts;
const layout = project.layouts[1]!;
const model = computeCostModel(project, layout, parsed.priceList)!;

describe('printable report (U24)', () => {
  const html = buildReportHtml({ project, layout, model, image: 'data:image/png;base64,AAAA', language: 'en', date: '2026-11-15' });

  it('carries the disclaimer on the first page and as a footer on every printed page', () => {
    const disclaimer = translate('en', 'app.disclaimer');
    expect(html.split(disclaimer).length - 1).toBe(2);
    expect(html).toContain('<div class="foot">');
    expect(html).toContain('position: fixed');
  });

  it('escapes text from the project', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Demo &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('has the map, the comparison with the reported alternative marked, inputs, anchoring and costs', () => {
    expect(html).toContain('<img class="map" src="data:image/png;base64,AAAA"');
    for (const l of project.layouts) expect(html).toContain(l.name);
    // The reported alternative is the second column.
    expect(html).toMatch(/<th class="n sel">[^<]*<br>/);
    for (const heading of ['Comparison', 'Inputs', 'Boat classes', 'Anchoring plan (preliminary)', 'Bill of materials and cost estimate', 'Sources and assumptions']) {
      expect(html).toContain(heading);
    }
    expect(html).toContain(`${formatEuro(model.estimate.totalVat0, 'en')} €`);
    expect(html).toContain('2026-11-15');
  });

  it('anchoring status, unpriced items, the excludes note on the totals and the friction sensitivity (D62)', () => {
    expect(html).toContain(translate('en', 'anchoring.status'));
    expect(html).toMatch(/\d+ lines OK, \d+ lines INFEASIBLE/);
    expect(model.estimate.unpriced.length).toBeGreaterThan(0);
    expect(html).toContain(`${translate('en', 'cost.unpriced')}: ${model.estimate.unpriced.length}`);
    expect(html).toMatch(/Total VAT 0 % \(excludes \d+ unpriced items?, see list\)/);
    expect(html).toContain(translate('en', 'sensitivity.title'));
    expect(html).toContain(translate('en', 'anchoring.maxAnchorsPerLine'));
    expect(html).toContain(translate('en', 'anchoring.capacitySafetyFactor'));
    expect(html).toContain('Gravity block capacity in soft clay is highly uncertain; requires geotechnical data.');
    const fi = buildReportHtml({ project, layout, model, image: null, language: 'fi', date: '2026-11-15' });
    expect(fi).toMatch(/Yhteensä ALV 0 % \(ei sisällä \d+ hinnoittelematonta erää, ks\. luettelo\)/);
    expect(fi).toContain(translate('fi', 'sensitivity.note'));
  });

  it('has the AS 3962-2001 advisory checks (D52)', () => {
    expect(html).toContain(translate('en', 'as3962.title'));
    expect(html).toContain('3.6.1');
  });

  it('lists the cost parameters with their sources and the product sources', () => {
    for (const p of model.priceList.parameters) expect(html).toContain(p.source.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;'));
    const urls = new Set(model.estimate.lines.map((l) => l.sourceUrl).filter((u) => u));
    for (const u of urls) expect(html).toContain(`href="${u.replace(/&/g, '&amp;')}"`);
  });

  it('wave screening only when entered; then waves, criteria, advice and the wind source (D40, D41)', () => {
    expect(html).not.toContain(translate('en', 'waves.title'));
    const sector = { rose: [0.02, 0.02, 0.01, 0, 0], annualMax: [15, 18], oneYear: 14.2, fiftyYear: 21.7 };
    const withWaves = {
      ...project,
      waves: {
        ...project.waves,
        sectors: project.waves.sectors.map((x, k) => ({ ...x, fetch: k === 2 ? 2000 : k === 4 ? 800 : 0 })),
        wind1: 15,
        wind50: 22,
        climate: {
          source: 'Open-Meteo Historical Weather API, ERA5',
          requested: { lat: 60.15, lon: 24.95 },
          cell: { lat: 60.25, lon: 25 },
          startYear: 1996,
          endYear: 2025,
          hours: 262968,
          fetchedOn: '2026-11-15',
          averagingS: 3600,
          sectors: Array.from({ length: 16 }, () => sector),
        },
      },
    };
    const w = buildReportHtml({ project: withWaves, layout, model, image: null, language: 'en', date: '2026-11-15' });
    expect(w).toContain(translate('en', 'waves.title'));
    expect(w).toContain(translate('en', 'waves.criteria'));
    expect(w).toContain('Open-Meteo Historical Weather API, ERA5');
    expect(w).toContain('1996–2025');
    expect(w).toMatch(/waveAdvice|attenuator|no wave protection|breakwater/);
    // D47: one row per sector with a fetch, the criteria set and the directions that exceed them.
    expect(w).toContain('E 90°');
    expect(w).toContain('S 180°');
    expect(w).not.toContain('N 0°');
    expect(w).toContain(translate('en', 'waveCriteria.as3962'));
    // D48: the breakwater types are compared when a direction exceeds the criteria.
    expect(w).toContain(translate('en', 'breakwater.title'));
    expect(w).toContain('3300BR');
  });

  it('in Finnish; without a price list or an image', () => {
    const fi = buildReportHtml({ project, layout, model: null, image: null, language: 'fi', date: '2026-11-15' });
    expect(fi).toContain('Venesataman alustava layout-tarkastelu');
    expect(fi).toContain(translate('fi', 'report.noPriceList'));
    expect(fi).not.toContain('<img');
    expect(fi).toContain('lang="fi"');
  });
});

describe('bill of materials workbook (D24)', () => {
  it('writes the parameters, also unknown (null) normal water levels (D50)', () => {
    expect(project.anchoring.normalHighWater).toBeNull();
    const bytes = bomWorkbook(project, layout, model, '2026-11-15');
    expect(bytes.length).toBeGreaterThan(2000);
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
  });
});

describe('breakwaters in the cost model (D58, I106)', () => {
  it('anchored in the plan and listed (not priced) in the estimate', () => {
    const withBw = { ...project, site: { ...project.site, breakwaters: [{ id: 'breakwater-1', start: { x: 0, y: 135 }, end: { x: 60, y: 135 }, product: '3800BR' }] } };
    const m = computeCostModel(withBw, layout, parsed.priceList)!;
    expect(m.anchoring.lines.some((l) => l.holdsId === 'breakwater-1')).toBe(true);
    // 60 m of 3800: 3 × M3820BR (19.90 m) = 59.7 m.
    expect(m.estimate.notes.find((n) => n.startsWith('Breakwater breakwater-1'))).toMatch(/Marinetek Breakwater 3800, drawn 60 m: 3 × M3820BR = 59\.7 m \(.* t\), not priced/);
  });
});

describe('wave directions for the anchoring plan (D45)', () => {
  it('the sectors with a fetch, and those whose waves exceed the criteria', () => {
    expect(waveInput(project, layout)).toEqual({ from: [], exceeding: [], hs50: [] });
    const withFetch = { ...project, waves: { ...project.waves, wind1: 15, wind50: 22, sectors: project.waves.sectors.map((x, k) => ({ ...x, fetch: k === 2 ? 3000 : k === 4 ? 200 : 0 })) } };
    const w = waveInput(withFetch, layout);
    expect(w.from).toEqual([90, 180]);
    expect(w.exceeding).toContain('E');
    // I104: the 50-year Hm0 of each direction: 3 km from the east is above the 0.6 m of the full
    // wave load, 200 m from the south below the 0.3 m of none.
    expect(w.hs50).toHaveLength(2);
    expect(w.hs50[0]!).toBeGreaterThan(0.6);
    expect(w.hs50[1]!).toBeLessThan(0.3);
    // The cost model passes them on: the plan carries the wave load warning.
    const m = computeCostModel(withFetch, layout, parsed.priceList)!;
    expect(m.anchoring.issues.some((i) => i.code === 'WAVE_LOAD')).toBe(true);
    expect(m.anchoring.issues.some((i) => i.code === 'WAVE_LOAD_ABOVE_CRITERIA')).toBe(true);
    expect(m.anchoring.issues.some((i) => i.code === 'WAVE_LOAD_SMALL_WAVES')).toBe(true);
  });
});
