import { describe, expect, it } from 'vitest';
import { IRREGULAR_BAY_SITE } from '../../engine/demos';
import { createAppStore, emptyProject, HISTORY_LIMIT, inputFingerprint, needsRegeneration } from '../store';

const demoStore = () => {
  const store = createAppStore();
  store.getState().loadDemo('rectBasin');
  return store;
};

describe('undo / redo (SPEC §2: immutable snapshots)', () => {
  it('undo restores the previous project and redo brings the change back', () => {
    const store = demoStore();
    const before = store.getState().project;
    store.getState().setParams({ fairwayMin: 10 });
    const after = store.getState().project;
    expect(after.params.fairwayMin).toBe(10);
    expect(before.params.fairwayMin).toBe(8); // the old snapshot is untouched

    store.getState().undo();
    expect(store.getState().project).toBe(before);
    store.getState().redo();
    expect(store.getState().project).toBe(after);
  });

  it('a new change clears the redo stack', () => {
    const store = demoStore();
    store.getState().setParams({ fairwayMin: 10 });
    store.getState().undo();
    store.getState().setParams({ fairwayMin: 12 });
    expect(store.getState().future).toEqual([]);
    store.getState().redo();
    expect(store.getState().project.params.fairwayMin).toBe(12);
  });

  it('undo and redo do nothing at the ends of the history', () => {
    const store = demoStore();
    const project = store.getState().project;
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().project).toBe(project);
  });

  it('commits with the same coalesce key form one undo step', () => {
    const store = demoStore();
    for (const name of ['M', 'Ma', 'Mar']) store.getState().setProjectName(name);
    expect(store.getState().past).toHaveLength(1);
    store.getState().undo();
    expect(store.getState().project.name).toBe('Rectangular basin');
    // After endCoalescing the same key starts a new step.
    store.getState().setProjectName('A');
    store.getState().endCoalescing();
    store.getState().setProjectName('AB');
    expect(store.getState().past).toHaveLength(2);
  });

  it('a commit that changes nothing adds no undo step', () => {
    const store = demoStore();
    store.getState().commit((p) => p);
    store.getState().updateSite((s) => s);
    expect(store.getState().past).toEqual([]);
  });

  it('the history is capped', () => {
    const store = demoStore();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.getState().setParams({ shoreOffset: i });
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
  });

  it('session state is not undoable', () => {
    const store = demoStore();
    store.getState().setTool('measure');
    store.getState().toggleLayer('boats');
    store.getState().setLanguage('fi');
    expect(store.getState().past).toEqual([]);
    expect(store.getState().layers.boats).toBe(false);
  });
});

