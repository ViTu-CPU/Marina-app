import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS } from '../../engine/demos';
import { generateLayouts } from '../../engine/generate';
import type { Project } from '../../engine/model';
import { waveAssessment } from '../../engine/waves';
import type { WindClimate } from '../../engine/wind';
import { translate } from '../../i18n';
import { buildWaveReportHtml, fetchFigureSvg } from './waveReport';

const DISCLAIMER = translate('en', 'app.disclaimer');
const FETCHES = [1200, 3000, 800, 0, 0, 0, 400, 2500];

/** A project with nothing but wave inputs: no water area, no layout (a wave-only study). */
function waveOnly(): Project {
  const p = DEMO_PROJECTS[0]!.create();
  p.name = 'Bay <b>1</b>';
  p.site = { ...p.site, water: [] };
  p.layouts = [];
  p.waves = { ...p.waves, wind1: 14, wind50: 20, sectors: p.waves.sectors.map((s, k) => ({ ...s, fetch: FETCHES[k]! })) };
  return p;
}

const base = { piers: [], layoutName: null, position: { lat: 63.5612, lon: 27.1903 }, positionEntered: true, windRoseSvg: null, language: 'en' as const, date: '2026-11-23' };

describe('wave screening report (U29)', () => {
  it('prints without a layout: disclaimer on the page and as the footer, title, position, all headings', () => {
    const html = buildWaveReportHtml({ project: waveOnly(), ...base });
    expect(html.split(DISCLAIMER).length - 1).toBe(2);
    expect(html).toContain('<div class="foot">');
    expect(html).toContain(translate('en', 'waveReport.title'));
    expect(html).toContain('63.5612, 27.1903 (entered)');
    expect(html).toContain(translate('en', 'waveReport.noLayout'));
    expect(html).toContain('2026-11-23');
  });

  it('escapes text from the project', () => {
    const html = buildWaveReportHtml({ project: waveOnly(), ...base });
    expect(html).not.toContain('<b>1</b>');
    expect(html).toContain('Bay &lt;b&gt;1&lt;/b&gt;');
  });

  it('summarises the directions that exceed the criteria and has the sector table, criteria and breakwater', () => {
    const project = waveOnly();
    const result = waveAssessment(project.waves, project.anchoring.depth, [])!;
    const html = buildWaveReportHtml({ project, ...base });
    expect(result.bad.length).toBeGreaterThan(0);
    const bad = result.bad.map((k) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][k]).join(', ');
    expect(html).toContain(`<div class="summary bad"><strong>Directions exceeding the criteria: ${bad}</strong>`);
    for (const key of ['waves.sector', 'waves.criteria', 'breakwater.title', 'waveReport.fetches', 'waveReport.windClimate'] as const) {
      expect(html).toContain(translate('en', key));
    }
    // Wave heights with two decimals (U25), fetches with one.
    expect(html).toMatch(/<td class="n">0\.\d\d<\/td>/);
    expect(html).toContain('<td class="n">3,000.0</td>');
    expect(html).toContain(translate('en', 'waveReport.fetchManual'));
    expect(html).toContain(translate('en', 'waveReport.noClimate'));
  });

  it('nothing entered: says what to enter and draws no fetch figure', () => {
    const project = DEMO_PROJECTS[0]!.create();
    const html = buildWaveReportHtml({ project, ...base, position: null });
    expect(html).toContain(`<div class="summary">${translate('en', 'waves.enter')}</div>`);
    expect(html).toContain(translate('en', 'waveReport.positionNone'));
    expect(html).not.toContain('<svg');
  });

  it('with a layout: names the alternative and checks the headings of its piers', () => {
    const project = waveOnly();
    const demo = DEMO_PROJECTS[0]!.create();
    const layout = generateLayouts({ site: demo.site, boatClasses: demo.boatClasses, params: demo.params, objective: demo.objective }).layouts[0]!;
    const html = buildWaveReportHtml({ project, ...base, piers: layout.piers, layoutName: layout.name });
    expect(html).toContain(`Alternative: ${layout.name}`);
    expect(html).toContain(translate('en', 'waves.piers'));
  });

  it('wind climate: the rose from the window, the sector table with the exceeding directions marked', () => {
    const project = waveOnly();
    const climate: WindClimate = {
      source: 'test',
      requested: { lat: 63.56, lon: 27.19 },
      cell: { lat: 63.5, lon: 27.25 },
      startYear: 1996,
      endYear: 2025,
      hours: 262992,
      fetchedOn: '2026-11-20',
      averagingS: 3600,
      sectors: Array.from({ length: 16 }, () => ({ rose: [0.02, 0.02, 0.01, 0, 0], oneYear: 13, fiftyYear: 18 })) as WindClimate['sectors'],
    };
    project.waves = { ...project.waves, climate };
    const html = buildWaveReportHtml({ project, ...base, windRoseSvg: '<svg data-testid="wind-rose"></svg>' });
    expect(html).toContain('<svg data-testid="wind-rose"></svg>');
    expect(html).toContain('262,992 h');
    expect(html).toContain('<tr class="bad">');
    // Only SVG markup is taken as the rose.
    expect(buildWaveReportHtml({ project, ...base, windRoseSvg: '<script>x</script>' })).not.toContain('<script>x</script>');
  });

  it('Finnish: title, decimal commas', () => {
    const html = buildWaveReportHtml({ project: waveOnly(), ...base, language: 'fi' });
    expect(html).toContain(translate('fi', 'waveReport.title'));
    expect(html).toContain('<html lang="fi">');
    expect(html).toMatch(/<td class="n">0,\d\d<\/td>/);
  });
});

describe('fetch figure (U29)', () => {
  it('a wedge per sector with a fetch, coloured by its result, and the map rays as a dashed line', () => {
    const project = waveOnly();
    const result = waveAssessment(project.waves, project.anchoring.depth, [])!;
    const svg = fetchFigureSvg(project.waves, result, 'en')!;
    expect((svg.match(/<path /g) ?? []).length).toBe(FETCHES.filter((f) => f > 0).length);
    expect((svg.match(/fill="#dc2626"/g) ?? []).length).toBe(result.bad.length);
    expect(svg).not.toContain('<polygon');
    const rays = Array.from({ length: 72 }, (_, i) => 500 + i * 10);
    const withRays = fetchFigureSvg({ ...project.waves, autoFetch: { source: 's', position: { lat: 0, lon: 0 }, radius: 20000, stepDeg: 5, distances: rays, fetchedOn: '2026-11-23' } }, result, 'en')!;
    expect(withRays).toContain('<polygon');
    // Rings at round distances: the longest fetch is 3 km → rings at 1, 2 and 3 km.
    expect(svg).toContain('>1.0 km<');
    expect(svg).toContain('>3.0 km<');
  });

  it('no fetch: no figure', () => {
    expect(fetchFigureSvg(DEMO_PROJECTS[0]!.create().waves, null, 'en')).toBeNull();
  });
});
