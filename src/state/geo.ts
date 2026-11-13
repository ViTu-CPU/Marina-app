/**
 * Placing Web Mercator map tiles (OpenStreetMap) under the local metric drawing.
 *
 * The drawing stays in local metres (SPEC §3); nothing in the engine uses latitude or
 * longitude. This module only answers "where in local metres does this map tile go?".
 *
 * Web Mercator stretches the map by about 1 / cos(latitude), and by slightly different
 * amounts east–west and north–south because it treats the ellipsoid as a sphere. Around
 * the map origin the true ground size of one Mercator metre is, on the WGS 84 ellipsoid:
 *
 *   east–west:   N·cos φ / a = cos φ / √(1 − e² sin² φ)
 *   north–south: M·cos φ / a = (1 − e²)·cos φ / (1 − e² sin² φ)^1.5
 *
 * (N and M are the prime-vertical and meridian radii of curvature.) Tiles are scaled by
 * these two factors, evaluated at the origin. Over a site of a few hundred metres the
 * factors change by about 0.01 %, i.e. centimetres.
 */
import type { Box } from '../engine/geometry';
import type { Vec2 } from '../engine/model';

/** WGS 84 semi-major axis, m, and first eccentricity squared. */
export const WGS84_A = 6378137;
export const WGS84_E2 = 0.00669437999014;

/** Highest zoom level served by the OpenStreetMap standard tile layer. */
export const MAX_TILE_ZOOM = 19;
export const TILE_PIXELS = 256;
/** Web Mercator is cut off at about ±85.05°. */
const MAX_LATITUDE = 85;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Latitude and longitude (degrees, WGS 84) of the local origin (0, 0). */
export interface GeoOrigin {
  lat: number;
  lon: number;
}

export const mercatorX = (lon: number): number => WGS84_A * rad(lon);
export const mercatorY = (lat: number): number => WGS84_A * Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
export const mercatorToLon = (x: number): number => deg(x / WGS84_A);
export const mercatorToLat = (y: number): number => deg(2 * Math.atan(Math.exp(y / WGS84_A)) - Math.PI / 2);

/** Ground metres per Web Mercator metre at the given latitude, east–west and north–south. */
export function groundScale(lat: number): { x: number; y: number } {
  const phi = rad(lat);
  const w = 1 - WGS84_E2 * Math.sin(phi) ** 2;
  return {
    x: Math.cos(phi) / Math.sqrt(w),
    y: ((1 - WGS84_E2) * Math.cos(phi)) / w ** 1.5,
  };
}

/** Local metres (x east, y north) of a geographic position. */
export function latLonToLocal(origin: GeoOrigin, lat: number, lon: number): Vec2 {
  const scale = groundScale(origin.lat);
  return {
    x: (mercatorX(lon) - mercatorX(origin.lon)) * scale.x,
    y: (mercatorY(lat) - mercatorY(origin.lat)) * scale.y,
  };
}

export function localToLatLon(origin: GeoOrigin, p: Vec2): GeoOrigin {
  const scale = groundScale(origin.lat);
  return {
    lat: mercatorToLat(mercatorY(origin.lat) + p.y / scale.y),
    lon: mercatorToLon(mercatorX(origin.lon) + p.x / scale.x),
  };
}

/**
 * The origin that puts the position (lat, lon) at the local point `at`. Used so that
 * switching the map on shows the requested place in the middle of the current view
 * without moving anything that is already drawn.
 */
export function originPlacing(lat: number, lon: number, at: Vec2): GeoOrigin {
  // The scale at the origin differs from the scale at (lat, lon) only negligibly.
  const scale = groundScale(lat);
  return {
    lat: mercatorToLat(mercatorY(lat) - at.y / scale.y),
    lon: mercatorToLon(mercatorX(lon) - at.x / scale.x),
  };
}

export interface Tile {
  z: number;
  x: number;
  y: number;
}

/** Side of a tile in Mercator metres at zoom level z. */
export const tileSpan = (z: number): number => (2 * Math.PI * WGS84_A) / 2 ** z;

/** Where a tile lies in local metres: its top-left corner, width and height. */
export function tileRect(origin: GeoOrigin, tile: Tile): { x: number; top: number; width: number; height: number } {
  const scale = groundScale(origin.lat);
  const span = tileSpan(tile.z);
  const west = -Math.PI * WGS84_A + tile.x * span;
  const north = Math.PI * WGS84_A - tile.y * span;
  return {
    x: (west - mercatorX(origin.lon)) * scale.x,
    top: (north - mercatorY(origin.lat)) * scale.y,
    width: span * scale.x,
    height: span * scale.y,
  };
}

/** The zoom level whose tiles are shown closest to their natural size (256 screen pixels). */
export function tileZoomFor(origin: GeoOrigin, pixelsPerMetre: number): number {
  const scale = groundScale(origin.lat).x;
  const z = Math.round(Math.log2((2 * Math.PI * WGS84_A * scale * pixelsPerMetre) / TILE_PIXELS));
  return Math.max(0, Math.min(MAX_TILE_ZOOM, z));
}

/**
 * The tiles covering the box (local metres). If more than `maxTiles` would be needed,
 * coarser zoom levels are used instead.
 */
export function tilesCovering(origin: GeoOrigin, box: Box, zoom: number, maxTiles = 64): Tile[] {
  const scale = groundScale(origin.lat);
  const west = mercatorX(origin.lon) + box.minX / scale.x;
  const east = mercatorX(origin.lon) + box.maxX / scale.x;
  const south = mercatorY(origin.lat) + box.minY / scale.y;
  const north = mercatorY(origin.lat) + box.maxY / scale.y;
  const half = Math.PI * WGS84_A;
  for (let z = zoom; z >= 0; z--) {
    const n = 2 ** z;
    const span = tileSpan(z);
    const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
    const x0 = clamp(Math.floor((west + half) / span));
    const x1 = clamp(Math.floor((east + half) / span));
    const y0 = clamp(Math.floor((half - north) / span));
    const y1 = clamp(Math.floor((half - south) / span));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > maxTiles) continue;
    const tiles: Tile[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push({ z, x, y });
    return tiles;
  }
  return [];
}

/** Standard OpenStreetMap tile layer (see the Tile Usage Policy in the README). */
export const osmTileUrl = (tile: Tile): string => `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

/**
 * Read a latitude and longitude from what the user typed or pasted: "60.1549, 24.9560",
 * or a link from openstreetmap.org (…#map=17/60.1549/24.9560) or Google Maps
 * (…/@60.1549,24.9560,17z). Returns null when no plausible pair is found.
 */
export function parseLatLon(text: string): GeoOrigin | null {
  const candidates: [string, string][] = [];
  const osm = /[#&?]map=\d+(?:\.\d+)?\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(text);
  if (osm) candidates.push([osm[1]!, osm[2]!]);
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(text);
  if (at) candidates.push([at[1]!, at[2]!]);
  const mlat = /[?&]mlat=(-?\d+(?:\.\d+)?)/.exec(text);
  const mlon = /[?&]mlon=(-?\d+(?:\.\d+)?)/.exec(text);
  if (mlat && mlon) candidates.push([mlat[1]!, mlon[1]!]);
  // Plain "lat, lon" (decimal point; comma, semicolon or space between the two).
  const plain = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (plain) candidates.push([plain[1]!, plain[2]!]);
  for (const [a, b] of candidates) {
    const lat = Number(a);
    const lon = Number(b);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= MAX_LATITUDE && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }
  return null;
}
