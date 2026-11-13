/**
 * Application state: one store (SPEC §2).
 *
 * `project` is the document. Every change to it goes through `commit`, which keeps
 * immutable snapshots for undo/redo. Everything else (selection, active tool, language,
 * layers) is session state and is not undoable.
 */
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../engine/defaults';
import { DEMO_PROJECTS, type DemoEntry } from '../engine/demos';
import { movePier, setBerthRemoved, setPierLocked, type EditContext } from '../engine/edit';
import { generateLayouts, type Diagnostic } from '../engine/generate';
import { boundingBox, distance, ensureCounterClockwise, type Box } from '../engine/geometry';
import { evaluateLayout } from '../engine/layout';
import {
  PROJECT_SCHEMA_VERSION,
  type BackgroundImage,
  type BoatClass,
  type Layout,
  type ObjectiveSettings,
  type ObstacleKind,
  type Params,
  type Project,
  type Site,
  type Vec2,
  type ZoneKind,
} from '../engine/model';
import { rankLayouts, scoreLayouts } from '../engine/score';
import { prepareSite, type PreparedSite } from '../engine/site';
import type { Language } from '../i18n';
import { parseProject } from './projectFile';
import { DEFAULT_VIEW, fitBounds, type Size, type View } from './view';

/** Everything drawn on the site, as a box; a default area when the site is empty. */
export function projectBounds(project: Project): Box {
  const { site } = project;
  const points = [
    ...site.water,
    ...site.shoreline,
    ...site.obstacles.flatMap((o) => o.shape),
    ...site.zones.flatMap((z) => z.shape),
  ];
  return points.length > 0 ? boundingBox(points) : { minX: 0, minY: 0, maxX: 200, maxY: 120 };
}

/** Number of undo steps kept. */
export const HISTORY_LIMIT = 100;

export const LAYER_IDS = [
  'background',
  'grid',
  'water',
  'shoreline',
  'obstacles',
  'zones',
  'fairways',
  'piers',
  'fingers',
  'slots',
  'boats',
  'issues',
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export type ToolId =
  | 'select'
  | 'edit'
  | 'water'
  | 'shoreline'
  | 'entrance'
  | 'obstacle'
  | 'zone'
  | 'measure'
  | 'calibrate';

export type Selection = { kind: 'pier' | 'berth'; id: string } | null;

export function emptyProject(): Project {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: 'Untitled project',
    site: { water: [], shoreline: [], entrance: { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } }, obstacles: [], zones: [] },
    boatClasses: structuredClone(DEFAULT_BOAT_CLASSES),
    params: { ...DEFAULT_PARAMS },
    objective: structuredClone(DEFAULT_OBJECTIVE),
    layouts: [],
    preferredLayoutId: null,
    background: null,
    generatedFrom: null,
  };
}

/**
 * Fingerprint of everything the generator depends on. Boat names and colours, the
 * objective and the project name are left out: changing them needs no regeneration.
 */
