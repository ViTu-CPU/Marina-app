import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS } from '../../engine/demos';
import { DEFAULT_WAVES } from '../../engine/waves';
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

  it('files from before the largest anchor piece and anchor type open with their defaults; other anchoring values are kept (I57)', () => {
    const parsed = parseProject(
      fileWith((p) => {
        const a = p.anchoring as Record<string, unknown>;
        delete a.maxAnchorMass;
        delete a.anchorType;
        a.profileHeightRatio = 0.25;
      }),
    );
    expect(parsed.ok && parsed.project.anchoring.maxAnchorMass).toBe(3000);
    expect(parsed.ok && parsed.project.anchoring.anchorType).toBe('block');
    const bad = parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).anchorType = 'helix')));
    expect(bad.ok).toBe(false);
    expect(parsed.ok && parsed.project.anchoring.profileHeightRatio).toBe(0.25);
  });

  it('gangways of an access pontoon (D32): kept when given, missing = none, negative refused', () => {
    const withPontoon = (gangways: unknown) =>
      parseProject(
        fileWith((p) => {
          const site = p.site as Record<string, unknown>;
          site.accessPontoons = [{ id: 'access-1', start: { x: 0, y: 2 }, end: { x: 60, y: 2 }, width: 3, ...(gangways === undefined ? {} : { gangways }) }];
        }),
      );
    const none = withPontoon(undefined);
    expect(none.ok && none.project.site.accessPontoons![0]!.gangways).toBeUndefined();
    const two = withPontoon([10, 45.5]);
    expect(two.ok && two.project.site.accessPontoons![0]!.gangways).toEqual([10, 45.5]);
    expect(withPontoon([-1]).ok).toBe(false);
  });

  it('stern buoys (D36): boat weight, buoy factors and sinker method are kept; older files take the defaults', () => {
    const old = parseProject(
      fileWith((p) => {
        delete (p.params as Record<string, unknown>).buoyDepthFactor;
        const a = p.anchoring as Record<string, unknown>;
        delete a.buoySinkerMethod;
        delete a.buoySinkerFactor;
        delete a.buoyChainFactor;
        delete a.buoyTable;
        delete a.buoyExposed;
        delete a.buoyLift;
      }),
    );
    expect(
      old.ok && [
        old.project.params.buoyDepthFactor,
        old.project.anchoring.buoySinkerMethod,
        old.project.anchoring.buoySinkerFactor,
        old.project.anchoring.buoyChainFactor,
        old.project.anchoring.buoyTable,
        old.project.anchoring.buoyExposed,
        old.project.anchoring.buoyLift,
      ],
    ).toEqual([1, 'table', 3, 1.41, 'batunionen', false, 0.8]);
    expect(old.ok && old.project.boatClasses.every((c) => c.weight === undefined)).toBe(true);
    const set = parseProject(
      fileWith((p) => {
        (p.boatClasses as Record<string, unknown>[])[0]!.weight = 2.5;
        (p.params as Record<string, unknown>).buoyDepthFactor = 3;
        Object.assign(p.anchoring as Record<string, unknown>, { buoySinkerMethod: 'factor', buoySinkerFactor: 5, buoyChainFactor: 2, buoyTable: 'topMarine', buoyExposed: true, buoyLift: 1 });
      }),
    );
    expect(
      set.ok && [
        set.project.boatClasses[0]!.weight,
        set.project.params.buoyDepthFactor,
        set.project.anchoring.buoySinkerMethod,
        set.project.anchoring.buoySinkerFactor,
        set.project.anchoring.buoyChainFactor,
        set.project.anchoring.buoyTable,
        set.project.anchoring.buoyExposed,
        set.project.anchoring.buoyLift,
      ],
    ).toEqual([2.5, 3, 'factor', 5, 2, 'topMarine', true, 1]);
    expect(parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).buoyExposed = 'yes'))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p.boatClasses as Record<string, unknown>[])[0]!.weight = 0))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).buoySinkerMethod = 'guess'))).ok).toBe(false);
  });

  it('wave screening inputs (D40): kept, older files have none, invalid values refused', () => {
    const old = parseProject(fileWith((p) => delete (p as Record<string, unknown>).waves));
    expect(old.ok && old.project.waves).toEqual(DEFAULT_WAVES);
    const set = parseProject(
      fileWith((p) => {
        (p as Record<string, unknown>).waves = { fetch: 2500, fetchFrom: 450, fetchDepth: null, wind1: 15, wind50: 22, windAveragingS: 3600, quality: 'excellent' };
      }),
    );
    expect(set.ok && set.project.waves).toEqual({
      fetch: 2500,
      fetchFrom: 90,
      fetchDepth: null,
      wind1: 15,
      wind50: 22,
      windAveragingS: 3600,
      quality: 'excellent',
      location: null,
      climate: null,
    });
    // D41: position and fetched wind climate are kept.
    const sector = { rose: [0.01, 0.02, 0, 0, 0], annualMax: [12, 14], oneYear: 11.5, fiftyYear: null };
    const climate = {
      source: 'Open-Meteo',
      requested: { lat: 60.15, lon: 24.95 },
      cell: { lat: 60.25, lon: 25 },
      startYear: 2023,
      endYear: 2024,
      hours: 17544,
      fetchedOn: '2026-11-15',
      averagingS: 3600,
      sectors: Array.from({ length: 16 }, () => sector),
    };
    const withClimate = parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { location: { lat: 60.15, lon: 24.95 }, climate })));
    expect(withClimate.ok && withClimate.project.waves.location).toEqual({ lat: 60.15, lon: 24.95 });
    expect(withClimate.ok && withClimate.project.waves.climate).toEqual(climate);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { climate: { ...climate, sectors: [sector] } }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { fetch: -1 }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { quality: 'superb' }))).ok).toBe(false);
  });

  it('berth types (D34): params, berth types and boom fingers are kept; older files are finger piers', () => {
    const old = parseProject(
      fileWith((p) => {
        const params = p.params as Record<string, unknown>;
        delete params.berthType;
        delete params.boomLengths;
        delete params.boomWidth;
      }),
    );
    expect(old.ok && [old.project.params.berthType, old.project.params.boomLengths, old.project.params.boomWidth]).toEqual(['finger', [5, 6, 7], 0.4]);
    const y = parseProject(fileWith((p) => ((p.params as Record<string, unknown>).berthType = 'yBoom')));
    expect(y.ok && y.project.params.berthType).toBe('yBoom');
    expect(parseProject(fileWith((p) => ((p.params as Record<string, unknown>).berthType = 'raft'))).ok).toBe(false);
    const file = JSON.parse(serializeProject(generatedProject())) as { project: { layouts: { berths: Record<string, unknown>[]; fingers: Record<string, unknown>[] }[] } };
    file.project.layouts[0]!.berths[0]!.type = 'yBoom';
    file.project.layouts[0]!.fingers[0]!.kind = 'boom';
    const withTypes = parseProject(JSON.stringify(file));
    expect(withTypes.ok && withTypes.project.layouts[0]!.berths[0]!.type).toBe('yBoom');
    expect(withTypes.ok && withTypes.project.layouts[0]!.fingers[0]!.kind).toBe('boom');
  });

  it('standard finger lengths: missing in older files → the default; stored sorted and unique (D29)', () => {
    const old = parseProject(fileWith((p) => delete (p.params as Record<string, unknown>).fingerLengths));
    expect(old.ok && old.project.params.fingerLengths).toEqual([5, 6, 7, 8, 10, 12]);
    const mine = parseProject(fileWith((p) => ((p.params as Record<string, unknown>).fingerLengths = [12, 6, 6, 8])));
    expect(mine.ok && mine.project.params.fingerLengths).toEqual([6, 8, 12]);
    const none = parseProject(fileWith((p) => ((p.params as Record<string, unknown>).fingerLengths = [])));
    expect(none.ok && none.project.params.fingerLengths).toEqual([]);
    expect(parseProject(fileWith((p) => ((p.params as Record<string, unknown>).fingerLengths = [6, -1]))).ok).toBe(false);
  });

  it('files from before tip chains open with the default limit 10 m; it must not be negative (D30)', () => {
    const old = parseProject(fileWith((p) => delete (p.anchoring as Record<string, unknown>).tipAnchorMinLength));
    expect(old.ok && old.project.anchoring.tipAnchorMinLength).toBe(10);
    const noPile = parseProject(fileWith((p) => delete (p.anchoring as Record<string, unknown>).fingerPileMinLength));
    expect(noPile.ok && noPile.project.anchoring.fingerPileMinLength).toBe(12);
    expect(parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).fingerPileMinLength = -1))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).tipAnchorMinLength = -1))).ok).toBe(false);
  });

  it('files from before splayed chains open with the default splay angle; it must lie in 0–80° (D25, I61)', () => {
    const parsed = parseProject(fileWith((p) => delete (p.anchoring as Record<string, unknown>).splayAngle));
    expect(parsed.ok && parsed.project.anchoring.splayAngle).toBe(45);
    const kept = parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).splayAngle = 0)));
    expect(kept.ok && kept.project.anchoring.splayAngle).toBe(0);
    for (const v of [-5, 85]) {
      const bad = parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).splayAngle = v)));
      expect(bad.ok).toBe(false);
    }
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
