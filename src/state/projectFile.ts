/**
 * JSON project file: export and import with structural validation (SPEC §2, persistence).
 */
import { DEFAULT_ANCHORING, type AnchoringParams, type Seabed } from '../engine/anchoring';
import { PRODUCT_CATEGORIES, PRODUCT_UNITS, type PriceList, type Product } from '../engine/catalog';
import { DEFAULT_COST, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../engine/defaults';
import {
  PROJECT_SCHEMA_VERSION,
  type AccessPontoon,
  type BackgroundImage,
  type Berth,
  type BoatClass,
  type CostSettings,
  type Finger,
  type Layout,
  type MainPier,
  type MapBackground,
  type ObjectiveSettings,
  type Obstacle,
  type Params,
  type Polygon,
  type Project,
  type RestrictedZone,
  type Site,
  type Vec2,
} from '../engine/model';

export const APP_ID = 'marina-layout-planner';

/** SPEC §1: every output must carry this note. */
export const DISCLAIMER =
  'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.';

export interface ProjectFile {
  app: typeof APP_ID;
  disclaimer: string;
  project: Project;
}

export function serializeProject(project: Project): string {
  const file: ProjectFile = { app: APP_ID, disclaimer: DISCLAIMER, project };
  return JSON.stringify(file, null, 2);
}

export type ParseResult = { ok: true; project: Project } | { ok: false; error: string };

class InvalidFile extends Error {}
const fail = (message: string): never => {
  throw new InvalidFile(message);
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string): Json => (isObject(v) ? v : fail(`${path} must be an object`));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(`${path} must be a list`));
const num = (v: unknown, path: string): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fail(`${path} must be a number`);
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(`${path} must be text`));
const bool = (v: unknown, path: string): boolean => (typeof v === 'boolean' ? v : fail(`${path} must be true or false`));
function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  return options.includes(v as T) ? (v as T) : fail(`${path} must be one of: ${options.join(', ')}`);
}

function vec(v: unknown, path: string): Vec2 {
  const o = obj(v, path);
  return { x: num(o.x, `${path}.x`), y: num(o.y, `${path}.y`) };
}
const points = (v: unknown, path: string): Vec2[] => arr(v, path).map((p, i) => vec(p, `${path}[${i}]`));
function polygon(v: unknown, path: string): Polygon {
  const ring = points(v, path);
  return ring.length >= 3 ? ring : fail(`${path} must have at least 3 points`);
}

function site(v: unknown): Site {
  const o = obj(v, 'site');
  const entrance = obj(o.entrance, 'site.entrance');
  return {
    // An empty water area is allowed: a new project has nothing drawn yet.
    water: arr(o.water, 'site.water').length === 0 ? [] : polygon(o.water, 'site.water'),
    shoreline: points(o.shoreline, 'site.shoreline'),
    entrance: { a: vec(entrance.a, 'site.entrance.a'), b: vec(entrance.b, 'site.entrance.b') },
    obstacles: arr(o.obstacles, 'site.obstacles').map((item, i): Obstacle => {
      const p = `site.obstacles[${i}]`;
      const e = obj(item, p);
      return {
        id: str(e.id, `${p}.id`),
        kind: oneOf(e.kind, ['pier', 'rock', 'island', 'structure', 'other'] as const, `${p}.kind`),
        shape: polygon(e.shape, `${p}.shape`),
      };
    }),
    zones: arr(o.zones, 'site.zones').map((item, i): RestrictedZone => {
      const p = `site.zones[${i}]`;
      const e = obj(item, p);
      return {
        id: str(e.id, `${p}.id`),
        kind: oneOf(e.kind, ['noStructures', 'noNavigation', 'protected'] as const, `${p}.kind`),
        shape: polygon(e.shape, `${p}.shape`),
      };
    }),
    // Extension (D21); files from older versions have none, and the key is then left out.
    ...(o.accessPontoons === undefined
      ? {}
      : {
          accessPontoons: arr(o.accessPontoons, 'site.accessPontoons').map((item, i): AccessPontoon => {
            const p = `site.accessPontoons[${i}]`;
            const e = obj(item, p);
            const width = num(e.width, `${p}.width`);
            if (width <= 0) fail(`${p}.width must be positive`);
            return { id: str(e.id, `${p}.id`), start: vec(e.start, `${p}.start`), end: vec(e.end, `${p}.end`), width };
          }),
        }),
  };
}