describe('generation and the Regenerate hint (SPEC §8)', () => {
  it('generate fills the alternatives, selects the best and is one undo step', () => {
    const store = demoStore();
    store.getState().generate();
    const { project, selectedLayoutId, diagnostics } = store.getState();
    expect(project.layouts.length).toBeGreaterThanOrEqual(3);
    expect(selectedLayoutId).toBe(project.layouts[0]!.id);
    expect(diagnostics).toEqual([]);
    expect(needsRegeneration(project)).toBe(false);
    store.getState().undo();
    expect(store.getState().project.layouts).toEqual([]);
  });

  it('inputs of the generator raise the hint; undoing them clears it', () => {
    const store = demoStore();
    store.getState().generate();
    store.getState().setParams({ fairwayMin: 9 });
    expect(needsRegeneration(store.getState().project)).toBe(true);
    store.getState().undo();
    expect(needsRegeneration(store.getState().project)).toBe(false);

    store.getState().updateSite((s) => ({ ...s, obstacles: [] }));
    expect(needsRegeneration(store.getState().project)).toBe(true);
    store.getState().undo();

    const classes = store.getState().project.boatClasses;
    store.getState().setBoatClasses(classes.map((c) => (c.id === 'c5' ? { ...c, beam: 2.2 } : c)));
    expect(needsRegeneration(store.getState().project)).toBe(true);
  });

  it('names, colours and the objective do not require regeneration', () => {
    const store = demoStore();
    store.getState().generate();
    const classes = store.getState().project.boatClasses;
    store.getState().setBoatClasses(classes.map((c) => ({ ...c, name: `${c.name}!`, color: '#000000' })));
    store.getState().setProjectName('Renamed');
    store.getState().setObjective({ id: 'minInfrastructure', targetBerths: 100 });
    expect(needsRegeneration(store.getState().project)).toBe(false);
  });

  it('changing the objective re-ranks the existing alternatives at once', () => {
    const store = demoStore();
    store.getState().generate();
    const byCapacity = store.getState().project.layouts.map((l) => l.id);
    store.getState().setObjective({ id: 'minInfrastructure', targetBerths: 0 });
    const layouts = store.getState().project.layouts;
    expect(layouts.map((l) => l.id).sort()).toEqual([...byCapacity].sort());
    const perBerth = layouts.map((l) => l.stats.pontoonPerBerth);
    expect(perBerth).toEqual([...perBerth].sort((a, b) => a - b));
    expect(layouts[0]!.score).toBeCloseTo(-perBerth[0]!, 9);
  });

  it('an empty project gives a diagnostic instead of layouts', () => {
    const store = createAppStore();
    store.getState().generate();
    expect(store.getState().project.layouts).toEqual([]);
    expect(store.getState().diagnostics.map((d) => d.code)).toEqual(['NO_WATER_AREA']);
    expect(needsRegeneration(store.getState().project)).toBe(false);
  });

  it('the fingerprint depends on the site, class sizes and parameters only', () => {
    const a = emptyProject();
    expect(inputFingerprint(a)).toBe(inputFingerprint({ ...a, name: 'x' } as typeof a));
    expect(inputFingerprint(a)).not.toBe(inputFingerprint({ ...a, site: IRREGULAR_BAY_SITE }));
    expect(inputFingerprint(a)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('layout edits through the store (SPEC §8)', () => {
  const generated = () => {
    const store = demoStore();
    store.getState().generate();
    return store;
  };

  it('removing and restoring a berth updates the stats and marks the layout as edited', () => {
    const store = generated();
    const layout = store.getState().project.layouts[0]!;
    const berth = layout.berths[0]!;
    store.getState().setBerthRemoved(layout.id, berth.id, true);
    let edited = store.getState().project.layouts[0]!;
    expect(edited.stats.totalBerths).toBe(layout.stats.totalBerths - 1);
    expect(edited.modified).toBe(true);
    expect(edited.score).toBe(edited.stats.totalBerths); // max capacity objective
    expect(needsRegeneration(store.getState().project)).toBe(false);

    store.getState().setBerthRemoved(layout.id, berth.id, false);
    edited = store.getState().project.layouts[0]!;
    expect(edited.stats.totalBerths).toBe(layout.stats.totalBerths);
    expect(edited.modified).toBe(true);

    store.getState().undo();
    store.getState().undo();
    expect(store.getState().project.layouts[0]).toBe(layout);
  });

  it('a drag is one undo step when its moves share a coalesce key', () => {
    const store = generated();
    const layout = store.getState().project.layouts[0]!;
    const pier = layout.piers[1]!;
    const steps = store.getState().past.length;
    for (let i = 0; i < 5; i++) store.getState().movePier(layout.id, pier.id, { x: 1, y: 0 }, { coalesce: `drag:${pier.id}` });
    store.getState().endCoalescing();
    expect(store.getState().past).toHaveLength(steps + 1);
    const moved = store.getState().project.layouts[0]!.piers[1]!;
    expect(moved.start.x).toBeCloseTo(pier.start.x + 5, 6);
    // 5 m off the design pitch: the fairway on one side is now too narrow.
    expect(store.getState().project.layouts[0]!.stats.issueCounts.warning).toBeGreaterThan(0);
    store.getState().undo();
    expect(store.getState().project.layouts[0]).toBe(layout);
  });

  it('a locked pier does not move', () => {
    const store = generated();
    const layout = store.getState().project.layouts[0]!;
    const pier = layout.piers[0]!;
    store.getState().setPierLocked(layout.id, pier.id, true);
    const locked = store.getState().project.layouts[0]!;
    expect(locked.piers[0]!.locked).toBe(true);
    expect(locked.modified).toBe(false);
    store.getState().movePier(layout.id, pier.id, { x: 3, y: 0 });
    expect(store.getState().project.layouts[0]).toBe(locked);
  });

  it('preferred layout is part of the document', () => {
    const store = generated();
    const id = store.getState().project.layouts[1]!.id;
    store.getState().setPreferredLayout(id);
    expect(store.getState().project.preferredLayoutId).toBe(id);
    store.getState().undo();
    expect(store.getState().project.preferredLayoutId).toBeNull();
  });
});
