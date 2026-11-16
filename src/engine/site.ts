/**
 * Site preparation and pier placement (SPEC §5.1, §5.4).
 */
import {
  add,
  boundingBox,
  boxPolygon,
  clipSegmentToRegion,
  closestPointOnPolyline,
  convexInsideRegion,
  distance,
  distancePointToPolyline,
  dot,
  EPS,
  intersectIntervals,
  regionArea,
  regionFromPolygon,
  scale,
  sub,
  type Region,
} from './geometry';
import { bufferRegion, differenceRegions, unionRegions } from './geometryOps';
import { breakwaterProductOf, breakwatersOf } from './breakwater';
import type { AccessPontoon, Params, Polygon, Polyline, Site, Vec2, ZoneKind } from './model';

/**
 * How close the shore end of a pier must be to the shoreline to count as connected, m.
 * Assumption: covers drawing inaccuracy and oblique shore edges.
 */
export const SHORE_TOLERANCE = 0.5;

/** The site's access pontoons (D21) that have a length and a width. */
export const accessPontoonsOf = (site: Site): AccessPontoon[] =>
  (site.accessPontoons ?? []).filter((p) => p.width > 0 && distance(p.start, p.end) > EPS);

/**
 * Gangway positions of an access pontoon along its centreline from `start`, m (D32): the
 * given ones, clamped to the pontoon, sorted and unique; its middle when none are given.
 */
export function gangwayPositions(p: AccessPontoon): number[] {
  const length = distance(p.start, p.end);
  const given = (p.gangways ?? []).filter((t) => Number.isFinite(t)).map((t) => Math.min(length, Math.max(0, t)));
  return given.length > 0 ? [...new Set(given)].sort((a, b) => a - b) : [length / 2];
}

/**
 * Each gangway of an access pontoon (D32) as the shortest link from the pontoon's edge facing
 * the shore to the shoreline: from, to and its length (the gap), m. Empty without a shoreline.
 */
export function gangwayLinks(p: AccessPontoon, shoreline: Polyline): { t: number; centre: Vec2; from: Vec2; to: Vec2; gap: number }[] {
  const length = distance(p.start, p.end);
  if (shoreline.length < 2 || !(length > 0)) return [];
  const along = scale(sub(p.end, p.start), 1 / length);
  const left = { x: -along.y, y: along.x };
  return gangwayPositions(p).map((t) => {
    const centre = add(p.start, scale(along, t));
    const edges = [add(centre, scale(left, p.width / 2)), add(centre, scale(left, -p.width / 2))];
    const from = distancePointToPolyline(edges[0]!, shoreline) <= distancePointToPolyline(edges[1]!, shoreline) ? edges[0]! : edges[1]!;
    const to = closestPointOnPolyline(from, shoreline);
    return { t, centre, from, to, gap: distance(from, to) };
  });
}

/**
 * Lines a main pier may start from: the shoreline and both long edges of every access
 * pontoon (D21).
 */
export function connectionLines(site: Site): Polyline[] {
  const lines: Polyline[] = site.shoreline.length >= 2 ? [site.shoreline] : [];
  for (const p of accessPontoonsOf(site)) {
    const [a, b, c, d] = pierPolygon(p.start, p.end, p.width);
    lines.push([a!, b!], [d!, c!]);
  }
  return lines;
}

/** Distance from a point to the nearest line a pier may start from, m. */
export function distanceToConnection(lines: Polyline[], p: Vec2): number {
  let best = Infinity;
  for (const line of lines) best = Math.min(best, distancePointToPolyline(p, line));
  return best;
}

export interface PreparedSite {
  site: Site;
  /** See `connectionLines`. */
  connectionLines: Polyline[];
  /** Union of the access pontoons (D21); no other structure or boat may use it. */
  accessRegion: Region;
  water: Region;
  /** Area of the water polygon, m². */
  waterArea: number;
  /** Water area less the obstacles themselves (without clearance), m². */
  openWaterArea: number;
  /** Union of all obstacles grown by `obstacleClearance`. */
  obstacleBuffer: Region;
  /** Union of the zones of each kind. */
  zones: Record<ZoneKind, Region>;
  /**
   * Where structures (piers, fingers) may be built — the "feasible region" of SPEC §5.1:
   * water − obstacle buffers − noStructures zones − protected zones.
   */
  structureRegion: Region;
  /**
   * Where boats may lie and move (berth slots, fairways):
   * water − obstacle buffers − noNavigation zones − protected zones.
   */
  navigableRegion: Region;
  /** D49: longest gap a pier's shore gangway can span, m (`Params.gangwayLength`). */
  gangwayReach: number;
}

