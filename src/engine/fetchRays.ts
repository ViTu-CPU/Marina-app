/**
 * Fetch by direction from a shoreline (DECISIONS D47, I94): rays from the site every few degrees
 * to the first shoreline they cross, and the fetch of each 45° wave sector from them. Pure
 * geometry in local metres with the site at the origin; the shoreline comes from OpenStreetMap
 * (src/state/overpass.ts).
 */
import type { Segment, Vec2 } from './model';
import { WAVE_SECTOR_DEG, WAVE_SECTORS } from './waves';

/** Angle between rays, degrees. */
export const RAY_STEP_DEG = 5;
/** Crossings nearer than this to the site are ignored (the site's own quay or pontoon edge), m. */
export const MIN_RAY_DISTANCE = 1;

/** Distance from the origin along the unit direction `d` to segment a–b, or null when the ray misses it. */
export function rayHit(d: Vec2, a: Vec2, b: Vec2): number | null {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return null;
  // Origin + t·d = a + u·e.
  const t = (a.x * ey - a.y * ex) / den;
  const u = (a.x * d.y - a.y * d.x) / den;
  return t >= 0 && u >= -1e-12 && u <= 1 + 1e-12 ? t : null;
}

/**
 * Distance along each ray (bearings 0, step, 2·step, … degrees clockwise from north) to the
 * nearest segment beyond `minDistance`; `maxDistance` when none is crossed within it.
 */
export function castRays(segments: readonly Segment[], maxDistance: number, stepDeg = RAY_STEP_DEG, minDistance = MIN_RAY_DISTANCE): number[] {
  const n = Math.round(360 / stepDeg);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = ((i * stepDeg) * Math.PI) / 180;
    const d = { x: Math.sin(r), y: Math.cos(r) };
    let best = maxDistance;
    for (const s of segments) {
      const t = rayHit(d, s.a, s.b);
      if (t !== null && t >= minDistance && t < best) best = t;
    }
    out.push(best);
  }
  return out;
}

export interface SectorFetch {
  /** Longest straight-line fetch of the rays inside the sector, m. */
  fetch: number;
  /** Bearing of that ray, degrees. */
  bearing: number;
  /** The ray reached the search radius: the fetch is at least this long. */
  open: boolean;
}

/**
 * Fetch of each 45° sector: the longest of the rays strictly inside it (for 5° rays: the centre
 * and ±5 … ±20°). Conservative: wind from anywhere in the sector can blow along that ray (I94).
 */
export function sectorFetches(distances: readonly number[], maxDistance: number, stepDeg = RAY_STEP_DEG): SectorFetch[] {
  const half = WAVE_SECTOR_DEG / 2;
  return WAVE_SECTORS.map((_, k) => {
    let best: SectorFetch = { fetch: 0, bearing: k * WAVE_SECTOR_DEG, open: false };
    distances.forEach((dist, i) => {
      const bearing = i * stepDeg;
      const off = Math.abs(((bearing - k * WAVE_SECTOR_DEG + 540) % 360) - 180);
      if (off < half - 1e-9 && dist > best.fetch) best = { fetch: dist, bearing, open: dist >= maxDistance - 1e-6 };
    });
    return best;
  });
}
