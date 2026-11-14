import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS } from '../../engine/demos';
import { loadProjectFromStorage, saveProjectToStorage, STORAGE_KEY, type StorageLike } from '../persistence';
import { APP_ID, DISCLAIMER, parseProject, serializeProject } from '../projectFile';
import { createAppStore } from '../store';

function generatedProject() {
  const store = createAppStore();
  store.getState().loadDemo('irregularBay');
  store.getState().generate();
  const layout = store.getState().project.layouts[0]!;
  store.getState().setBerthRemoved(layout.id, layout.berths[3]!.id, true);
  store.getState().setPreferredLayout(layout.id);
  return store.getState().project;
}

const fileWith = (patch: (project: Record<string, unknown>) => void): string => {
  const file = JSON.parse(serializeProject(DEMO_PROJECTS[0]!.create())) as { project: Record<string, unknown> };
  patch(file.project);
  return JSON.stringify(file);
};

describe('project file (SPEC §2: JSON export/import)', () => {
  it('carries the app id and the disclaimer', () => {
    const file = JSON.parse(serializeProject(DEMO_PROJECTS[0]!.create()));
    expect(file.app).toBe(APP_ID);
    expect(file.disclaimer).toBe(DISCLAIMER);
    expect(DISCLAIMER).toBe(
      'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.',
    );
  });

  it('save → open restores the project, including edited layouts', () => {
    const project = generatedProject();
    const store = createAppStore();
    expect(store.getState().openProjectFile(serializeProject(project))).toBe(true);
    const restored = store.getState().project;
    // Derived data (fairways, issues, statistics) is recomputed on load and must agree.
    expect(restored).toEqual(project);
    expect(restored.layouts[0]!.modified).toBe(true);
    expect(restored.layouts[0]!.berths[3]!.removed).toBe(true);
    expect(store.getState().selectedLayoutId).toBe(project.preferredLayoutId);
    expect(store.getState().past).toEqual([]);
  });

  it('rejects text that is not JSON', () => {
    expect(parseProject('not json')).toEqual({ ok: false, error: 'The file is not valid JSON.' });
  });

  it('rejects files of other applications and unknown versions', () => {
    expect(parseProject('{"hello": 1}')).toEqual({ ok: false, error: 'This is not a Marina Layout Planner project file.' });
    const future = parseProject(fileWith((p) => (p.schemaVersion = 99)));
    expect(future.ok).toBe(false);
    expect(!future.ok && future.error).toContain('Unsupported project version 99');
  });

  it('reports where the file is malformed', () => {
    const cases: [(p: Record<string, unknown>) => void, string][] = [
      [(p) => ((p.site as { water: unknown }).water = [{ x: 0, y: 0 }]), 'site.water must have at least 3 points.'],
      [(p) => ((p.site as { water: { x: unknown }[] }).water[1]!.x = 'a'), 'site.water[1].x must be a number.'],
      [(p) => ((p.params as { boatsPerBay: number }).boatsPerBay = 3), 'params.boatsPerBay must be 1 or 2.'],
      [(p) => ((p.boatClasses as { beam: number }[])[0]!.beam = 0), 'boatClasses[0]: length and beam must be positive.'],
      [(p) => ((p.site as { zones: unknown[] }).zones = [{ id: 'z', kind: 'nope', shape: [] }]), 'site.zones[0].kind must be one of: noStructures, noNavigation, protected.'],
      [(p) => delete p.name, 'name must be text.'],
      [(p) => ((p.boatClasses as { count: number }[])[0]!.count = 2.5), 'boatClasses[0].count must be a whole number, 0 or more.'],
      [(p) => ((p.params as { berthTarget: string }).berthTarget = 'both'), 'params.berthTarget must be one of: share, count.'],
    ];
    for (const [patch, message] of cases) {
      expect(parseProject(fileWith(patch))).toEqual({ ok: false, error: message });
    }
  });

  it('files from before target counts open with shares and zero counts (D20)', () => {
    const parsed = parseProject(
      fileWith((p) => {
        delete (p.params as Record<string, unknown>).berthTarget;
        for (const c of p.boatClasses as Record<string, unknown>[]) delete c.count;
      }),
    );
    expect(parsed.ok && parsed.project.params.berthTarget).toBe('share');
    expect(parsed.ok && parsed.project.boatClasses.map((c) => c.count)).toEqual([0, 0, 0, 0]);
  });

  it('missing parameters take their defaults', () => {
    const parsed = parseProject(fileWith((p) => delete (p.params as Record<string, unknown>).shoreOffset));
    expect(parsed.ok && parsed.project.params.shoreOffset).toBe(0);
  });

  it('files from before the largest anchor piece open with the default 3 000 kg; other anchoring values are kept (I57)', () => {
    const parsed = parseProject(
      fileWith((p) => {
        const a = p.anchoring as Record<string, unknown>;
        delete a.maxAnchorMass;
        a.profileHeightRatio = 0.25;
      }),
    );
    expect(parsed.ok && parsed.project.anchoring.maxAnchorMass).toBe(3000);
    expect(parsed.ok && parsed.project.anchoring.profileHeightRatio).toBe(0.25);
  });

  it('a failed open keeps the current project and leaves a notice', () => {
    const store = createAppStore();
    store.getState().loadDemo('rectBasin');
    const project = store.getState().project;
    expect(store.getState().openProjectFile('{}')).toBe(false);
    expect(store.getState().project).toBe(project);
    expect(store.getState().notice).toBe('This is not a Marina Layout Planner project file.');
  });
});

describe('localStorage autosave (SPEC §2)', () => {
  const memoryStorage = (quota = Infinity): StorageLike & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        if (value.length > quota) throw new DOMException('quota', 'QuotaExceededError');
        data.set(key, value);
      },
      removeItem: (key) => void data.delete(key),
    };
  };

  it('saves and loads the project', () => {
    const storage = memoryStorage();
    const project = DEMO_PROJECTS[1]!.create();
    expect(saveProjectToStorage(project, storage)).toBe('saved');
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(loadProjectFromStorage(storage)).toEqual(project);
  });

  it('returns null when nothing or something unreadable is stored', () => {
    const storage = memoryStorage();
    expect(loadProjectFromStorage(storage)).toBeNull();
    storage.setItem(STORAGE_KEY, '{"broken":');
    expect(loadProjectFromStorage(storage)).toBeNull();
  });

  it('when the quota is exceeded the project is saved without the background image', () => {
    const project = {
      ...DEMO_PROJECTS[0]!.create(),
      background: { dataUrl: `data:image/png;base64,${'A'.repeat(50_000)}`, origin: { x: 0, y: 0 }, metresPerPixel: 0.5, rotation: 0, opacity: 0.6 },
    };
    const storage = memoryStorage(20_000);
    expect(saveProjectToStorage(project, storage)).toBe('savedWithoutBackground');
    const loaded = loadProjectFromStorage(storage)!;
    expect(loaded.background).toBeNull();
    expect(loaded.site).toEqual(project.site);
    // Not even the bare project fits: nothing is saved.
    expect(saveProjectToStorage(project, memoryStorage(100))).toBe('failed');
  });
});
