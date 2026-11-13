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

// ---------------------------------------------------------------------------
// Angles and rotation
// ---------------------------------------------------------------------------

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Unit vector for a bearing given in degrees clockwise from north (north = +y). */
export function bearingToVector(bearingDeg: number): Vec2 {
  const r = degToRad(bearingDeg);
  return { x: Math.sin(r), y: Math.cos(r) };
}

/** Bearing in degrees clockwise from north, in [0, 360). */
export function vectorToBearing(v: Vec2): number {
  const deg = radToDeg(Math.atan2(v.x, v.y));
  return (deg + 360) % 360;
}

/** Rotate counter-clockwise by `angleRad` about the origin. */
export function rotate(p: Vec2, angleRad: number): Vec2 {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export const rotatePolygon = (ring: Vec2[], angleRad: number): Vec2[] =>
  ring.map((p) => rotate(p, angleRad));

// ---------------------------------------------------------------------------
// Boxes
// ---------------------------------------------------------------------------

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundingBox(points: Vec2[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const boxesOverlap = (a: Box, b: Box, margin = 0): boolean =>
  a.minX <= b.maxX + margin &&
  b.minX <= a.maxX + margin &&
  a.minY <= b.maxY + margin &&
  b.minY <= a.maxY + margin;

/** Axis-aligned rectangle as a counter-clockwise ring. */
export const boxPolygon = (b: Box): Polygon => [
  { x: b.minX, y: b.minY },
  { x: b.maxX, y: b.minY },
  { x: b.maxX, y: b.maxY },
  { x: b.minX, y: b.maxY },
];

/**
 * Oriented rectangle as a counter-clockwise ring.
 * `origin` is the corner from which `along` (unit vector) spans `lengthAlong` and the
 * left-hand normal of `along` spans `widthLeft`.
 */
export function orientedRect(origin: Vec2, along: Vec2, lengthAlong: number, widthLeft: number): Polygon {
  const left = { x: -along.y, y: along.x };
  const p1 = add(origin, scale(along, lengthAlong));
  const ring = [origin, p1, add(p1, scale(left, widthLeft)), add(origin, scale(left, widthLeft))];
  return ensureCounterClockwise(ring);
}

export function centroid(points: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/** Ray-casting point-in-ring test. Points exactly on the boundary may return either value. */
export function pointInRing(p: Vec2, ring: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Intersection of segments a–b and c–d. Returns the parameter t ∈ [0, 1] along a–b,
 * or null when they do not intersect. Parallel and collinear segments return null.
 */
export function segmentIntersectionParam(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (denom === 0) return null;
  const ac = sub(c, a);
  const t = cross(ac, s) / denom;
  const u = cross(ac, r) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

/**
 * Shrink a convex counter-clockwise polygon by moving every edge inwards by `d`.
 * Used to apply the 1 cm tolerance: shapes that merely touch do not count as overlapping.
 */
export function insetConvexPolygon(ring: Polygon, d: number): Polygon {
  const n = ring.length;
  const out: Polygon = [];
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n]!;
    const cur = ring[i]!;
    const next = ring[(i + 1) % n]!;
    const e1 = sub(cur, prev);
    const e2 = sub(next, cur);
    const l1 = length(e1);
    const l2 = length(e2);
    // Inward (left-hand) unit normals of the two edges meeting at `cur`.
    const n1 = { x: -e1.y / l1, y: e1.x / l1 };
    const n2 = { x: -e2.y / l2, y: e2.x / l2 };
    const k = d / (1 + dot(n1, n2));
    out.push({ x: cur.x + (n1.x + n2.x) * k, y: cur.y + (n1.y + n2.y) * k });
  }
  return out;
}

/**
 * Penetration depth of two convex polygons by the separating-axis test:
 * the smallest overlap over all edge normals. ≤ 0 means separated or touching.
 */
export function convexOverlapDepth(a: Polygon, b: Polygon): number {
  let minOverlap = Infinity;
  for (const ring of [a, b]) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const len = distance(p, q);
      if (len === 0) continue;
      const axis = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const v of a) {
        const s = dot(v, axis);
        if (s < minA) minA = s;
        if (s > maxA) maxA = s;
      }
      for (const v of b) {
        const s = dot(v, axis);
        if (s < minB) minB = s;
        if (s > maxB) maxB = s;
      }
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap < minOverlap) minOverlap = overlap;
      if (minOverlap <= 0) return minOverlap;
    }
  }
  return minOverlap;
}

/** True when two convex polygons overlap by more than `tolerance` (default 1 cm). */
export const convexPolygonsOverlap = (a: Polygon, b: Polygon, tolerance = EPS): boolean =>
  convexOverlapDepth(a, b) > tolerance;

