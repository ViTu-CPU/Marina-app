// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appStore, emptyProject } from '../state/store';
import { AppShell } from './App';

const DISCLAIMER = 'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.';

// The canvas needs a real browser; it is covered by the end-to-end test.
const renderShell = () => render(<AppShell canvas={<div data-testid="canvas-stub" />} />);

beforeEach(() => {
  act(() => {
    appStore.getState().replaceProject(emptyProject());
    appStore.getState().setLanguage('en');
    appStore.getState().setWaveToolOpen(false);
    appStore.getState().setResultsTab('alternatives');
  });
});
afterEach(cleanup);

describe('app shell (SPEC §8)', () => {
  it('shows the mandatory disclaimer (SPEC §1)', () => {
    renderShell();
    expect(screen.getByRole('note').textContent).toBe(DISCLAIMER);
  });

  it('has the toolbar actions', () => {
    renderShell();
    for (const name of ['New', 'Open', 'Save', 'Undo', 'Redo', 'Generate', 'Waves']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    // UI_REVIEW 6: the exports are in one menu; those needing a layout are disabled without one.
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Export ▾' }));
    const menu = screen.getByRole('menu', { name: 'Export' });
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Export PNG', 'Export CSV', 'Export DXF', 'Report (PDF)']);
    expect(items.map((i) => (i as HTMLButtonElement).disabled)).toEqual([false, true, true, true]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Load example' })).toBeTruthy();
  });

  it('the language toggle switches the UI to Finnish and back', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'FI' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Venesataman asettelusuunnittelu');
    expect(screen.getByRole('button', { name: 'Generoi' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('Alustava geometrinen tarkastelu');
    fireEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'Generate' })).toBeTruthy();
  });

  it('loading an example and generating lists alternatives with a comparison table', () => {
    renderShell();
    fireEvent.change(screen.getByRole('combobox', { name: 'Load example' }), { target: { value: 'rectBasin' } });
    expect(appStore.getState().project.name).toBe('Rectangular basin');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    const alternatives = screen.getAllByTestId('alternative');
    expect(alternatives.length).toBeGreaterThanOrEqual(3);
    expect(alternatives[0]!.textContent).toContain('E – Piers sized by boat class');
    expect(alternatives.some((a) => a.textContent!.includes('A – Piers perpendicular to shore'))).toBe(true);
    expect(alternatives[0]!.textContent).toContain('berths');
    // Berths behind the rock were left out, so the best alternative is not "Constraints met".
    expect(alternatives[0]!.textContent).toContain('Geometry OK');
    expect(alternatives.some((a) => a.textContent!.includes('Constraints met'))).toBe(true);
    expect(alternatives[0]!.getAttribute('aria-pressed')).toBe('true');

    // Best value per row is highlighted: the first alternative has the most berths.
    // UI_REVIEW 8: the comparison has a tab of its own.
    fireEvent.click(screen.getByRole('tab', { name: 'Compare' }));
    const table = screen.getByTestId('comparison');
    const totalRow = within(table).getByRole('row', { name: /Total berths/ });
    const cells = within(totalRow).getAllByRole('cell');
    expect(cells[0]!.getAttribute('data-best')).toBe('true');
    expect(cells[1]!.getAttribute('data-best')).toBeNull();
    // An alternative with nothing left out has no issues.
    const clean = appStore.getState().project.layouts.find((l) => l.unreachableRemoved === 0)!;
    act(() => appStore.getState().selectLayout(clean.id));
    fireEvent.click(screen.getByRole('tab', { name: 'Alternatives' }));
    expect(screen.getByText('No issues found against the configured constraints.')).toBeTruthy();
  });

  it('a parameter change shows the Regenerate hint; undo clears it', () => {
    renderShell();
    act(() => {
      appStore.getState().loadDemo('rectBasin');
      appStore.getState().generate();
    });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.change(screen.getByLabelText('Min fairway width (m)'), { target: { value: '10' } });
    expect(appStore.getState().project.params.fairwayMin).toBe(10);
    expect(screen.getByRole('status').textContent).toBe('Inputs have changed since the layouts were generated.');
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('invalid numbers are not passed on and are marked', () => {
    renderShell();
    const field = screen.getByLabelText('Main pier width (m)') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'abc' } });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(appStore.getState().project.params.mainPierWidth).toBe(2.7);
    fireEvent.change(field, { target: { value: '2,5' } }); // decimal comma is accepted
    expect(appStore.getState().project.params.mainPierWidth).toBe(2.5);
    // D44: a width of its own makes the pier series custom.
    expect(appStore.getState().project.params.pierSeries).toBe('custom');
  });

  it('boat classes can be edited, added and deleted', () => {
    renderShell();
    fireEvent.change(screen.getByLabelText('Share (%): 5 m'), { target: { value: '40' } });
    expect(appStore.getState().project.boatClasses[0]!.share).toBeCloseTo(0.4, 9);
    expect(screen.getByText(/Shares add up to/).textContent).toContain('110 %');
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }));
    expect(appStore.getState().project.boatClasses).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Delete class: 12 m' }));
    expect(appStore.getState().project.boatClasses.map((c) => c.id)).not.toContain('c12');
  });

  it('the boat mix can be given as target counts (D20) and switched back in one undo step each', () => {
    renderShell();
    act(() => appStore.getState().setBoatClasses(appStore.getState().project.boatClasses.map((c) => ({ ...c, count: 0 }))));
    fireEvent.click(screen.getByRole('button', { name: 'Count' }));
    const { project } = appStore.getState();
    expect(project.params.berthTarget).toBe('count');
    // Without layouts the counts start from the shares of 100 berths.
    expect(project.boatClasses.map((c) => c.count)).toEqual([30, 35, 25, 10]);
    expect(screen.getByText(/Target berths/).textContent).toContain('100');
    fireEvent.change(screen.getByLabelText('Count: 5 m'), { target: { value: '12' } });
    expect(appStore.getState().project.boatClasses[0]!.count).toBe(12);
    fireEvent.click(screen.getByRole('button', { name: 'Share %' }));
    expect(appStore.getState().project.params.berthTarget).toBe('share');
    expect(screen.getByLabelText('Share (%): 5 m')).toBeTruthy();
    act(() => appStore.getState().undo());
    expect(appStore.getState().project.params.berthTarget).toBe('count');
  });

  it('a pier side can be filled with one class, a berth can change class, a pier can be deleted (D22)', () => {
    renderShell();
    act(() => {
      appStore.getState().loadDemo('rectBasin');
      appStore.getState().generate();
    });
    const layout = () => appStore.getState().project.layouts.find((l) => l.id === appStore.getState().selectedLayoutId)!;
    const pier = layout().piers[0]!;
    act(() => appStore.getState().select({ kind: 'pier', id: pier.id }));
    fireEvent.change(screen.getByLabelText('Boat class to fill with'), { target: { value: 'c5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fill left side' }));
    const left = layout().berths.filter((b) => b.pierId === pier.id && b.side === 'left');
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((b) => b.boatClassId === 'c5')).toBe(true);
    expect(layout().modified).toBe(true);

    act(() => appStore.getState().select({ kind: 'berth', id: left[0]!.id }));
    fireEvent.change(screen.getByLabelText('Boat class'), { target: { value: 'c7' } });
    expect(layout().berths.find((b) => b.id === left[0]!.id)!.boatClassId).toBe('c7');

    act(() => appStore.getState().select({ kind: 'pier', id: pier.id }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete pier' }));
    expect(layout().piers.some((p) => p.id === pier.id)).toBe(false);
    expect(appStore.getState().selection).toBeNull();
  });

  it('shows the anchoring plan and the cost estimate once the price list is loaded (D23, D24)', async () => {
    const { readFileSync } = await import('node:fs');
    const { parsePriceListFile } = await import('../catalog/priceList');
    const parsed = parsePriceListFile(readFileSync('data/hinnasto.xlsx'), 'hinnasto.xlsx');
    renderShell();
    act(() => {
      appStore.getState().loadDemo('rectBasin');
      appStore.getState().generate();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Anchoring & cost' }));
    // UI_REVIEW 10: the tab shows the anchoring layers.
    expect(appStore.getState().layers.anchoring).toBe(true);
    expect(appStore.getState().layers.boats).toBe(false);
    expect(screen.getAllByText('Loading the price list …').length).toBeGreaterThan(0);
    act(() => appStore.getState().setBuiltInPriceList(parsed.ok ? parsed.priceList : null));
    // D62: the demo's lines on clay need more than the heaviest block: the totals say what they leave out.
    expect(screen.getByText(/^Total VAT 0 % \(excludes \d+ unpriced items?, see list\)$/)).toBeTruthy();
    expect(screen.getByText('Anchor lines')).toBeTruthy();
    expect(screen.getByTestId('anchoring-status').textContent).toMatch(/^Anchoring status\d+ lines with concrete anchors, \d+ with pile anchors$/);
    expect(screen.getByTestId('unpriced-items').textContent).toContain('Pile anchor – length and section by geotechnical design');
    // D64: the spec's required text in the result view.
    expect(screen.getByTestId('mooring-disclaimer').textContent).toBe("Preliminary sizing. Does not replace the designer's calculation, a geotechnical survey or the manufacturer's (e.g. Seaflex/JFlex) design. Ice loads are not designed.");
    // Choosing another pontoon series changes the project's choice (one undo step).
    fireEvent.change(screen.getByLabelText('Pontoons'), { target: { value: 'A-Laiturit MX 3 m' } });
    expect(appStore.getState().project.cost.pontoonSeries).toBe('A-Laiturit MX 3 m');
    act(() => appStore.getState().undo());
    expect(appStore.getState().project.cost.pontoonSeries).toBe('');
    // Anchoring parameters are part of the project (the section is collapsed but in the DOM).
    fireEvent.change(screen.getByLabelText('Design water depth (m)'), { target: { value: '6' } });
    expect(appStore.getState().project.anchoring.depth).toBe(6);
    act(() => appStore.getState().setBuiltInPriceList(null));
  });

  it('removing a berth from the selection panel marks the layout as manually edited', () => {
    renderShell();
    act(() => {
      appStore.getState().loadDemo('rectBasin');
      appStore.getState().generate();
      const layout = appStore.getState().project.layouts[0]!;
      appStore.getState().select({ kind: 'berth', id: layout.berths[0]!.id });
    });
    const before = appStore.getState().project.layouts[0]!.stats.totalBerths;
    fireEvent.click(screen.getByRole('button', { name: 'Remove berth' }));
    expect(appStore.getState().project.layouts[0]!.stats.totalBerths).toBe(before - 1);
    expect(screen.getAllByTestId('alternative')[0]!.textContent).toContain('Manually edited');
    fireEvent.click(screen.getByRole('button', { name: 'Restore berth' }));
    expect(appStore.getState().project.layouts[0]!.stats.totalBerths).toBe(before);
  });

  it('unreachable berths left out are shown on the card, as a warning and in the table', () => {
    renderShell();
    act(() => {
      appStore.getState().loadDemo('rectBasin');
      appStore.getState().generate();
    });
    // In the example basin the rock blocks one fairway; the berths behind it are left out.
    const layout = appStore.getState().project.layouts[0]!;
    expect(layout.unreachableRemoved).toBeGreaterThan(0);
    expect(screen.getAllByTestId('left-out')[0]!.textContent).toBe(`${layout.unreachableRemoved} left out (unreachable)`);
    const issues = screen.getByTestId('issues').textContent!;
    expect(issues).toContain(`${layout.unreachableRemoved} berths were left out of this layout`);
    expect(issues).toContain('Warning');
    expect(screen.getByText('Issues (1)')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Compare' }));
    const row = within(screen.getByTestId('comparison')).getByRole('row', { name: /Unreachable berths left out/ });
    expect(within(row).getAllByRole('cell')[0]!.textContent).toBe(String(layout.unreachableRemoved));
    // The status drops from "Constraints met" (green) to "Geometry OK" (amber).
    expect(layout.feasibility).toBe('geometricOK');
    const warnings = within(screen.getByTestId('comparison')).getByRole('row', { name: /Warnings/ });
    expect(within(warnings).getAllByRole('cell')[0]!.textContent).toBe('1');
    fireEvent.click(screen.getByRole('tab', { name: 'Alternatives' }));
    expect(screen.getAllByTestId('alternative')[0]!.textContent).toContain('Geometry OK');
    expect(screen.getAllByTestId('alternative')[0]!.textContent).not.toContain('Constraints met');
  });

  it('an empty project explains why nothing was generated', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(screen.getByRole('alert').textContent).toBe('Draw the water area first.');
  });

  it('objective choice re-ranks without a Regenerate hint', () => {
    renderShell();
    act(() => {
      appStore.getState().loadDemo('rectBasin');
      appStore.getState().generate();
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Min infrastructure' }));
    expect(appStore.getState().project.objective.id).toBe('minInfrastructure');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByLabelText('Berth target')).toBeTruthy();
  });
});

describe('wave window print (U29)', () => {
  it('prints the wave screening report from the wave window, without a layout', () => {
    renderShell();
    act(() => {
      const s = appStore.getState();
      s.setWaves({ wind1: 14, wind50: 20, sectors: s.project.waves.sectors.map((x, k) => ({ ...x, fetch: k === 1 ? 3000 : 0 })) });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Waves' }));
    const dialog = screen.getByRole('complementary', { name: 'Wave screening (preliminary)' });
    const printed: string[] = [];
    const original = HTMLIFrameElement.prototype;
    const spy = Object.getOwnPropertyDescriptor(original, 'contentWindow');
    // jsdom has no print(); record that it was asked for.
    Object.defineProperty(original, 'contentWindow', { configurable: true, get: () => ({ print: () => printed.push('print') }) });
    try {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Print' }));
      const frame = document.querySelector('iframe[data-testid="report-frame"]') as HTMLIFrameElement;
      const html = frame.contentDocument!.documentElement.outerHTML;
      expect(html).toContain('Wave screening report (preliminary)');
      expect(html).toContain(DISCLAIMER);
      expect(html).toContain('none (head, oblique and beam seas all checked)');
    } finally {
      if (spy) Object.defineProperty(original, 'contentWindow', spy);
      document.querySelector('iframe[data-testid="report-frame"]')?.remove();
    }
  });
});

describe('site checklist (UI_REVIEW 7)', () => {
  it('ticks the required steps as they are done and marks the next one', () => {
    renderShell();
    const list = screen.getByTestId('site-checklist');
    const step = (id: string) => list.querySelector(`[data-step="${id}"]`) as HTMLButtonElement;
    expect(step('water').getAttribute('aria-current')).toBe('step');
    expect(step('water').dataset.done).toBeUndefined();
    fireEvent.click(step('water'));
    expect(appStore.getState().tool).toBe('water');
    act(() => {
      appStore.getState().loadDemo('rectBasin');
    });
    for (const id of ['water', 'shoreline', 'entrance']) expect(step(id).dataset.done).toBe('true');
    expect(step('generate').getAttribute('aria-current')).toBe('step');
    fireEvent.click(step('generate'));
    expect(appStore.getState().project.layouts.length).toBeGreaterThan(0);
    expect(step('generate').dataset.done).toBe('true');
    expect(list.textContent).toContain('All required steps done');
  });
});

describe('wave panel and start choice (UI_REVIEW 4, 5)', () => {
  it('an empty project offers a layout study or a wave study; the wave panel replaces the layout panels', () => {
    renderShell();
    const start = screen.getByTestId('start-choice');
    expect(within(start).getByRole('heading').textContent).toBe('What do you want to study?');
    fireEvent.click(within(start).getByRole('button', { name: /Wave conditions only/ }));
    expect(screen.queryByTestId('start-choice')).toBeNull();
    const panel = screen.getByRole('complementary', { name: 'Wave screening (preliminary)' });
    expect(panel).toBeTruthy();
    // Beside the map: the canvas stays, the layout panels make room.
    expect(screen.getByTestId('canvas-stub')).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Results' })).toBeNull();
    // UI_REVIEW 10: the panel switches the map to the wave layers (fetch rays on, boats off).
    expect(appStore.getState().layers.fetch).toBe(true);
    expect(appStore.getState().layers.boats).toBe(false);
    expect(screen.getByRole('button', { name: 'Waves' }).getAttribute('aria-pressed')).toBe('true');
    // A wave study alone: the typed position can put the map under the drawing for the fetch rays.
    fireEvent.change(within(panel).getByLabelText('Position'), { target: { value: '60.15, 24.95' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Show on the map' }));
    const map = appStore.getState().project.map!;
    expect([map.provider, map.lat.toFixed(4), map.lon.toFixed(4)]).toEqual(['osm', '60.1500', '24.9500']);
    expect(within(panel).queryByRole('button', { name: 'Show on the map' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('wave-tool')).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Results' })).toBeTruthy();
    expect(appStore.getState().layers.boats).toBe(true);
    expect(appStore.getState().layers.fetch).toBe(false);
  });

  it('choosing a layout study starts the water area tool', () => {
    renderShell();
    fireEvent.click(within(screen.getByTestId('start-choice')).getByRole('button', { name: /Marina layout/ }));
    expect(appStore.getState().tool).toBe('water');
    expect(screen.queryByTestId('start-choice')).toBeNull();
  });
});

describe('wave point on the map (U35)', () => {
  it('"Pick on the map" needs a map; a picked point shows in the position field', () => {
    renderShell();
    // U36: a new project opens on the start map, on which a point can be picked too; remove it first.
    act(() => appStore.getState().setMap(null));
    act(() => appStore.getState().setWaveToolOpen(true));
    const panel = screen.getByTestId('wave-tool');
    const pick = within(panel).getByRole('button', { name: 'Pick on the map' }) as HTMLButtonElement;
    expect(pick.disabled).toBe(true);
    act(() => appStore.getState().setMap({ provider: 'osm', lat: 60.15, lon: 24.95, opacity: 0.8 }));
    expect(pick.disabled).toBe(false);
    fireEvent.click(pick);
    expect(appStore.getState().tool).toBe('wavePoint');
    expect(within(panel).getByRole('status').textContent).toContain('Click the map at the point to study');
    act(() => appStore.getState().setWaves({ location: { lat: 60.15123, lon: 24.95456 } }));
    expect((within(panel).getByLabelText('Position') as HTMLInputElement).value).toBe('60.15123, 24.95456');
  });
});
