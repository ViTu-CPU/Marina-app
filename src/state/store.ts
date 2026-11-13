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
import { evaluateLayout } from '../engine/layout';
import {
  PROJECT_SCHEMA_VERSION,
  type BackgroundImage,
  type BoatClass,
  type Layout,
  type ObjectiveSettings,
  type Params,
  type Project,
  type Site,
  type Vec2,
} from '../engine/model';
import { rankLayouts, scoreLayouts } from '../engine/score';
import { prepareSite, type PreparedSite } from '../engine/site';
import type { Language } from '../i18n';
import { parseProject } from './projectFile';

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
    });

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

      setLanguage: (language) => set({ language }),
      setTool: (tool) => set({ tool, coalesceKey: null }),
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
