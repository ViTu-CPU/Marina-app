/**
 * Site preparation and pier placement (SPEC §5.1, §5.4).
 */
import {
  add,
  boundingBox,
  boxPolygon,
  clipSegmentToRegion,
  convexInsideRegion,
  distance,
  distancePointToPolyline,
  dot,
  EPS,
  intersectIntervals,
  regionArea,
  regionFromPolygon,
  scale,
  type Region,
} from './geometry';
import { bufferRegion, differenceRegions, unionRegions } from './geometryOps';
import type { Params, Polygon, Site, Vec2, ZoneKind } from './model';

/**
 * How close the shore end of a pier must be to the shoreline to count as connected, m.
 * Assumption: covers drawing inaccuracy and oblique shore edges.
 */
export const SHORE_TOLERANCE = 0.5;

export interface PreparedSite {
  site: Site;
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
}

export function prepareSite(site: Site, params: Pick<Params, 'obstacleClearance'>): PreparedSite {
  const water = regionFromPolygon(site.water);
  const obstacleBuffer = unionRegions(
    site.obstacles.map((o) => bufferRegion(regionFromPolygon(o.shape), params.obstacleClearance)),
  );
  const zoneRegion = (kind: ZoneKind): Region =>
    unionRegions(site.zones.filter((z) => z.kind === kind).map((z) => regionFromPolygon(z.shape)));
  const zones: Record<ZoneKind, Region> = {
    noStructures: zoneRegion('noStructures'),
    noNavigation: zoneRegion('noNavigation'),
    protected: zoneRegion('protected'),
  };
  const withoutObstacles = differenceRegions(differenceRegions(water, obstacleBuffer), zones.protected);
  const obstacles = unionRegions(site.obstacles.map((o) => regionFromPolygon(o.shape)));
  return {
    site,
    water,
    waterArea: regionArea(water),
    openWaterArea: regionArea(differenceRegions(water, obstacles)),
    obstacleBuffer,
    zones,
    structureRegion: differenceRegions(withoutObstacles, zones.noStructures),
    navigableRegion: differenceRegions(withoutObstacles, zones.noNavigation),
  };
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
  const { site, structureRegion } = prepared;
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

  const touchesShore = (t: number): boolean => {
    // An oblique shore touches only one corner of the square pier end, so test across the width.
    for (const lateral of [0, options.width / 2, -options.width / 2]) {
      const p = add(add(base, scale(dir, t)), scale(left, lateral));
      if (distancePointToPolyline(p, site.shoreline) <= SHORE_TOLERANCE) return true;
    }
    return false;
  };

  const piers: PierSegment[] = [];
  for (const [t0, t1] of intervals ?? []) {
    const fromStart = touchesShore(t0);
    if (!fromStart && !touchesShore(t1)) continue;
    if (report) {
      report.shoreRuns++;
      report.longestShoreRun = Math.max(report.longestShoreRun, t1 - t0);
    }
    const usable = Math.min(options.maxLength, t1 - t0 - options.headClearance);
    if (usable < options.minLength || usable <= 0) continue;
    const startT = fromStart ? t0 : t1;
    const endT = fromStart ? t0 + usable : t1 - usable;
    const start = add(base, scale(dir, startT));
    const end = add(base, scale(dir, endT));
    // The three lines can miss a boundary spike narrower than half the pier: verify the rectangle.
    if (!convexInsideRegion(pierPolygon(start, end, options.width), structureRegion)) continue;
    piers.push({ start, end });
  }
  return piers;
}
