/**
 * Planar geometry in local metres. Pure functions, no DOM.
 *
 * All measurement in this project goes through this module so that the geometry
 * library is an implementation detail (DECISIONS I1).
 */
import type { Polygon, Polyline, Vec2 } from './model';

/** Tolerance for "touching"/"equal" comparisons, m (SPEC §6: 1 cm). */
export const EPS = 0.01;

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Round to millimetres. Keeps generated coordinates stable and JSON output compact. */
export const roundMm = (v: number): number => {
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? 0 : r; // avoid -0
};
export const roundVec = (a: Vec2): Vec2 => ({ x: roundMm(a.x), y: roundMm(a.y) });

// ---------------------------------------------------------------------------
// Rings
// ---------------------------------------------------------------------------

/** Signed area by the shoelace formula: positive for counter-clockwise rings. */
export function signedArea(ring: Polygon): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

export const polygonArea = (ring: Polygon): number => Math.abs(signedArea(ring));
export const isCounterClockwise = (ring: Polygon): boolean => signedArea(ring) > 0;

/** Return the ring in counter-clockwise order (a copy when it has to be reversed). */
export const ensureCounterClockwise = (ring: Polygon): Polygon =>
  isCounterClockwise(ring) ? ring : [...ring].reverse();

export function polylineLength(line: Polyline): number {
  let sum = 0;
  for (let i = 0; i + 1 < line.length; i++) sum += distance(line[i]!, line[i + 1]!);
  return sum;
}

/** Shortest distance from point `p` to the segment `a`–`b`. */
export function distancePointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return distance(p, add(a, scale(ab, t)));
}

/** Shortest distance from `p` to the boundary of a closed ring. */
export function distancePointToRing(p: Vec2, ring: Polygon): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    best = Math.min(best, distancePointToSegment(p, ring[i]!, ring[(i + 1) % ring.length]!));
  }
  return best;
}

/** Shortest distance from `p` to an open polyline. */
export function distancePointToPolyline(p: Vec2, line: Polyline): number {
  if (line.length === 1) return distance(p, line[0]!);
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    best = Math.min(best, distancePointToSegment(p, line[i]!, line[i + 1]!));
  }
  return best;
}

/**
 * Regular polygon that fully CONTAINS the circle (vertices lie outside the circle,
 * edge midpoints touch it). Used for round obstacles so the approximation is never
 * smaller than the real object.
 */
export function circumscribedCirclePolygon(centre: Vec2, radius: number, sides = 16): Polygon {
  const r = radius / Math.cos(Math.PI / sides);
  const ring: Polygon = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides;
    ring.push(roundVec({ x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) }));
  }
  return ring;
}
