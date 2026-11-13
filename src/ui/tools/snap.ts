/**
 * Snapping of the cursor to existing geometry while drawing and editing (SPEC §8).
 */
import { add, distance, dot, scale, sub } from '../../engine/geometry';
import type { Site, Vec2 } from '../../engine/model';

export interface SnapResult {
  point: Vec2;
  kind: 'vertex' | 'edge' | 'none';
}

export interface SnapTargets {
  vertices: Vec2[];
  /** Segments whose nearest point can be snapped to (used for the water boundary). */
  edges: [Vec2, Vec2][];
}

/**
 * Snap `cursor` to the nearest vertex within `tolerance` (world metres); failing that, to
 * the nearest point on an edge within the tolerance. Vertices win over edges.
 */
export function snapPoint(cursor: Vec2, targets: SnapTargets, tolerance: number): SnapResult {
  let best: Vec2 | null = null;
  let bestDistance = tolerance;
  for (const v of targets.vertices) {
    const d = distance(cursor, v);
    if (d <= bestDistance) {
      best = v;
      bestDistance = d;
    }
  }
  if (best) return { point: { x: best.x, y: best.y }, kind: 'vertex' };

  bestDistance = tolerance;
  for (const [a, b] of targets.edges) {
    const ab = sub(b, a);
    const len2 = dot(ab, ab);
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, dot(sub(cursor, a), ab) / len2));
    const p = add(a, scale(ab, t));
    const d = distance(cursor, p);
    if (d <= bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best ? { point: best, kind: 'edge' } : { point: cursor, kind: 'none' };
}

/** All vertices of the site, and the edges of the water boundary. */
export function siteSnapTargets(site: Site, extraVertices: Vec2[] = []): SnapTargets {
  const vertices = [
    ...site.water,
    ...site.shoreline,
    ...site.obstacles.flatMap((o) => o.shape),
    ...site.zones.flatMap((z) => z.shape),
    ...extraVertices,
  ];
  const edges = site.water.map((p, i): [Vec2, Vec2] => [p, site.water[(i + 1) % site.water.length]!]);
  return { vertices, edges };
}

/** True when a click at `point` should close the polygon being drawn. */
export const closesPolygon = (draft: Vec2[], point: Vec2, tolerance: number): boolean =>
  draft.length >= 3 && distance(draft[0]!, point) <= tolerance;
