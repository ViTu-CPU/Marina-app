/**
 * A site from a detailed-plan area (asemakaava) and the water within it (U34). Pure geometry in
 * local metres: the plan area and the water polygons come in already converted from latitude and
 * longitude by the caller; nothing here knows about map services.
 *
 * A plan area usually holds land as well as water, so the planning water area is the plan area
 * ∩ the water. Its holes are islands (obstacles). The shoreline is suggested as the longest run of
 * the water's edge that is not the plan boundary (where the plan boundary cuts the water, the
 * water goes on and there is no shore). All of it is a starting point to be checked and edited.
 */
import { distancePointToRing, ensureCounterClockwise, polygonArea, regionArea, signedArea, type Region } from './geometry';
import { intersectRegions, simplifyRegion, unionRegions } from './geometryOps';
import type { Polygon, Polyline, Vec2 } from './model';

/** GeoJSON-style polygons (outer ring first, then holes; any orientation) as a normalised region. */
export function regionFromPolygons(polygons: readonly (readonly Vec2[][])[]): Region {
  const parts: Region = [];
  for (const rings of polygons) {
    const [outer, ...holes] = rings.map(dropClosingPoint);
    if (!outer || outer.length < 3) continue;
    parts.push({ outer: ensureCounterClockwise(outer), holes: holes.filter((h) => h.length >= 3).map((h) => ensureCounterClockwise(h).reverse()) });
  }
  return parts.length === 0 ? [] : unionRegions(parts.map((p) => [p]));
}

/**
 * Rings of a vector-tile polygon layer (Mapbox Vector Tile 2.1, §4.3.4.4), already turned into
 * local metres with y up. In the tile (y down) exterior rings wind clockwise, so with y up they
 * have a negative signed area; a ring with a positive one is a hole of the exterior before it.
 */
export function regionFromTileRings(rings: readonly Vec2[][]): Region {
  const parts: { outer: Polygon; holes: Polygon[] }[] = [];
  for (const raw of rings) {
    const ring = dropClosingPoint(raw);
    if (ring.length < 3) continue;
    const a = signedArea(ring);
    if (a < 0) parts.push({ outer: [...ring].reverse(), holes: [] });
    else if (a > 0 && parts.length > 0) parts[parts.length - 1]!.holes.push([...ring].reverse());
  }
  return parts.length === 0 ? [] : unionRegions(parts.map((p) => [p]));
}

function dropClosingPoint(ring: readonly Vec2[]): Vec2[] {
  const out = [...ring];
  if (out.length > 1) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (a.x === b.x && a.y === b.y) out.pop();
  }
  return out;
}

export interface PlanSite {
  /** Counter-clockwise water area (the largest part of plan ∩ water). */
  water: Polygon;
  /** Islands inside it, counter-clockwise. */
  islands: Polygon[];
  /** Suggested shoreline: the longest run of the water's edge that is not the plan boundary; empty if none. */
  shoreline: Polyline;
  /** Area of the water area, m², and how many smaller water parts of the plan were left out. */
  area: number;
  otherParts: number;
}

/** Islands smaller than this are left out as noise of the map data (Assumption), m². */
export const MIN_ISLAND_AREA = 4;

/**
 * The planning water area within a plan area. `tolerance` (m): an edge of the water whose middle
 * lies this close to the plan boundary counts as the plan boundary, not as shore; the water is
 * simplified by the same tolerance (map data in vector tiles is itself only about this exact).
 * Null when the plan holds no water.
 */
export function planSite(plan: Region, water: Region, tolerance = 0.5): PlanSite | null {
  const within = simplifyRegion(intersectRegions(plan, water), tolerance);
  if (within.length === 0) return null;
  const parts = [...within].sort((a, b) => polygonArea(b.outer) - polygonArea(a.outer));
  const main = parts[0]!;
  const islands = main.holes.map((h) => ensureCounterClockwise(h)).filter((h) => polygonArea(h) >= MIN_ISLAND_AREA);
  const boundary = plan.flatMap((p) => [p.outer, ...p.holes]);
  const onBoundary = (a: Vec2, b: Vec2) => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return boundary.some((ring) => distancePointToRing(mid, ring) <= tolerance) && boundary.some((ring) => distancePointToRing(a, ring) <= tolerance && distancePointToRing(b, ring) <= tolerance);
  };
  return {
    water: main.outer,
    islands,
    shoreline: longestShoreRun(main.outer, onBoundary),
    area: regionArea([{ outer: main.outer, holes: islands.map((h) => [...h].reverse()) }]),
    otherParts: parts.length - 1,
  };
}

/** The longest run of consecutive ring edges (cyclic) that are not on the plan boundary, as a polyline. */
function longestShoreRun(ring: Polygon, onBoundary: (a: Vec2, b: Vec2) => boolean): Polyline {
  const n = ring.length;
  const shore = ring.map((p, i) => !onBoundary(p, ring[(i + 1) % n]!));
  if (shore.every((x) => x)) return [...ring, ring[0]!];
  if (!shore.some((x) => x)) return [];
  // Start just after a boundary edge so that no run wraps around the end.
  const start = (shore.findIndex((x) => !x) + 1) % n;
  let best: { from: number; edges: number; length: number } | null = null;
  let from = -1;
  let edges = 0;
  let length = 0;
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n;
    if (k < n && shore[i]) {
      if (from < 0) from = i;
      edges++;
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      length += Math.hypot(b.x - a.x, b.y - a.y);
    } else if (from >= 0) {
      if (!best || length > best.length) best = { from, edges, length };
      from = -1;
      edges = 0;
      length = 0;
    }
  }
  if (!best) return [];
  const run = best;
  return Array.from({ length: run.edges + 1 }, (_, k) => ring[(run.from + k) % n]!);
}