function boatClasses(v: unknown): BoatClass[] {
  return arr(v, 'boatClasses').map((item, i) => {
    const p = `boatClasses[${i}]`;
    const e = obj(item, p);
    const c: BoatClass = {
      id: str(e.id, `${p}.id`),
      name: str(e.name, `${p}.name`),
      length: num(e.length, `${p}.length`),
      beam: num(e.beam, `${p}.beam`),
      color: str(e.color, `${p}.color`),
      share: num(e.share, `${p}.share`),
      // Files from before target counts (D20) have none; 0 until the user sets them.
      count: e.count === undefined ? 0 : num(e.count, `${p}.count`),
    };
    if (c.length <= 0 || c.beam <= 0) fail(`${p}: length and beam must be positive`);
    if (c.share < 0) fail(`${p}.share must not be negative`);
    if (c.count < 0 || !Number.isInteger(c.count)) fail(`${p}.count must be a whole number, 0 or more`);
    return c;
  });
}

function params(v: unknown): Params {
  const o = obj(v, 'params');
  // Missing keys take their defaults, so files from older versions stay readable.
  const pick = (key: Exclude<keyof Params, 'boatsPerBay' | 'orientation' | 'berthTarget'>): number =>
    o[key] === undefined ? DEFAULT_PARAMS[key] : num(o[key], `params.${key}`);
  const boatsPerBay = o.boatsPerBay === undefined ? DEFAULT_PARAMS.boatsPerBay : o.boatsPerBay;
  if (boatsPerBay !== 1 && boatsPerBay !== 2) fail('params.boatsPerBay must be 1 or 2');
  const orientation = o.orientation === undefined || o.orientation === 'auto' ? 'auto' : num(o.orientation, 'params.orientation');
  return {
    mainPierWidth: pick('mainPierWidth'),
    fingerWidth: pick('fingerWidth'),
    fingerLengthRatio: pick('fingerLengthRatio'),
    boatsPerBay: boatsPerBay as 1 | 2,
    beamClearance: pick('beamClearance'),
    lengthClearance: pick('lengthClearance'),
    fairwayFactor: pick('fairwayFactor'),
    fairwayMin: pick('fairwayMin'),
    obstacleClearance: pick('obstacleClearance'),
    maxMainPierLength: pick('maxMainPierLength'),
    orientation,
    shoreOffset: pick('shoreOffset'),
    berthTarget:
      o.berthTarget === undefined ? DEFAULT_PARAMS.berthTarget : oneOf(o.berthTarget, ['share', 'count'] as const, 'params.berthTarget'),
  };
}

function objective(v: unknown): ObjectiveSettings {
  if (v === undefined) return DEFAULT_OBJECTIVE;
  const o = obj(v, 'objective');
  const w = obj(o.weights ?? DEFAULT_OBJECTIVE.weights, 'objective.weights');
  return {
    id: oneOf(o.id, ['maxCapacity', 'spaceEfficiency', 'minInfrastructure', 'balanced'] as const, 'objective.id'),
    targetBerths: o.targetBerths === undefined ? 0 : num(o.targetBerths, 'objective.targetBerths'),
    weights: {
      capacity: num(w.capacity, 'objective.weights.capacity'),
      pontoon: num(w.pontoon, 'objective.weights.pontoon'),
      fairway: num(w.fairway, 'objective.weights.fairway'),
    },
  };
}

/**
 * Only the elements of a layout are read. Fairways, issues, feasibility and statistics
 * are derived data and are recomputed when the project is loaded.
 */
function layout(v: unknown, i: number): Layout {
  const p = `layouts[${i}]`;
  const o = obj(v, p);
  const piers = arr(o.piers, `${p}.piers`).map((item, k): MainPier => {
    const q = `${p}.piers[${k}]`;
    const e = obj(item, q);
    return {
      id: str(e.id, `${q}.id`),
      start: vec(e.start, `${q}.start`),
      end: vec(e.end, `${q}.end`),
      width: num(e.width, `${q}.width`),
      locked: bool(e.locked, `${q}.locked`),
      origin: oneOf(e.origin, ['generated', 'manual'] as const, `${q}.origin`),
    };
  });
  const fingers = arr(o.fingers, `${p}.fingers`).map((item, k): Finger => {
    const q = `${p}.fingers[${k}]`;
    const e = obj(item, q);
    return { id: str(e.id, `${q}.id`), pierId: str(e.pierId, `${q}.pierId`), shape: polygon(e.shape, `${q}.shape`) };
  });
  const berths = arr(o.berths, `${p}.berths`).map((item, k): Berth => {
    const q = `${p}.berths[${k}]`;
    const e = obj(item, q);
    return {
      id: str(e.id, `${q}.id`),
      pierId: str(e.pierId, `${q}.pierId`),
      side: oneOf(e.side, ['left', 'right'] as const, `${q}.side`),
      boatClassId: str(e.boatClassId, `${q}.boatClassId`),
      slot: polygon(e.slot, `${q}.slot`),
      boat: polygon(e.boat, `${q}.boat`),
      removed: bool(e.removed, `${q}.removed`),
      issues: [],
    };
  });
  return {
    id: str(o.id, `${p}.id`),
    name: str(o.name, `${p}.name`),
    strategy: str(o.strategy, `${p}.strategy`),
    piers,
    fingers,
    berths,
    fairways: [],
    feasibility: 'geometricOK',
    issues: [],
    stats: {
      totalBerths: 0,
      berthsByClass: {},
      mainPierLength: 0,
      fingerLength: 0,
      accessPontoonLength: 0,
      pontoonLength: 0,
      pontoonDeckArea: 0,
      fairwayArea: 0,
      marinaWaterArea: 0,
      freeWaterArea: 0,
      berthsPer1000m2: 0,
      pontoonPerBerth: 0,
      mixDeviation: 0,
      unreachableRemoved: 0,
      targetShortfall: 0,
      issueCounts: { error: 0, warning: 0 },
    },
    score: typeof o.score === 'number' && Number.isFinite(o.score) ? o.score : 0,
    modified: bool(o.modified, `${p}.modified`),
    unreachableRemoved:
      typeof o.unreachableRemoved === 'number' && Number.isFinite(o.unreachableRemoved) && o.unreachableRemoved > 0
        ? Math.round(o.unreachableRemoved)
        : 0,
  };
}