export function prepareSite(site: Site, params: Pick<Params, 'obstacleClearance'> & Partial<Pick<Params, 'gangwayLength'>>): PreparedSite {
  const water = regionFromPolygon(site.water);
  // D58: breakwaters are kept clear of like obstacles (piers, boats and fairways).
  const shapes = [...site.obstacles.map((o) => o.shape), ...breakwatersOf(site).map((b) => pierPolygon(b.start, b.end, breakwaterProductOf(b).width))];
  const obstacleBuffer = unionRegions(shapes.map((shape) => bufferRegion(regionFromPolygon(shape), params.obstacleClearance)));
  const zoneRegion = (kind: ZoneKind): Region =>
    unionRegions(site.zones.filter((z) => z.kind === kind).map((z) => regionFromPolygon(z.shape)));
  const zones: Record<ZoneKind, Region> = {
    noStructures: zoneRegion('noStructures'),
    noNavigation: zoneRegion('noNavigation'),
    protected: zoneRegion('protected'),
  };
  const accessRegion = unionRegions(
    accessPontoonsOf(site).map((p) => regionFromPolygon(pierPolygon(p.start, p.end, p.width))),
  );
  const withoutObstacles = differenceRegions(
    differenceRegions(differenceRegions(water, obstacleBuffer), zones.protected),
    accessRegion,
  );
  const obstacles = unionRegions(shapes.map((shape) => regionFromPolygon(shape)));
  return {
    site,
    connectionLines: connectionLines(site),
    accessRegion,
    water,
    waterArea: regionArea(water),
    openWaterArea: regionArea(differenceRegions(water, obstacles)),
    obstacleBuffer,
    zones,
    structureRegion: differenceRegions(withoutObstacles, zones.noStructures),
    navigableRegion: differenceRegions(withoutObstacles, zones.noNavigation),
    gangwayReach: params.gangwayLength ?? DEFAULT_GANGWAY_LENGTH,
  };
}

/** D49: default gangway from the shore to a pier, m (owner: *"gangway 6m, pier 4m off from the shore wall"*). */
export const DEFAULT_GANGWAY_LENGTH = 6;

/** D49: how a pier reaches land: straight from an access pontoon, or by a gangway over `gap` m from the shoreline. */
export interface PierShoreLink {
  kind: 'access' | 'gangway';
  /** Middle of the pier's shore end, and the nearest point of the shoreline (= `from` for 'access'). */
  from: Vec2;
  to: Vec2;
  /** Water between the pier end and the shoreline, m. */
  gap: number;
}

/**
 * The pier's connection to land (D49): 'access' when its shore end lies on an access pontoon's edge
 * (I5 tolerance); 'gangway' when the shoreline is within `reach` m of its shore end (tested at the
 * middle and both corners); null otherwise.
 */
export function pierShoreLink(pier: { start: Vec2; end: Vec2; width: number }, site: Site, reach: number): PierShoreLink | null {
  const length = distance(pier.start, pier.end);
  if (!(length > 0)) return null;
  const along = scale(sub(pier.end, pier.start), 1 / length);
  const left = { x: -along.y, y: along.x };
  const ends = [0, pier.width / 2, -pier.width / 2].map((l) => add(pier.start, scale(left, l)));
  const accessEdges = connectionLines({ ...site, shoreline: [] });
  if (ends.some((p) => distanceToConnection(accessEdges, p) <= SHORE_TOLERANCE)) return { kind: 'access', from: pier.start, to: pier.start, gap: 0 };
  if (site.shoreline.length < 2) return null;
  const gap = Math.min(...ends.map((p) => distancePointToPolyline(p, site.shoreline)));
  if (gap > reach + SHORE_TOLERANCE) return null;
  return { kind: 'gangway', from: pier.start, to: closestPointOnPolyline(pier.start, site.shoreline), gap };
}

export interface PierSegment {
  /** Shore end of the centreline. */
  start: Vec2;
  /** Head end of the centreline. */
  end: Vec2;
}

