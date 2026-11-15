/**
 * JSON project file: export and import with structural validation (SPEC §2, persistence).
 */
import { DEFAULT_ANCHORING, MAX_SPLAY_ANGLE, type AnchoringParams, type Seabed } from '../engine/anchoring';
import type { CharacteristicLevels, WaterLevelInfo } from '../engine/waterLevels';
import { DEFAULT_WAVES, emptySectors, WAVE_SECTORS, waveSectorOf, type AutoFetch, type WaveSettings } from '../engine/waves';
import { SECTORS, type WindClimate } from '../engine/wind';
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
            // Extension (D32): gangway positions; missing = one at the middle.
            const gangways = e.gangways === undefined ? [] : arr(e.gangways, `${p}.gangways`).map((x, k) => num(x, `${p}.gangways[${k}]`));
            if (gangways.some((x) => x < 0)) fail(`${p}.gangways must not be negative`);
            return {
              id: str(e.id, `${p}.id`),
              start: vec(e.start, `${p}.start`),
              end: vec(e.end, `${p}.end`),
              width,
              ...(gangways.length > 0 ? { gangways } : {}),
            };
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
      // D36: optional boat weight, t.
      ...(e.weight === undefined || e.weight === null ? {} : { weight: num(e.weight, `${p}.weight`) }),
    };
    if (c.weight !== undefined && !(c.weight > 0)) fail(`${p}.weight must be positive`);
    if (c.length <= 0 || c.beam <= 0) fail(`${p}: length and beam must be positive`);
    if (c.share < 0) fail(`${p}.share must not be negative`);
    if (c.count < 0 || !Number.isInteger(c.count)) fail(`${p}.count must be a whole number, 0 or more`);
    return c;
  });
}

/** Extension (D29, D34): a list of standard lengths; missing in older files (the default). */
function lengthList(v: unknown, key: 'fingerLengths' | 'boomLengths'): number[] {
  if (v === undefined) return [...DEFAULT_PARAMS[key]];
  const list = arr(v, `params.${key}`).map((x, i) => num(x, `params.${key}[${i}]`));
  if (list.some((x) => !(x > 0))) fail(`params.${key} must be positive lengths`);
  return [...new Set(list)].sort((a, b) => a - b);
}

const BERTH_TYPES = ['finger', 'yBoom', 'sternBuoy'] as const;