// ---------------------------------------------------------------------------
// Regions: sets of polygons with holes
// ---------------------------------------------------------------------------

export interface PolygonWithHoles {
  /** Counter-clockwise outer ring. */
  outer: Polygon;
  /** Clockwise hole rings. */
  holes: Polygon[];
}

/** A (possibly empty, possibly multi-part) area. Parts do not overlap. */
export type Region = PolygonWithHoles[];

export const regionFromPolygon = (ring: Polygon): Region => [
  { outer: ensureCounterClockwise(ring), holes: [] },
];

export function regionArea(region: Region): number {
  let sum = 0;
  for (const part of region) {
    sum += polygonArea(part.outer);
    for (const h of part.holes) sum -= polygonArea(h);
  }
  return sum;
}

export const pointInPart = (p: Vec2, part: PolygonWithHoles): boolean =>
  pointInRing(p, part.outer) && !part.holes.some((h) => pointInRing(p, h));

export const pointInRegion = (p: Vec2, region: Region): boolean =>
  region.some((part) => pointInPart(p, part));

export const rotateRegion = (region: Region, angleRad: number): Region =>
  region.map((part) => ({
    outer: rotatePolygon(part.outer, angleRad),
    holes: part.holes.map((h) => rotatePolygon(h, angleRad)),
  }));

function ringCrossesPolygon(ring: Polygon, poly: Polygon, polyBox: Box): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (
      Math.max(a.x, b.x) < polyBox.minX ||
      Math.min(a.x, b.x) > polyBox.maxX ||
      Math.max(a.y, b.y) < polyBox.minY ||
      Math.min(a.y, b.y) > polyBox.maxY
    ) {
      continue;
    }
    for (let j = 0; j < poly.length; j++) {
      if (segmentIntersectionParam(a, b, poly[j]!, poly[(j + 1) % poly.length]!) !== null) return true;
    }
  }
  return false;
}

/**
 * True when the convex polygon lies inside the region, allowing it to touch or cross
 * the region boundary by up to `tolerance`.
 */
export function convexInsideRegion(poly: Polygon, region: Region, tolerance = EPS): boolean {
  const p = tolerance > 0 ? insetConvexPolygon(poly, tolerance) : poly;
  const box = boundingBox(p);
  const part = region.find((candidate) => pointInPart(p[0]!, candidate));
  if (!part) return false;
  for (const v of p) if (!pointInPart(v, part)) return false;
  if (ringCrossesPolygon(part.outer, p, box)) return false;
  for (const hole of part.holes) {
    if (ringCrossesPolygon(hole, p, box)) return false;
    // No crossing: the hole is either entirely inside the polygon or entirely outside it.
    if (pointInRing(hole[0]!, p)) return false;
  }
  return true;
}

/**
 * True when the convex polygon overlaps the region by more than `tolerance`
 * (touching the boundary does not count).
 */
export function convexIntersectsRegion(poly: Polygon, region: Region, tolerance = EPS): boolean {
  const p = tolerance > 0 ? insetConvexPolygon(poly, tolerance) : poly;
  const box = boundingBox(p);
  for (const part of region) {
    if (!boxesOverlap(box, boundingBox(part.outer))) continue;
    if (p.some((v) => pointInPart(v, part))) return true;
    if (ringCrossesPolygon(part.outer, p, box)) return true;
    for (const hole of part.holes) if (ringCrossesPolygon(hole, p, box)) return true;
    // No vertex inside and no crossing: the polygon overlaps only if it swallows the part.
    if (pointInRing(part.outer[0]!, p)) return true;
  }
  return false;
}

/**
 * Parts of the segment a–b that lie inside the region, as sorted parameter intervals
 * [t0, t1] with 0 ≤ t0 < t1 ≤ 1.
 */
export function clipSegmentToRegion(a: Vec2, b: Vec2, region: Region): [number, number][] {
  const cuts = [0, 1];
  for (const part of region) {
    for (const ring of [part.outer, ...part.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const t = segmentIntersectionParam(a, b, ring[i]!, ring[(i + 1) % ring.length]!);
        if (t !== null) cuts.push(t);
      }
    }
  }
  cuts.sort((x, y) => x - y);
  const d = sub(b, a);
  const intervals: [number, number][] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const t0 = cuts[i]!;
    const t1 = cuts[i + 1]!;
    if (t1 - t0 < 1e-12) continue;
    const mid = add(a, scale(d, (t0 + t1) / 2));
    if (!pointInRegion(mid, region)) continue;
    const last = intervals[intervals.length - 1];
    if (last && Math.abs(last[1] - t0) < 1e-12) last[1] = t1;
    else intervals.push([t0, t1]);
  }
  return intervals;
}
