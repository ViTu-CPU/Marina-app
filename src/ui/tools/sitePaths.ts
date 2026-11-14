/**
 * The editable point lists of a site (SPEC §8: vertex editing), as a uniform list so the
 * canvas can draw handles and apply moves without knowing each object type.
 */
import { ensureCounterClockwise } from '../../engine/geometry';
import type { Site, Vec2 } from '../../engine/model';

export interface SitePath {
  /** Stable key: 'water', 'shoreline', 'entrance', 'access:<id>', 'obstacle:<id>' or 'zone:<id>'. */
  key: string;
  points: Vec2[];
  closed: boolean;
  /** A point can be deleted only while more than this many remain. */
  minPoints: number;
  /** Whether points may be inserted (not for the two-point entrance). */
  canInsert: boolean;
}

export const hasEntrance = (site: Site): boolean =>
  site.entrance.a.x !== site.entrance.b.x || site.entrance.a.y !== site.entrance.b.y;

export function sitePaths(site: Site): SitePath[] {
  const paths: SitePath[] = [];
  if (site.water.length > 0) paths.push({ key: 'water', points: site.water, closed: true, minPoints: 3, canInsert: true });
  if (site.shoreline.length > 0) {
    paths.push({ key: 'shoreline', points: site.shoreline, closed: false, minPoints: 2, canInsert: true });
  }
  if (hasEntrance(site)) {
    paths.push({ key: 'entrance', points: [site.entrance.a, site.entrance.b], closed: false, minPoints: 2, canInsert: false });
  }
  for (const p of site.accessPontoons ?? []) {
    paths.push({ key: `access:${p.id}`, points: [p.start, p.end], closed: false, minPoints: 2, canInsert: false });
  }
  for (const o of site.obstacles) {
    paths.push({ key: `obstacle:${o.id}`, points: o.shape, closed: true, minPoints: 3, canInsert: true });
  }
  for (const z of site.zones) {
    paths.push({ key: `zone:${z.id}`, points: z.shape, closed: true, minPoints: 3, canInsert: true });
  }
  return paths;
}

/**
 * The site with the points of one path replaced, in the given order. Ring orientation is
 * not changed here, so point indices stay valid during a drag; see `normalizeSite`.
 */
export function setPathPoints(site: Site, key: string, points: Vec2[]): Site {
  if (key === 'water') return { ...site, water: points };
  if (key === 'shoreline') return { ...site, shoreline: points };
  if (key === 'entrance') {
    const [a, b] = points;
    return a && b ? { ...site, entrance: { a, b } } : site;
  }
  const [kind, id] = key.split(':');
  if (kind === 'access') {
    const [start, end] = points;
    if (!start || !end) return site;
    return { ...site, accessPontoons: (site.accessPontoons ?? []).map((p) => (p.id === id ? { ...p, start, end } : p)) };
  }
  if (kind === 'obstacle') return { ...site, obstacles: site.obstacles.map((o) => (o.id === id ? { ...o, shape: points } : o)) };
  if (kind === 'zone') return { ...site, zones: site.zones.map((z) => (z.id === id ? { ...z, shape: points } : z)) };
  return site;
}

const findPath = (site: Site, key: string): SitePath | undefined => sitePaths(site).find((p) => p.key === key);

export function moveVertex(site: Site, key: string, index: number, to: Vec2): Site {
  const path = findPath(site, key);
  if (!path || !path.points[index]) return site;
  return setPathPoints(site, key, path.points.map((p, i) => (i === index ? to : p)));
}

/** Insert a point between `index` and the next point. Returns the new point's index. */
export function insertVertex(site: Site, key: string, index: number, point: Vec2): { site: Site; index: number } {
  const path = findPath(site, key);
  if (!path || !path.canInsert) return { site, index };
  const points = [...path.points.slice(0, index + 1), point, ...path.points.slice(index + 1)];
  return { site: setPathPoints(site, key, points), index: index + 1 };
}

/** Delete a point, unless the path would fall below its minimum number of points. */
export function deleteVertex(site: Site, key: string, index: number): Site {
  const path = findPath(site, key);
  if (!path || path.points.length <= path.minPoints) return site;
  return setPathPoints(site, key, path.points.filter((_, i) => i !== index));
}

/** Make every ring counter-clockwise again (a drag may have turned one inside out). */
export function normalizeSite(site: Site): Site {
  const fix = (ring: Vec2[]): Vec2[] => (ring.length >= 3 ? ensureCounterClockwise(ring) : ring);
  const water = fix(site.water);
  const obstacles = site.obstacles.map((o) => {
    const shape = fix(o.shape);
    return shape === o.shape ? o : { ...o, shape };
  });
  const zones = site.zones.map((z) => {
    const shape = fix(z.shape);
    return shape === z.shape ? z : { ...z, shape };
  });
  const unchanged =
    water === site.water && obstacles.every((o, i) => o === site.obstacles[i]) && zones.every((z, i) => z === site.zones[i]);
  return unchanged ? site : { ...site, water, obstacles, zones };
}

/** Remove a whole object: 'water', 'shoreline', 'entrance', 'access:<id>', 'obstacle:<id>' or 'zone:<id>'. */
export function deleteSiteObject(site: Site, key: string): Site {
  if (key === 'water') return { ...site, water: [] };
  if (key === 'shoreline') return { ...site, shoreline: [] };
  if (key === 'entrance') return { ...site, entrance: { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } } };
  const [kind, id] = key.split(':');
  if (kind === 'access') return { ...site, accessPontoons: (site.accessPontoons ?? []).filter((p) => p.id !== id) };
  if (kind === 'obstacle') return { ...site, obstacles: site.obstacles.filter((o) => o.id !== id) };
  if (kind === 'zone') return { ...site, zones: site.zones.filter((z) => z.id !== id) };
  return site;
}