function params(v: unknown): Params {
  const o = obj(v, 'params');
  // Missing keys take their defaults, so files from older versions stay readable.
  const pick = (key: Exclude<keyof Params, 'boatsPerBay' | 'orientation' | 'berthTarget' | 'fingerLengths' | 'berthType' | 'boomLengths' | 'waterDepth' | 'pierSeries' | 'pierModuleLengths' | 'shoreGap'>): number =>
    o[key] === undefined ? DEFAULT_PARAMS[key] : num(o[key], `params.${key}`);
  const boatsPerBay = o.boatsPerBay === undefined ? DEFAULT_PARAMS.boatsPerBay : o.boatsPerBay;
  if (boatsPerBay !== 1 && boatsPerBay !== 2) fail('params.boatsPerBay must be 1 or 2');
  const orientation = o.orientation === undefined || o.orientation === 'auto' ? 'auto' : num(o.orientation, 'params.orientation');
  // D44: files from before the module rule keep piers of any length (I89).
  const moduleLengths = o.pierModuleLengths === undefined ? [] : arr(o.pierModuleLengths, 'params.pierModuleLengths').map((x, i) => num(x, `params.pierModuleLengths[${i}]`));
  if (moduleLengths.some((x) => !(x > 0))) fail('params.pierModuleLengths must be positive lengths');
  return {
    mainPierWidth: pick('mainPierWidth'),
    pierSeries: o.pierSeries === undefined ? (o.pierModuleLengths === undefined ? 'free' : 'custom') : str(o.pierSeries, 'params.pierSeries'),
    pierModuleLengths: [...new Set(moduleLengths)].sort((a, b) => b - a),
    fingerWidth: pick('fingerWidth'),
    fingerLengthRatio: pick('fingerLengthRatio'),
    fingerLengths: lengthList(o.fingerLengths, 'fingerLengths'),
    berthType: o.berthType === undefined ? DEFAULT_PARAMS.berthType : oneOf(o.berthType, BERTH_TYPES, 'params.berthType'),
    boomLengths: lengthList(o.boomLengths, 'boomLengths'),
    boomWidth: pick('boomWidth'),
    buoyDepthFactor: pick('buoyDepthFactor'),
    boatsPerBay: boatsPerBay as 1 | 2,
    beamClearance: pick('beamClearance'),
    lengthClearance: pick('lengthClearance'),
    fairwayFactor: pick('fairwayFactor'),
    fairwayMin: pick('fairwayMin'),
    buoyFairwayFactor: pick('buoyFairwayFactor'),
    buoyFairwayMin: pick('buoyFairwayMin'),
    obstacleClearance: pick('obstacleClearance'),
    maxMainPierLength: pick('maxMainPierLength'),
    orientation,
    shoreOffset: pick('shoreOffset'),
    // D49: files from before the gangway rule had piers touching the shore (I97).
    shoreGap: o.shoreGap === undefined ? 0 : num(o.shoreGap, 'params.shoreGap'),
    gangwayLength: pick('gangwayLength'),
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
    return {
      id: str(e.id, `${q}.id`),
      pierId: str(e.pierId, `${q}.pierId`),
      shape: polygon(e.shape, `${q}.shape`),
      ...(e.kind === undefined ? {} : { kind: oneOf(e.kind, ['boom'] as const, `${q}.kind`) }),
    };
  });
  const berths = arr(o.berths, `${p}.berths`).map((item, k): Berth => {
    const q = `${p}.berths[${k}]`;
    const e = obj(item, q);
    return {
      id: str(e.id, `${q}.id`),
      pierId: str(e.pierId, `${q}.pierId`),
      side: oneOf(e.side, ['left', 'right'] as const, `${q}.side`),
      boatClassId: str(e.boatClassId, `${q}.boatClassId`),
      ...(e.type === undefined ? {} : { type: oneOf(e.type, BERTH_TYPES, `${q}.type`) }),
      slot: polygon(e.slot, `${q}.slot`),
      boat: polygon(e.boat, `${q}.boat`),
      ...(e.buoy === undefined ? {} : { buoy: vec(e.buoy, `${q}.buoy`) }),
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

/**
 * Extension (D40, D47): wave screening inputs; missing in older files (nothing entered). Files
 * from before D47 have one fetch and its direction: the fetch goes to the sector of that direction.
 */
function waveSettings(v: unknown): WaveSettings {
  if (v === undefined) return structuredClone(DEFAULT_WAVES);
  const o = obj(v, 'waves');
  const positive = (x: unknown, path: string): number | null => {
    if (x === undefined || x === null) return null;
    const n = num(x, path);
    if (!(n > 0)) fail(`${path} must be positive`);
    return n;
  };
  const averaging = o.windAveragingS === undefined ? DEFAULT_WAVES.windAveragingS : num(o.windAveragingS, 'waves.windAveragingS');
  if (!(averaging > 0)) fail('waves.windAveragingS must be positive');
  let sectors = emptySectors();
  if (o.sectors !== undefined) {
    const list = arr(o.sectors, 'waves.sectors');
    if (list.length !== WAVE_SECTORS.length) fail(`waves.sectors must have ${WAVE_SECTORS.length} sectors`);
    sectors = list.map((item, i) => {
      const path = `waves.sectors[${i}]`;
      const x = obj(item, path);
      const fetch = x.fetch === undefined || x.fetch === null ? 0 : num(x.fetch, `${path}.fetch`);
      if (fetch < 0) fail(`${path}.fetch must not be negative`);
      return { fetch, depth: positive(x.depth, `${path}.depth`), wind1: positive(x.wind1, `${path}.wind1`), wind50: positive(x.wind50, `${path}.wind50`) };
    });
  } else {
    // Before D47: the longest fetch and the direction it came from.
    const fetch = positive(o.fetch, 'waves.fetch');
    if (fetch !== null) {
      const from = o.fetchFrom === undefined ? 0 : num(o.fetchFrom, 'waves.fetchFrom');
      sectors[waveSectorOf(from)]!.fetch = fetch;
    }
  }
  return {
    sectors,
    fetchDepth: positive(o.fetchDepth, 'waves.fetchDepth'),
    wind1: positive(o.wind1, 'waves.wind1'),
    wind50: positive(o.wind50, 'waves.wind50'),
    windAveragingS: averaging,
    quality: o.quality === undefined ? DEFAULT_WAVES.quality : oneOf(o.quality, ['excellent', 'good', 'moderate'] as const, 'waves.quality'),
    // Files from before D47 were judged with UFC 4-152-07; they now open with AS 3962 like new projects.
    criteria: o.criteria === undefined ? DEFAULT_WAVES.criteria : oneOf(o.criteria, ['as3962', 'ufc'] as const, 'waves.criteria'),
    location: o.location === undefined || o.location === null ? null : latLon(o.location, 'waves.location'),
    climate: o.climate === undefined || o.climate === null ? null : windClimateOf(o.climate),
    autoFetch: o.autoFetch === undefined || o.autoFetch === null ? null : autoFetchOf(o.autoFetch),
  };
}

/** D50: the levels of a gauge near the site. */
function waterLevelInfo(v: unknown): WaterLevelInfo {
  const o = obj(v, 'waterLevels');
  const l = obj(o.levels, 'waterLevels.levels');
  const level = (k: keyof CharacteristicLevels) => num(l[k], `waterLevels.levels.${k}`);
  return {
    source: oneOf(o.source, ['fmi', 'syke'] as const, 'waterLevels.source'),
    station: str(o.station, 'waterLevels.station'),
    waterBody: o.waterBody === undefined || o.waterBody === null ? null : str(o.waterBody, 'waterLevels.waterBody'),
    position: latLon(o.position, 'waterLevels.position'),
    distance: num(o.distance, 'waterLevels.distance'),
    startYear: num(o.startYear, 'waterLevels.startYear'),
    endYear: num(o.endYear, 'waterLevels.endYear'),
    levels: { hw: level('hw'), mhw: level('mhw'), mw: level('mw'), mnw: level('mnw'), nw: level('nw') },
    fetchedOn: str(o.fetchedOn, 'waterLevels.fetchedOn'),
  };
}

/** D47: a saved automatic fetch lookup. */
function autoFetchOf(v: unknown): AutoFetch {
  const o = obj(v, 'waves.autoFetch');
  const radius = num(o.radius, 'waves.autoFetch.radius');
  const stepDeg = num(o.stepDeg, 'waves.autoFetch.stepDeg');
  if (!(radius > 0) || !(stepDeg > 0) || 360 % stepDeg !== 0) fail('waves.autoFetch.radius / stepDeg are not valid');
  const distances = arr(o.distances, 'waves.autoFetch.distances').map((x, i) => num(x, `waves.autoFetch.distances[${i}]`));
  if (distances.length !== 360 / stepDeg) fail('waves.autoFetch.distances must have one value per ray');
  return {
    source: str(o.source, 'waves.autoFetch.source'),
    position: latLon(o.position, 'waves.autoFetch.position'),
    radius,
    stepDeg,
    distances,
    fetchedOn: str(o.fetchedOn, 'waves.autoFetch.fetchedOn'),
  };
}

function latLon(v: unknown, path: string): { lat: number; lon: number } {
  const o = obj(v, path);
  const lat = num(o.lat, `${path}.lat`);
  const lon = num(o.lon, `${path}.lon`);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) fail(`${path} is not a valid position`);
  return { lat, lon };
}

/** D41: a saved wind climate (summary of a fetched record). */
function windClimateOf(v: unknown): WindClimate {
  const o = obj(v, 'waves.climate');
  const nullable = (x: unknown, path: string): number | null => (x === null || x === undefined ? null : num(x, path));
  const sectors = arr(o.sectors, 'waves.climate.sectors').map((item, i) => {
    const p = `waves.climate.sectors[${i}]`;
    const s = obj(item, p);
    return {
      rose: arr(s.rose, `${p}.rose`).map((x, k) => num(x, `${p}.rose[${k}]`)),
      annualMax: arr(s.annualMax, `${p}.annualMax`).map((x, k) => num(x, `${p}.annualMax[${k}]`)),
      oneYear: nullable(s.oneYear, `${p}.oneYear`),
      fiftyYear: nullable(s.fiftyYear, `${p}.fiftyYear`),
    };
  });
  if (sectors.length !== SECTORS) fail(`waves.climate.sectors must have ${SECTORS} sectors`);
  return {
    source: str(o.source, 'waves.climate.source'),
    requested: latLon(o.requested, 'waves.climate.requested'),
    cell: latLon(o.cell, 'waves.climate.cell'),
    startYear: num(o.startYear, 'waves.climate.startYear'),
    endYear: num(o.endYear, 'waves.climate.endYear'),
    hours: num(o.hours, 'waves.climate.hours'),
    fetchedOn: str(o.fetchedOn, 'waves.climate.fetchedOn'),
    averagingS: num(o.averagingS, 'waves.climate.averagingS'),
    sectors,
  };
}

/** Extension (D23). Missing values take their defaults, so older files stay readable. */
function anchoring(v: unknown): AnchoringParams {
  if (v === undefined) return structuredClone(DEFAULT_ANCHORING);
  const o = obj(v, 'anchoring');
  const d = DEFAULT_ANCHORING;
  const pick = (key: Exclude<keyof AnchoringParams, 'seabed' | 'friction' | 'anchorType' | 'buoySinkerMethod' | 'buoyTable' | 'buoyExposed' | 'normalHighWater' | 'normalLowWater'>): number =>
    o[key] === undefined ? d[key] : num(o[key], `anchoring.${key}`);
  const f = o.friction === undefined ? {} : obj(o.friction, 'anchoring.friction');
  const mu = (k: Seabed) => (f[k] === undefined ? d.friction[k] : num(f[k], `anchoring.friction.${k}`));
  const result: AnchoringParams = {
    depth: pick('depth'),
    highWater: pick('highWater'),
    lowWater: pick('lowWater'),
    // D50: missing in older files (not known).
    normalHighWater: o.normalHighWater === undefined || o.normalHighWater === null ? null : num(o.normalHighWater, 'anchoring.normalHighWater'),
    normalLowWater: o.normalLowWater === undefined || o.normalLowWater === null ? null : num(o.normalLowWater, 'anchoring.normalLowWater'),
    seabed: o.seabed === undefined ? d.seabed : oneOf(o.seabed, ['clay', 'sand', 'rock'] as const, 'anchoring.seabed'),
    windSpeed: pick('windSpeed'),
    airDensity: pick('airDensity'),
    dragCoefficient: pick('dragCoefficient'),
    leewardFactor: pick('leewardFactor'),
    profileHeightRatio: pick('profileHeightRatio'),
    pontoonFreeboard: pick('pontoonFreeboard'),
    lineSpacing: pick('lineSpacing'),
    splayAngle: pick('splayAngle'),
    chainSafetyFactor: pick('chainSafetyFactor'),
    corrosionAllowance: pick('corrosionAllowance'),
    slidingSafetyFactor: pick('slidingSafetyFactor'),
    friction: { clay: mu('clay'), sand: mu('sand'), rock: mu('rock') },
    chainLengthFactor: pick('chainLengthFactor'),
    maxAnchorMass: pick('maxAnchorMass'),
    tipAnchorMinLength: pick('tipAnchorMinLength'),
    fingerPileMinLength: pick('fingerPileMinLength'),
    anchorType: o.anchorType === undefined ? d.anchorType : oneOf(o.anchorType, ['block', 'wedge'] as const, 'anchoring.anchorType'),
    buoySinkerMethod:
      o.buoySinkerMethod === undefined ? d.buoySinkerMethod : oneOf(o.buoySinkerMethod, ['factor', 'table'] as const, 'anchoring.buoySinkerMethod'),
    buoyTable: o.buoyTable === undefined ? d.buoyTable : oneOf(o.buoyTable, ['batunionen', 'topMarine'] as const, 'anchoring.buoyTable'),
    buoyExposed: o.buoyExposed === undefined ? d.buoyExposed : bool(o.buoyExposed, 'anchoring.buoyExposed'),
    buoySinkerFactor: pick('buoySinkerFactor'),
    buoyChainFactor: pick('buoyChainFactor'),
    buoyLift: pick('buoyLift'),
    waterDensity: pick('waterDensity'),
    concreteDensity: pick('concreteDensity'),
    steelDensity: pick('steelDensity'),
  };
  if (result.depth <= 0) fail('anchoring.depth must be positive');
  if (result.lineSpacing <= 0) fail('anchoring.lineSpacing must be positive');
  if (result.splayAngle < 0 || result.splayAngle > MAX_SPLAY_ANGLE) fail(`anchoring.splayAngle must be between 0 and ${MAX_SPLAY_ANGLE}`);
  if (result.maxAnchorMass <= 0) fail('anchoring.maxAnchorMass must be positive');
  if (result.tipAnchorMinLength < 0) fail('anchoring.tipAnchorMinLength must not be negative');
  if (result.fingerPileMinLength < 0) fail('anchoring.fingerPileMinLength must not be negative');
  if (Object.values(result.friction).some((x) => x <= 0)) fail('anchoring.friction values must be positive');
  if (result.buoySinkerFactor <= 0) fail('anchoring.buoySinkerFactor must be positive');
  if (result.buoyChainFactor <= 0) fail('anchoring.buoyChainFactor must be positive');
  if (result.buoyLift < 0) fail('anchoring.buoyLift must not be negative');
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
  const series = (k: 'pontoonSeries' | 'fingerSeries' | 'boomSeries' | 'gangwaySeries') => (o[k] === undefined ? '' : str(o[k], `cost.${k}`));
  return {
    priceList: priceList(o.priceList),
    pontoonSeries: series('pontoonSeries'),
    fingerSeries: series('fingerSeries'),
    boomSeries: series('boomSeries'),
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
      waves: waveSettings(p.waves),
      waterLevels: p.waterLevels === undefined || p.waterLevels === null ? null : waterLevelInfo(p.waterLevels),
      generatedFrom: typeof p.generatedFrom === 'string' ? p.generatedFrom : null,
    };
    return { ok: true, project };
  } catch (error) {
    if (error instanceof InvalidFile) return { ok: false, error: `${error.message}.` };
    throw error;
  }
}
