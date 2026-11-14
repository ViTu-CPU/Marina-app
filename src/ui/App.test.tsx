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
    for (const name of ['New', 'Open', 'Save', 'Undo', 'Redo', 'Generate', 'Export PNG', 'Export CSV']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
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
    expect(alternatives[1]!.textContent).toContain('A – Piers perpendicular to shore');
    expect(alternatives[0]!.textContent).toContain('berths');
    // Berths behind the rock were left out, so the best alternative is not "Constraints met".
    expect(alternatives[0]!.textContent).toContain('Geometry OK');
    expect(alternatives.some((a) => a.textContent!.includes('Constraints met'))).toBe(true);
    expect(alternatives[0]!.getAttribute('aria-pressed')).toBe('true');

    // Best value per row is highlighted: the first alternative has the most berths.
    const table = screen.getByTestId('comparison');
    const totalRow = within(table).getByRole('row', { name: /Total berths/ });
    const cells = within(totalRow).getAllByRole('cell');
    expect(cells[0]!.getAttribute('data-best')).toBe('true');
    expect(cells[1]!.getAttribute('data-best')).toBeNull();
    // An alternative with nothing left out has no issues.
    const clean = appStore.getState().project.layouts.find((l) => l.unreachableRemoved === 0)!;
    act(() => appStore.getState().selectLayout(clean.id));
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
    expect(appStore.getState().project.params.mainPierWidth).toBe(3);
    fireEvent.change(field, { target: { value: '2,5' } }); // decimal comma is accepted
    expect(appStore.getState().project.params.mainPierWidth).toBe(2.5);
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
    const row = within(screen.getByTestId('comparison')).getByRole('row', { name: /Unreachable berths left out/ });
    expect(within(row).getAllByRole('cell')[0]!.textContent).toBe(String(layout.unreachableRemoved));
    // The status drops from "Constraints met" (green) to "Geometry OK" (amber).
    expect(layout.feasibility).toBe('geometricOK');
    expect(screen.getAllByTestId('alternative')[0]!.textContent).toContain('Geometry OK');
    expect(screen.getAllByTestId('alternative')[0]!.textContent).not.toContain('Constraints met');
    const warnings = within(screen.getByTestId('comparison')).getByRole('row', { name: /Warnings/ });
    expect(within(warnings).getAllByRole('cell')[0]!.textContent).toBe('1');
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
