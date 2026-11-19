import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS } from '../../engine/demos';
import { DEFAULT_WAVES, emptySectors } from '../../engine/waves';
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

  it('files from before D64 open with the new defaults; their seabed is mapped; other stored values are kept (I57)', () => {
    const parsed = parseProject(
      fileWith((p) => {
        const a = p.anchoring as Record<string, unknown>;
        delete a.maxAnchorMass;
        delete a.waveMin;
        a.seabed = 'clay';
        a.anchorType = 'wedge';
        a.profileHeightRatio = 0.25;
        a.lineSpacing = 9;
      }),
    );
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project.anchoring).toMatchObject({ maxAnchorMass: 5000, waveMin: 2, seabed: 'mediumClay', lineSpacing: 9 });
    // Fields of the old model are dropped.
    expect('anchorType' in parsed.project.anchoring).toBe(false);
    expect('profileHeightRatio' in parsed.project.anchoring).toBe(false);
    const sand = parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).seabed = 'sand')));
    expect(sand.ok && sand.project.anchoring.seabed).toBe('fineMediumSand');
    expect(parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).seabed = 'mud'))).ok).toBe(false);
    // The cohesive model and the capacity factor's basis survive saving.
    const cohesive = { Su_z: 20, Su_a: 10, A: 3, B: 1.5, z: 0.5, gammaB: 6, massDryKg: 3000 };
    const withCohesive = parseProject(
      fileWith((p) => {
        const a = p.anchoring as Record<string, unknown>;
        a.cohesive = cohesive;
        a.capacityFactor = 1.5;
        a.capacityFactorSource = 'pull test';
      }),
    );
    expect(withCohesive.ok && withCohesive.project.anchoring).toMatchObject({ cohesive, capacityFactor: 1.5, capacityFactorSource: 'pull test' });
    expect(parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).maxAnchorsPerLine = 3))).ok).toBe(false);
  });

  it('boat classes keep their vessel type (D64); missing reads as motor', () => {
    const parsed = parseProject(fileWith((p) => ((p.boatClasses as Record<string, unknown>[])[0]!.vesselType = 'yacht')));
    expect(parsed.ok && parsed.project.boatClasses[0]!.vesselType).toBe('yacht');
    expect(parseProject(fileWith((p) => ((p.boatClasses as Record<string, unknown>[])[0]!.vesselType = 'ship'))).ok).toBe(false);
  });

  it('an imported price list keeps the anchor columns (D62); older files without them read as blocks', () => {
    const product = {
      id: 'pile-1', category: 'anchor', supplier: 'x', series: '', name: 'Pile', code: '', unit: 'pcs', price: 100, priceIncludesVat: false, marginPct: 0,
      lengthM: null, widthM: null, weightKg: null, capacityKg: null, freeboardM: null, chainDiameterMm: null, chainGrade: '', breakingLoadKn: null, massKgPerM: null,
      anchorMassKg: null, anchorKind: 'pile', capacityHorizontalKn: 50, capacityUpliftKn: null, capacityBasis: 'published', seabeds: ['mediumClay'], installedPrice: 900,
      shackleMm: null, sourceUrl: 'https://example.com', sourceDate: '2026-11-18', note: '',
    };
    const withList = (p: Record<string, unknown>) => parseProject(fileWith((f) => ((f.cost as Record<string, unknown>).priceList = { title: 't', products: [p], parameters: [] })));
    const parsed = withList(product);
    expect(parsed.ok && parsed.project.cost.priceList!.products[0]).toEqual(product);
    const old: Record<string, unknown> = { ...product };
    for (const k of ['anchorKind', 'capacityHorizontalKn', 'capacityUpliftKn', 'capacityBasis', 'seabeds', 'installedPrice']) delete old[k];
    const older = withList(old);
    expect(older.ok && older.project.cost.priceList!.products[0]).toMatchObject({ anchorKind: null, capacityHorizontalKn: null, capacityUpliftKn: null, capacityBasis: null, seabeds: [], installedPrice: null });
    expect(withList({ ...product, anchorKind: 'helix' }).ok).toBe(false);
    expect(withList({ ...product, seabeds: ['mud'] }).ok).toBe(false);
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

  it('breakwaters (D58): kept when given, missing = none, an unknown type refused', () => {
    const withBreakwater = (product: unknown) =>
      parseProject(
        fileWith((p) => {
          (p.site as Record<string, unknown>).breakwaters = [{ id: 'breakwater-1', start: { x: 0, y: 130 }, end: { x: 100, y: 130 }, product }];
        }),
      );
    const ok = withBreakwater('3800BR');
    expect(ok.ok && ok.project.site.breakwaters).toEqual([{ id: 'breakwater-1', start: { x: 0, y: 130 }, end: { x: 100, y: 130 }, product: '3800BR' }]);
    expect(withBreakwater('9000X').ok).toBe(false);
    const none = parseProject(fileWith(() => {}));
    expect(none.ok && none.project.site.breakwaters).toBeUndefined();
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

  it('depth lookup around the site (I121): kept; older files follow it only with the default depth; invalid refused', () => {
    const result = { depth: 3.64, min: 1.2, max: 6.8, source: 'emodnet', coverage: 0.8, position: { lat: 60.15, lon: 24.95 }, radius: 200, fetchedOn: '2026-11-18' };
    const kept = parseProject(fileWith((p) => (p.siteDepth = { auto: false, radius: 300, result })));
    expect(kept.ok && kept.project.siteDepth).toEqual({ auto: false, radius: 300, result });
    const old = (depth: number) =>
      parseProject(
        fileWith((p) => {
          delete p.siteDepth;
          (p.anchoring as Record<string, unknown>).depth = depth;
        }),
      );
    const fresh = old(4);
    expect(fresh.ok && fresh.project.siteDepth).toEqual({ auto: true, radius: 200, result: null });
    const entered = old(6.5);
    expect(entered.ok && entered.project.siteDepth.auto).toBe(false);
    expect(entered.ok && entered.project.anchoring.depth).toBe(6.5);
    expect(parseProject(fileWith((p) => (p.siteDepth = { auto: true, radius: 0, result: null }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => (p.siteDepth = { auto: true, radius: 200, result: { ...result, source: 'guess' } }))).ok).toBe(false);
  });

  it('wave screening inputs (D40): kept, older files have none, invalid values refused', () => {
    const old = parseProject(fileWith((p) => delete (p as Record<string, unknown>).waves));
    expect(old.ok && old.project.waves).toEqual(DEFAULT_WAVES);
    const set = parseProject(
      fileWith((p) => {
        (p as Record<string, unknown>).waves = { fetch: 2500, fetchFrom: 450, fetchDepth: null, wind1: 15, wind50: 22, windAveragingS: 3600, quality: 'excellent' };
      }),
    );
    // Before D47: the single fetch goes to the sector of its direction (450° = 90° = E); UFC files open with AS 3962.
    const sectors = emptySectors();
    sectors[2]!.fetch = 2500;
    expect(set.ok && set.project.waves).toEqual({
      sectors,
      fetchDepth: null,
      wind1: 15,
      wind50: 22,
      windAveragingS: 3600,
      quality: 'excellent',
      criteria: 'as3962',
      location: null,
      climate: null,
      stationClimate: null,
      climateChoice: 'larger',
      autoFetch: null,
      autoDepth: null,
    });
    // D47: sectors and criteria are kept; wrong sector count or negative fetch refused.
    const own = emptySectors();
    own[0] = { fetch: 1200, depth: 3, wind1: null, wind50: 25 };
    own[5]!.fetch = 400;
    const kept = parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { sectors: own, criteria: 'ufc' })));
    expect(kept.ok && kept.project.waves.sectors).toEqual(own);
    expect(kept.ok && kept.project.waves.criteria).toBe('ufc');
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { sectors: own.slice(0, 7) }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { sectors: own.map((x) => ({ ...x, fetch: -5 })) }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { criteria: 'pianc' }))).ok).toBe(false);
    // D47: the automatic lookup is kept; a ray count that does not match the step is refused.
    const autoFetch = { source: 'OpenStreetMap', position: { lat: 63.56, lon: 27.19 }, radius: 20000, stepDeg: 90, distances: [1000, 2500, 300, 20000], fetchedOn: '2026-11-15' };
    const af = parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { autoFetch })));
    expect(af.ok && af.project.waves.autoFetch).toEqual(autoFetch);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { autoFetch: { ...autoFetch, distances: [1, 2] } }))).ok).toBe(false);
    // I110: the depth lookup is kept; a wrong sector count or source is refused.
    const autoDepth = { position: { lat: 63.57, lon: 27.22 }, fetchedOn: '2026-11-16', sectors: [{ depth: 3.6, source: 'syke', coverage: 0.6 }, null, null, null, { depth: 8.2, source: 'emodnet', coverage: 0.8 }, null, null, null] };
    const ad = parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { autoDepth })));
    expect(ad.ok && ad.project.waves.autoDepth).toEqual(autoDepth);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { autoDepth: { ...autoDepth, sectors: [null] } }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { autoDepth: { ...autoDepth, sectors: autoDepth.sectors.map((x) => (x ? { ...x, source: 'gebco' } : x)) } }))).ok).toBe(false);
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
    // I108: the FMI station climate and the choice are kept; an unknown choice is refused.
    const stationClimate = { ...climate, source: 'FMI open data; Helsinki Harmaja (fmisid 100996)', averagingS: 600 };
    const withStation = parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { climate, stationClimate, climateChoice: 'station' })));
    expect(withStation.ok && withStation.project.waves.stationClimate).toEqual(stationClimate);
    expect(withStation.ok && withStation.project.waves.climateChoice).toBe('station');
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { climateChoice: 'average' }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { stationClimate: { ...climate, sectors: [sector] } }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { fetch: -1 }))).ok).toBe(false);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waves = { quality: 'superb' }))).ok).toBe(false);
  });

  it('water levels (D50): the gauge and the normal range are kept; older files have neither', () => {
    const old = parseProject(fileWith((p) => delete (p as Record<string, unknown>).waterLevels));
    expect(old.ok && old.project.waterLevels).toBeNull();
    expect(old.ok && old.project.anchoring.normalHighWater).toBeNull();
    const info = {
      source: 'syke',
      station: 'Porovesi, Iisalmi',
      waterBody: 'Porovesi',
      position: { lat: 63.555, lon: 27.18 },
      distance: 700,
      startYear: 1966,
      endYear: 1995,
      levels: { hw: 2.29, mhw: 1.7, mw: 0.92, mnw: 0.23, nw: -0.41 },
      fetchedOn: '2026-11-15',
    };
    const set = parseProject(
      fileWith((p) => {
        (p as Record<string, unknown>).waterLevels = info;
        (p.anchoring as Record<string, unknown>).normalHighWater = 0.8;
        (p.anchoring as Record<string, unknown>).normalLowWater = 0.7;
      }),
    );
    expect(set.ok && set.project.waterLevels).toEqual(info);
    expect(set.ok && [set.project.anchoring.normalHighWater, set.project.anchoring.normalLowWater]).toEqual([0.8, 0.7]);
    // D52: the quay level, missing = not known.
    expect(old.ok && old.project.anchoring.quayLevel).toBeNull();
    const quay = parseProject(fileWith((p) => ((p.anchoring as Record<string, unknown>).quayLevel = 1.8)));
    expect(quay.ok && quay.project.anchoring.quayLevel).toBe(1.8);
    expect(parseProject(fileWith((p) => ((p as Record<string, unknown>).waterLevels = { ...info, source: 'smhi' }))).ok).toBe(false);
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