export function pierPolygon(start: Vec2, end: Vec2, width: number): Polygon {
  const len = distance(start, end);
  const along = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };
  const left = { x: -along.y, y: along.x };
  const h = width / 2;
  return [
    add(start, scale(left, -h)),
    add(end, scale(left, -h)),
    add(end, scale(left, h)),
    add(start, scale(left, h)),
  ];
}

/** Counters filled in by `placePiersOnLine`, used for diagnostics when nothing fits. */
export interface PlacementReport {
  /** Stretches of buildable water that touch the shoreline. */
  shoreRuns: number;
  /** Longest such stretch, m. */
  longestShoreRun: number;
}

export interface PierPlacementOptions {
  width: number;
  /** D49: water left between the shoreline and the pier's shore end (bridged by a gangway), m; none from an access pontoon. */
  shoreGap?: number;
  maxLength: number;
  /** Water kept free beyond the pier head so boats can pass around it, m. */
  headClearance: number;
  /** Piers shorter than this are dropped (SPEC §5.4: shorter than one bay). */
  minLength: number;
}

/**
 * Shore-connected piers on the infinite line through `base` with unit direction `dir`
 * (SPEC §5.4). The pier's full width must fit inside the structure region; the pier starts
 * at the shoreline and runs until the region ends, less the head clearance, capped at
 * the maximum length. A stretch of line may be reached from either end, so the returned
 * piers can point along `dir` or against it.
 */
export function placePiersOnLine(
  prepared: PreparedSite,
  base: Vec2,
  dir: Vec2,
  options: PierPlacementOptions,
  report?: PlacementReport,
): PierSegment[] {
  const { site, structureRegion, connectionLines: lines } = prepared;
  const left = { x: -dir.y, y: dir.x };

  // Extent of the site along the line, in metres from `base`.
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const corner of boxPolygon(boundingBox(site.water))) {
    const t = dot({ x: corner.x - base.x, y: corner.y - base.y }, dir);
    tMin = Math.min(tMin, t);
    tMax = Math.max(tMax, t);
  }
  tMin -= 1;
  tMax += 1;
  const span = tMax - tMin;

  // The centreline and both edges (pulled in by the tolerance) must be inside the region.
  let intervals: [number, number][] | null = null;
  for (const lateral of [0, options.width / 2 - EPS, -(options.width / 2 - EPS)]) {
    const origin = add(base, scale(left, lateral));
    const a = add(origin, scale(dir, tMin));
    const b = add(origin, scale(dir, tMax));
    const clipped = clipSegmentToRegion(a, b, structureRegion).map(
      ([t0, t1]): [number, number] => [tMin + t0 * span, tMin + t1 * span],
    );
    intervals = intervals === null ? clipped : intersectIntervals(intervals, clipped);
  }

  const touchesLines = (t: number, which: Polyline[]): boolean => {
    // An oblique shore touches only one corner of the square pier end, so test across the width.
    for (const lateral of [0, options.width / 2, -options.width / 2]) {
      const p = add(add(base, scale(dir, t)), scale(left, lateral));
      if (distanceToConnection(which, p) <= SHORE_TOLERANCE) return true;
    }
    return false;
  };
  const touchesShore = (t: number): boolean => touchesLines(t, lines);
  // D49: a pier starting from the shoreline (not from an access pontoon) keeps the gangway gap.
  const accessEdges = lines.filter((l) => l !== site.shoreline);
  const gapAt = (t: number): number => (touchesLines(t, accessEdges) ? 0 : Math.max(0, options.shoreGap ?? 0));

  const piers: PierSegment[] = [];
  for (const [t0, t1] of intervals ?? []) {
    const fromStart = touchesShore(t0);
    if (!fromStart && !touchesShore(t1)) continue;
    if (report) {
      report.shoreRuns++;
      report.longestShoreRun = Math.max(report.longestShoreRun, t1 - t0);
    }
    const gap = gapAt(fromStart ? t0 : t1);
    const usable = Math.min(options.maxLength, t1 - t0 - options.headClearance - gap);
    if (usable < options.minLength || usable <= 0) continue;
    const startT = fromStart ? t0 + gap : t1 - gap;
    const endT = fromStart ? startT + usable : startT - usable;
    const start = add(base, scale(dir, startT));
    const end = add(base, scale(dir, endT));
    // The three lines can miss a boundary spike narrower than half the pier: verify the rectangle.
    if (!convexInsideRegion(pierPolygon(start, end, options.width), structureRegion)) continue;
    piers.push({ start, end });
  }
  return piers;
}