export function inputFingerprint(project: Pick<Project, 'site' | 'boatClasses' | 'params'>): string {
  const text = JSON.stringify({
    site: project.site,
    classes: project.boatClasses.map((c) => [c.id, c.length, c.beam, c.share]),
    params: project.params,
  });
  // FNV-1a, 32 bit: short and stable; collisions would only hide the "Regenerate" hint.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** True when the layouts were generated from inputs that have since changed. */
export const needsRegeneration = (project: Project): boolean =>
  project.layouts.length > 0 && project.generatedFrom !== inputFingerprint(project);

export interface CommitOptions {
  /**
   * Consecutive commits with the same key are merged into one undo step
   * (used while dragging and while typing in a field).
   */
  coalesce?: string;
}

export interface AppState {
  // --- document, undoable -------------------------------------------------
  project: Project;
  past: Project[];
  future: Project[];
  coalesceKey: string | null;

  // --- session ------------------------------------------------------------
  language: Language;
  tool: ToolId;
  layers: Record<LayerId, boolean>;
  selectedLayoutId: string | null;
  selection: Selection;
  /** Why the last generation produced nothing (empty when it succeeded). */
  diagnostics: Diagnostic[];
  /** Message for the user from the last file or storage operation, if it failed. */
  notice: string | null;
  view: View;
  /** Size of the canvas in pixels. */
  viewport: Size;
  /** Points of the shape being drawn, or the points of the measure / calibrate tool. */
  draft: Vec2[];
  /** Snapped cursor position in world coordinates while a drawing tool is active. */
  cursor: Vec2 | null;
  obstacleKind: ObstacleKind;
  zoneKind: ZoneKind;

  // --- actions ------------------------------------------------------------
  commit: (recipe: (project: Project) => Project, options?: CommitOptions) => void;
  /** End the current coalescing run so the next commit starts a new undo step. */
  endCoalescing: () => void;
  undo: () => void;
  redo: () => void;

  newProject: () => void;
  loadDemo: (id: DemoEntry['id']) => void;
  /** Replace the document with a project read from a file. Returns false if it is invalid. */
  openProjectFile: (text: string) => boolean;
  replaceProject: (project: Project) => void;

  setProjectName: (name: string) => void;
  updateSite: (recipe: (site: Site) => Site, options?: CommitOptions) => void;
  setBoatClasses: (classes: BoatClass[], options?: CommitOptions) => void;
  setParams: (patch: Partial<Params>, options?: CommitOptions) => void;
  setObjective: (patch: Partial<ObjectiveSettings>, options?: CommitOptions) => void;
  setBackground: (background: BackgroundImage | null, options?: CommitOptions) => void;

  generate: () => void;
  selectLayout: (id: string | null) => void;
  setPreferredLayout: (id: string | null) => void;
  setBerthRemoved: (layoutId: string, berthId: string, removed: boolean) => void;
  setPierLocked: (layoutId: string, pierId: string, locked: boolean) => void;
  movePier: (layoutId: string, pierId: string, delta: Vec2, options?: CommitOptions) => void;

  setView: (view: View) => void;
  setViewport: (size: Size) => void;
  /** Show the whole site. */
  fitView: () => void;
  zoomToBox: (box: Box) => void;
  setCursor: (cursor: Vec2 | null) => void;
  /**
   * A click with a drawing tool. `closeTolerance` (world metres) is how near the first
   * point a click must be to close a polygon.
   */
  addDraftPoint: (point: Vec2, closeTolerance: number) => void;
  removeLastDraftPoint: () => void;
  cancelDraft: () => void;
  /** Turn the draft into the site object of the active tool. */
  finishDraft: () => void;
  setObstacleKind: (kind: ObstacleKind) => void;
  setZoneKind: (kind: ZoneKind) => void;

  setLanguage: (language: Language) => void;
  setTool: (tool: ToolId) => void;
  toggleLayer: (layer: LayerId) => void;
  select: (selection: Selection) => void;
  setNotice: (notice: string | null) => void;
}

/** prepareSite is the costly part of re-validation; remember it for the current site. */
function makeEditContext(): (project: Project) => EditContext {
  let cache: { site: Site; clearance: number; prepared: PreparedSite } | null = null;
  return (project) => {
    if (!cache || cache.site !== project.site || cache.clearance !== project.params.obstacleClearance) {
      cache = {
        site: project.site,
        clearance: project.params.obstacleClearance,
        prepared: prepareSite(project.site, project.params),
      };
    }
    return { prepared: cache.prepared, classes: project.boatClasses, params: project.params };
  };
}

/** Recompute the derived data of the layouts in a project that was read from a file. */
function withEvaluatedLayouts(project: Project): Project {
  if (project.layouts.length === 0 || project.site.water.length < 3) return { ...project, layouts: [] };
  const prepared = prepareSite(project.site, project.params);
  const layouts = project.layouts.map((l) => ({
    ...evaluateLayout(l, prepared, project.boatClasses, project.params),
    score: l.score,
  }));
  return { ...project, layouts: scoreLayouts(layouts, project.objective) };
}

export function createAppStore(initial: Project = emptyProject()): StoreApi<AppState> {
  const editContext = makeEditContext();

  return createStore<AppState>()((set, get) => {
    const resetSession = (project: Project) => ({
      project,
      past: [],
      future: [],
      coalesceKey: null,
      selectedLayoutId: project.preferredLayoutId ?? project.layouts[0]?.id ?? null,
      selection: null,
      diagnostics: [],
      notice: null,
      tool: 'select' as ToolId,
      draft: [] as Vec2[],
      cursor: null,
    });

    /** A free id of the form `${prefix}-${n}`. */
    const nextId = (prefix: string, taken: string[]): string => {
      for (let n = 1; ; n++) if (!taken.includes(`${prefix}-${n}`)) return `${prefix}-${n}`;
    };

    const editLayout = (layoutId: string, edit: (layout: Layout, ctx: EditContext) => Layout, options?: CommitOptions) => {
      const { project } = get();
      const current = project.layouts.find((l) => l.id === layoutId);
      if (!current) return;
      const edited = edit(current, editContext(project));
      if (edited === current) return;
      get().commit(
        (p) => ({
          ...p,
          layouts: scoreLayouts(p.layouts.map((l) => (l.id === layoutId ? edited : l)), p.objective),
        }),
        options,
      );
    };

    return {
      ...resetSession(initial),
      language: 'en',
      view: DEFAULT_VIEW,
      viewport: { width: 800, height: 600 },
      obstacleKind: 'rock',
      zoneKind: 'noNavigation',
      layers: Object.fromEntries(LAYER_IDS.map((id) => [id, true])) as Record<LayerId, boolean>,

      commit: (recipe, options) => {
        const state = get();
        const next = recipe(state.project);
        if (next === state.project) return;
        const merge = options?.coalesce !== undefined && options.coalesce === state.coalesceKey;
        set({
          project: next,
          past: merge ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT),
          future: [],
          coalesceKey: options?.coalesce ?? null,
        });
      },
      endCoalescing: () => set({ coalesceKey: null }),

      undo: () => {
        const { past, future, project } = get();
        const previous = past[past.length - 1];
        if (!previous) return;
        set({ project: previous, past: past.slice(0, -1), future: [project, ...future], coalesceKey: null });
        get().select(null);
      },
      redo: () => {
        const { past, future, project } = get();
        const next = future[0];
        if (!next) return;
        set({ project: next, past: [...past, project], future: future.slice(1), coalesceKey: null });
        get().select(null);
      },

      newProject: () => set(resetSession(emptyProject())),
      loadDemo: (id) => {
        const demo = DEMO_PROJECTS.find((d) => d.id === id);
        if (demo) set(resetSession(demo.create()));
      },
      openProjectFile: (text) => {
        const parsed = parseProject(text);
        if (!parsed.ok) {
          set({ notice: parsed.error });
          return false;
        }
        set(resetSession(withEvaluatedLayouts(parsed.project)));
        return true;
      },
      replaceProject: (project) => set(resetSession(withEvaluatedLayouts(project))),

      setProjectName: (name) => get().commit((p) => ({ ...p, name }), { coalesce: 'project-name' }),
      updateSite: (recipe, options) =>
        get().commit((p) => {
          const site = recipe(p.site);
          return site === p.site ? p : { ...p, site };
        }, options),
      setBoatClasses: (boatClasses, options) => get().commit((p) => ({ ...p, boatClasses }), options),
      setParams: (patch, options) => get().commit((p) => ({ ...p, params: { ...p.params, ...patch } }), options),
      setObjective: (patch, options) =>
        get().commit((p) => {
          const objective = { ...p.objective, ...patch };
          // The objective needs no regeneration: the existing alternatives are re-ranked.
          return { ...p, objective, layouts: rankLayouts(p.layouts, objective) };
        }, options),
      setBackground: (background, options) => get().commit((p) => ({ ...p, background }), options),

      generate: () => {
        const { project } = get();
        const result = generateLayouts({
          site: project.site,
          boatClasses: project.boatClasses,
          params: project.params,
          objective: project.objective,
        });
        get().commit((p) => ({
          ...p,
          layouts: result.layouts,
          preferredLayoutId: null,
          generatedFrom: result.layouts.length > 0 ? inputFingerprint(p) : null,
        }));
        set({ diagnostics: result.diagnostics, selectedLayoutId: result.layouts[0]?.id ?? null, selection: null });
      },
      selectLayout: (id) => set({ selectedLayoutId: id, selection: null }),
      setPreferredLayout: (id) => get().commit((p) => ({ ...p, preferredLayoutId: id })),
      setBerthRemoved: (layoutId, berthId, removed) =>
        editLayout(layoutId, (layout, ctx) => setBerthRemoved(layout, berthId, removed, ctx)),
      setPierLocked: (layoutId, pierId, locked) => editLayout(layoutId, (layout) => setPierLocked(layout, pierId, locked)),
      movePier: (layoutId, pierId, delta, options) =>
        editLayout(layoutId, (layout, ctx) => movePier(layout, pierId, delta, ctx), options),

      setView: (view) => set({ view }),
      setViewport: (viewport) => set({ viewport }),
      fitView: () => set((s) => ({ view: fitBounds(projectBounds(s.project), s.viewport) })),
      zoomToBox: (box) => set((s) => ({ view: fitBounds(box, s.viewport, Math.min(s.viewport.width, s.viewport.height) / 3) })),
      setCursor: (cursor) => set({ cursor }),

      addDraftPoint: (point, closeTolerance) => {
        const { tool, draft } = get();
        if (tool === 'measure' || tool === 'calibrate') {
          // The third click starts a new measurement.
          set({ draft: draft.length >= 2 ? [point] : [...draft, point] });
          return;
        }
        const isPolygon = tool === 'water' || tool === 'obstacle' || tool === 'zone';
        if (isPolygon && draft.length >= 3 && distance(draft[0]!, point) <= closeTolerance) {
          get().finishDraft();
          return;
        }
        set({ draft: [...draft, point] });
        if (tool === 'entrance' && draft.length === 1) get().finishDraft();
      },
      removeLastDraftPoint: () => set((s) => ({ draft: s.draft.slice(0, -1) })),
      cancelDraft: () => set({ draft: [] }),
      finishDraft: () => {
        const { tool, obstacleKind, zoneKind } = get();
        // A double-click adds the same point twice; drop repeated points.
        const points = get().draft.filter((p, i, all) => i === 0 || distance(p, all[i - 1]!) > 1e-6);
        const closed = points.length > 1 && distance(points[0]!, points[points.length - 1]!) <= 1e-6 ? points.slice(0, -1) : points;
        set({ draft: [] });
        if (tool === 'water' && closed.length >= 3) {
          get().updateSite((site) => ({ ...site, water: ensureCounterClockwise(closed) }));
          set({ tool: 'select' });
        } else if (tool === 'shoreline' && points.length >= 2) {
          get().updateSite((site) => ({ ...site, shoreline: points }));
          set({ tool: 'select' });
        } else if (tool === 'entrance' && points.length >= 2) {
          get().updateSite((site) => ({ ...site, entrance: { a: points[0]!, b: points[1]! } }));
          set({ tool: 'select' });
        } else if (tool === 'obstacle' && closed.length >= 3) {
          get().updateSite((site) => ({
            ...site,
            obstacles: [
              ...site.obstacles,
              { id: nextId('obstacle', site.obstacles.map((o) => o.id)), kind: obstacleKind, shape: ensureCounterClockwise(closed) },
            ],
          }));
        } else if (tool === 'zone' && closed.length >= 3) {
          get().updateSite((site) => ({
            ...site,
            zones: [
              ...site.zones,
              { id: nextId('zone', site.zones.map((z) => z.id)), kind: zoneKind, shape: ensureCounterClockwise(closed) },
            ],
          }));
        }
      },
      setObstacleKind: (obstacleKind) => set({ obstacleKind }),
      setZoneKind: (zoneKind) => set({ zoneKind }),

      setLanguage: (language) => set({ language }),
      setTool: (tool) => set({ tool, coalesceKey: null, draft: [], cursor: null }),
      toggleLayer: (layer) => set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
      select: (selection) => set({ selection }),
      setNotice: (notice) => set({ notice }),
    };
  });
}

/** The store used by the running app. */
export const appStore = createAppStore();

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
