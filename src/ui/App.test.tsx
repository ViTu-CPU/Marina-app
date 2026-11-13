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
    expect(alternatives[0]!.textContent).toContain('Constraints met');
    expect(alternatives[0]!.getAttribute('aria-pressed')).toBe('true');

    // Best value per row is highlighted: the first alternative has the most berths.
    const table = screen.getByTestId('comparison');
    const totalRow = within(table).getByRole('row', { name: /Total berths/ });
    const cells = within(totalRow).getAllByRole('cell');
    expect(cells[0]!.getAttribute('data-best')).toBe('true');
    expect(cells[1]!.getAttribute('data-best')).toBeNull();
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

  it('unreachable berths left out are shown on the card, as a warning note and in the table', () => {
    renderShell();
    act(() => {
      appStore.getState().loadDemo('rectBasin');
      appStore.getState().generate();
    });
    // In the example basin the rock blocks one fairway; the berths behind it are left out.
    const layout = appStore.getState().project.layouts[0]!;
    expect(layout.unreachableRemoved).toBeGreaterThan(0);
    expect(screen.getAllByTestId('left-out')[0]!.textContent).toBe(`${layout.unreachableRemoved} left out (unreachable)`);
    const note = screen.getByTestId('left-out-note').textContent!;
    expect(note).toContain(`${layout.unreachableRemoved} berths were left out of this layout`);
    expect(note).toContain('Warning');
    const row = within(screen.getByTestId('comparison')).getByRole('row', { name: /Unreachable berths left out/ });
    expect(within(row).getAllByRole('cell')[0]!.textContent).toBe(String(layout.unreachableRemoved));
    // The layout itself still meets the constraints.
    expect(screen.getAllByTestId('alternative')[0]!.textContent).toContain('Constraints met');
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