function background(v: unknown): BackgroundImage | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, 'background');
  const dataUrl = str(o.dataUrl, 'background.dataUrl');
  if (!dataUrl.startsWith('data:image/')) fail('background.dataUrl must be an embedded image');
  const metresPerPixel = num(o.metresPerPixel, 'background.metresPerPixel');
  if (metresPerPixel <= 0) fail('background.metresPerPixel must be positive');
  return {
    dataUrl,
    origin: vec(o.origin, 'background.origin'),
    metresPerPixel,
    rotation: num(o.rotation, 'background.rotation'),
    opacity: num(o.opacity, 'background.opacity'),
  };
}

function mapBackground(v: unknown): MapBackground | null {
  if (v === null || v === undefined) return null;
  const o = obj(v, 'map');
  const lat = num(o.lat, 'map.lat');
  const lon = num(o.lon, 'map.lon');
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) fail('map.lat / map.lon are not a valid position');
  const opacity = o.opacity === undefined ? 0.8 : num(o.opacity, 'map.opacity');
  return { provider: oneOf(o.provider, ['osm'] as const, 'map.provider'), lat, lon, opacity: Math.min(1, Math.max(0, opacity)) };
}

/** Extension (D23). Missing values take their defaults, so older files stay readable. */
function anchoring(v: unknown): AnchoringParams {
  if (v === undefined) return structuredClone(DEFAULT_ANCHORING);
  const o = obj(v, 'anchoring');
  const d = DEFAULT_ANCHORING;
  const pick = (key: Exclude<keyof AnchoringParams, 'seabed' | 'friction' | 'anchorType'>): number =>
    o[key] === undefined ? d[key] : num(o[key], `anchoring.${key}`);
  const f = o.friction === undefined ? {} : obj(o.friction, 'anchoring.friction');
  const mu = (k: Seabed) => (f[k] === undefined ? d.friction[k] : num(f[k], `anchoring.friction.${k}`));
  const result: AnchoringParams = {
    depth: pick('depth'),
    highWater: pick('highWater'),
    lowWater: pick('lowWater'),
    seabed: o.seabed === undefined ? d.seabed : oneOf(o.seabed, ['clay', 'sand', 'rock'] as const, 'anchoring.seabed'),
    windSpeed: pick('windSpeed'),
    airDensity: pick('airDensity'),
    dragCoefficient: pick('dragCoefficient'),
    leewardFactor: pick('leewardFactor'),
    profileHeightRatio: pick('profileHeightRatio'),
    pontoonFreeboard: pick('pontoonFreeboard'),
    lineSpacing: pick('lineSpacing'),
    chainSafetyFactor: pick('chainSafetyFactor'),
    corrosionAllowance: pick('corrosionAllowance'),
    slidingSafetyFactor: pick('slidingSafetyFactor'),
    friction: { clay: mu('clay'), sand: mu('sand'), rock: mu('rock') },
    chainLengthFactor: pick('chainLengthFactor'),
    maxAnchorMass: pick('maxAnchorMass'),
    anchorType: o.anchorType === undefined ? d.anchorType : oneOf(o.anchorType, ['block', 'wedge'] as const, 'anchoring.anchorType'),
    waterDensity: pick('waterDensity'),
    concreteDensity: pick('concreteDensity'),
    steelDensity: pick('steelDensity'),
  };
  if (result.depth <= 0) fail('anchoring.depth must be positive');
  if (result.lineSpacing <= 0) fail('anchoring.lineSpacing must be positive');
  if (result.maxAnchorMass <= 0) fail('anchoring.maxAnchorMass must be positive');
  if (Object.values(result.friction).some((x) => x <= 0)) fail('anchoring.friction values must be positive');
  return result;
}

