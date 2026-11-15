import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePriceListFile } from '../../catalog/priceList';
import { DEMO_PROJECTS } from '../../engine/demos';
import { generateLayouts } from '../../engine/generate';
import { translate } from '../../i18n';
import { computeCostModel } from '../costModel';
import { formatEuro } from '../format';
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
        fetch: 2000,
        fetchFrom: 90,
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
  });

  it('in Finnish; without a price list or an image', () => {
    const fi = buildReportHtml({ project, layout, model: null, image: null, language: 'fi', date: '2026-11-15' });
    expect(fi).toContain('Venesataman alustava layout-tarkastelu');
    expect(fi).toContain(translate('fi', 'report.noPriceList'));
    expect(fi).not.toContain('<img');
    expect(fi).toContain('lang="fi"');
  });
});