/** An imported price list kept in the project (D24). */
function priceList(v: unknown): PriceList | null {
  if (v === undefined || v === null) return null;
  const o = obj(v, 'cost.priceList');
  const optNum = (x: unknown, path: string): number | null => (x === null || x === undefined ? null : num(x, path));
  const products = arr(o.products, 'cost.priceList.products').map((item, i): Product => {
    const p = `cost.priceList.products[${i}]`;
    const e = obj(item, p);
    const text = (k: string) => (e[k] === undefined ? '' : str(e[k], `${p}.${k}`));
    return {
      id: str(e.id, `${p}.id`),
      category: oneOf(e.category, PRODUCT_CATEGORIES, `${p}.category`),
      supplier: text('supplier'),
      series: text('series'),
      name: str(e.name, `${p}.name`),
      code: text('code'),
      unit: oneOf(e.unit, PRODUCT_UNITS, `${p}.unit`),
      price: optNum(e.price, `${p}.price`),
      priceIncludesVat: e.priceIncludesVat === undefined ? false : bool(e.priceIncludesVat, `${p}.priceIncludesVat`),
      marginPct: optNum(e.marginPct, `${p}.marginPct`) ?? 0,
      lengthM: optNum(e.lengthM, `${p}.lengthM`),
      widthM: optNum(e.widthM, `${p}.widthM`),
      weightKg: optNum(e.weightKg, `${p}.weightKg`),
      capacityKg: optNum(e.capacityKg, `${p}.capacityKg`),
      freeboardM: optNum(e.freeboardM, `${p}.freeboardM`),
      chainDiameterMm: optNum(e.chainDiameterMm, `${p}.chainDiameterMm`),
      chainGrade: text('chainGrade'),
      breakingLoadKn: optNum(e.breakingLoadKn, `${p}.breakingLoadKn`),
      massKgPerM: optNum(e.massKgPerM, `${p}.massKgPerM`),
      anchorMassKg: optNum(e.anchorMassKg, `${p}.anchorMassKg`),
      shackleMm: optNum(e.shackleMm, `${p}.shackleMm`),
      sourceUrl: text('sourceUrl'),
      sourceDate: text('sourceDate'),
      note: text('note'),
    };
  });
  const parameters = arr(o.parameters, 'cost.priceList.parameters').map((item, i) => {
    const p = `cost.priceList.parameters[${i}]`;
    const e = obj(item, p);
    return {
      key: str(e.key, `${p}.key`),
      value: num(e.value, `${p}.value`),
      unit: e.unit === undefined ? '' : str(e.unit, `${p}.unit`),
      description: e.description === undefined ? '' : str(e.description, `${p}.description`),
      source: e.source === undefined ? '' : str(e.source, `${p}.source`),
    };
  });
  return { title: str(o.title, 'cost.priceList.title'), products, parameters };
}

/** Extension (D24). */
function costSettings(v: unknown): CostSettings {
  if (v === undefined) return { ...DEFAULT_COST };
  const o = obj(v, 'cost');
  const series = (k: 'pontoonSeries' | 'fingerSeries' | 'gangwaySeries') => (o[k] === undefined ? '' : str(o[k], `cost.${k}`));
  return {
    priceList: priceList(o.priceList),
    pontoonSeries: series('pontoonSeries'),
    fingerSeries: series('fingerSeries'),
    gangwaySeries: series('gangwaySeries'),
  };
}

/** Read a project from the text of a project file. Never throws. */
export function parseProject(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' };
  }
  try {
    const file = obj(raw, 'file');
    if (file.app !== APP_ID) fail('This is not a Marina Layout Planner project file');
    const p = obj(file.project, 'project');
    if (p.schemaVersion !== PROJECT_SCHEMA_VERSION) {
      fail(`Unsupported project version ${String(p.schemaVersion)} (this app reads version ${PROJECT_SCHEMA_VERSION})`);
    }
    const layouts = arr(p.layouts ?? [], 'layouts').map(layout);
    const preferred = p.preferredLayoutId === null || p.preferredLayoutId === undefined ? null : str(p.preferredLayoutId, 'preferredLayoutId');
    const project: Project = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: str(p.name, 'name'),
      site: site(p.site),
      boatClasses: boatClasses(p.boatClasses),
      params: params(p.params),
      objective: objective(p.objective),
      layouts,
      preferredLayoutId: preferred !== null && layouts.some((l) => l.id === preferred) ? preferred : null,
      background: background(p.background),
      map: mapBackground(p.map),
      anchoring: anchoring(p.anchoring),
      cost: costSettings(p.cost),
      generatedFrom: typeof p.generatedFrom === 'string' ? p.generatedFrom : null,
    };
    return { ok: true, project };
  } catch (error) {
    if (error instanceof InvalidFile) return { ok: false, error: `${error.message}.` };
    throw error;
  }
}
