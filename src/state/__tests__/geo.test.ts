import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS } from '../../engine/demos';
import {
  groundScale,
  latLonToLocal,
  localToLatLon,
  originPlacing,
  osmTileUrl,
  parseLatLon,
  tileRect,
  tilesCovering,
  tileSpan,
  tileZoomFor,
} from '../geo';
import { parseProject, serializeProject } from '../projectFile';
import { createAppStore } from '../store';

const HELSINKI = { lat: 60, lon: 25 };

describe('map scale (Web Mercator tiles under a metric drawing)', () => {
  it('one zoom-0 pixel is 156 543.03 m at the equator (OSM wiki, "Zoom levels")', () => {
    expect(tileSpan(0) / 256).toBeCloseTo(156543.03, 2);
    expect(tileSpan(1)).toBeCloseTo(tileSpan(0) / 2, 6);
  });

  it('ground scale: 1 at the equator east–west, about one half at 60° N', () => {
    expect(groundScale(0).x).toBeCloseTo(1, 12);
    // North–south the ellipsoid makes it 1 − e² = 0.99331 at the equator.
    expect(groundScale(0).y).toBeCloseTo(0.99330562, 8);
    expect(groundScale(60).x).toBeCloseTo(0.50126, 5);
    expect(groundScale(60).y).toBeCloseTo(0.50042, 5);
  });

  /**
   * Reference lengths on the WGS 84 ellipsoid at 60° N: one degree of longitude is
   * 55 800 m and one degree of latitude 111 412 m. The drawing must agree with these.
   */
  it('0.01° of longitude at 60° N is 558.0 m east', () => {
    const p = latLonToLocal(HELSINKI, 60, 25.01);
    expect(p.x).toBeCloseTo(558.0, 1);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('0.004° of latitude at 60° N is 445.6 m north (within 5 cm)', () => {
    // 111 412 m × 0.004 = 445.65 m: the size of a typical site.
    const p = latLonToLocal(HELSINKI, 60.004, 25);
    expect(Math.abs(p.y - 445.65)).toBeLessThan(0.05);
    expect(p.x).toBeCloseTo(0, 9);
  });

  it('over a kilometre the linear scale is off by less than 0.2 m', () => {
    // 0.01° of latitude is 1114.12 m; the scale is taken at the origin only.
    expect(Math.abs(latLonToLocal(HELSINKI, 60.01, 25).y - 1114.12)).toBeLessThan(0.2);
  });

  it('localToLatLon inverts latLonToLocal', () => {
    const back = localToLatLon(HELSINKI, latLonToLocal(HELSINKI, 60.0031, 25.0042));
    expect(back.lat).toBeCloseTo(60.0031, 9);
    expect(back.lon).toBeCloseTo(25.0042, 9);
  });

  it('originPlacing puts the requested place at the given local point', () => {
    const origin = originPlacing(60.1549, 24.956, { x: 120, y: -40 });
    const p = latLonToLocal(origin, 60.1549, 24.956);
    expect(p.x).toBeCloseTo(120, 2);
    expect(p.y).toBeCloseTo(-40, 2);
    expect(originPlacing(60, 25, { x: 0, y: 0 })).toEqual({ lat: expect.closeTo(60, 9), lon: expect.closeTo(25, 9) });
  });
});

describe('map tiles', () => {
  it('tile addresses follow the OpenStreetMap scheme', () => {
    expect(osmTileUrl({ z: 15, x: 18655, y: 9487 })).toBe('https://tile.openstreetmap.org/15/18655/9487.png');
  });

  it('a tile at 60° N is about half as large on the ground as at the equator', () => {
    const z = 17;
    // 40 075 016.69 m / 2¹⁷ = 305.75 Mercator metres per tile.
    expect(tileSpan(z)).toBeCloseTo(305.75, 2);
    const rect = tileRect(HELSINKI, { z, x: 2 ** (z - 1), y: 0 });
    expect(rect.width).toBeCloseTo(305.75 * 0.50126, 1); // 153.3 m east–west
    expect(rect.height).toBeCloseTo(305.75 * 0.50042, 1); // 153.0 m north–south
  });

  it('the tile containing the origin covers the local point (0, 0)', () => {
    const [tile] = tilesCovering(HELSINKI, { minX: -1, minY: -1, maxX: 1, maxY: 1 }, 16);
    const rect = tileRect(HELSINKI, tile!);
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.top - rect.height).toBeLessThanOrEqual(0);
    // Longitude 25° E is 205/360 of the way round: x = floor(205/360 × 2¹⁶) = 37319.
    expect(tile).toMatchObject({ z: 16, x: 37319 });
  });

  it('zoom follows the view scale and is clamped to what the server offers', () => {
    // At 2 px per metre a 256 px tile should span 128 m: that is zoom 17 at 60° N (153 m).
    expect(tileZoomFor(HELSINKI, 2)).toBe(17);
    expect(tileZoomFor(HELSINKI, 4)).toBe(18);
    expect(tileZoomFor(HELSINKI, 400)).toBe(19);
    expect(tileZoomFor(HELSINKI, 1e-9)).toBe(0);
  });

  it('a view is covered by a handful of tiles, and never more than the cap', () => {
    // 800 × 600 px at 2 px/m = 400 × 300 m; zoom-17 tiles are 153 m → at most 4 × 3.
    const box = { minX: -200, minY: -150, maxX: 200, maxY: 150 };
    const tiles = tilesCovering(HELSINKI, box, 17);
    expect(tiles.length).toBeGreaterThanOrEqual(6);
    expect(tiles.length).toBeLessThanOrEqual(12);
    expect(new Set(tiles.map((t) => `${t.x}/${t.y}`)).size).toBe(tiles.length);
    // A huge box at a fine zoom falls back to coarser tiles instead of thousands of requests.
    const far = tilesCovering(HELSINKI, { minX: -50000, minY: -50000, maxX: 50000, maxY: 50000 }, 19);
    expect(far.length).toBeLessThanOrEqual(64);
    expect(far[0]!.z).toBeLessThan(19);
  });
});

describe('reading a place from text', () => {
  it('plain coordinates', () => {
    expect(parseLatLon('60.1549, 24.9560')).toEqual({ lat: 60.1549, lon: 24.956 });
    expect(parseLatLon(' 60.1549 24.9560 ')).toEqual({ lat: 60.1549, lon: 24.956 });
    expect(parseLatLon('-33.86;151.21')).toEqual({ lat: -33.86, lon: 151.21 });
  });

  it('links from openstreetmap.org and Google Maps', () => {
    expect(parseLatLon('https://www.openstreetmap.org/#map=17/60.15490/24.95600')).toEqual({ lat: 60.1549, lon: 24.956 });
    expect(parseLatLon('https://www.openstreetmap.org/?mlat=60.1549&mlon=24.956#map=5/1/2')).toEqual({ lat: 1, lon: 2 });
    expect(parseLatLon('https://www.google.com/maps/@60.1549,24.956,17z')).toEqual({ lat: 60.1549, lon: 24.956 });
  });

  it('rejects text without a plausible position', () => {
    expect(parseLatLon('')).toBeNull();
    expect(parseLatLon('Helsinki')).toBeNull();
    expect(parseLatLon('95, 20')).toBeNull(); // no such latitude
    expect(parseLatLon('60,1549 24,9560')).toBeNull(); // decimal commas are ambiguous
  });
});

describe('map background in the project', () => {
  it('is part of the document: undoable and saved in the project file', () => {
    const store = createAppStore();
    store.getState().loadDemo('rectBasin');
    store.getState().setMap({ provider: 'osm', lat: 60.15, lon: 24.95, opacity: 0.7 });
    const project = store.getState().project;
    const parsed = parseProject(serializeProject(project));
    expect(parsed.ok && parsed.project.map).toEqual({ provider: 'osm', lat: 60.15, lon: 24.95, opacity: 0.7 });
    store.getState().undo();
    expect(store.getState().project.map).toBeNull();
  });

  it('older project files without a map still open; a bad position is rejected', () => {
    const file = JSON.parse(serializeProject(DEMO_PROJECTS[0]!.create()));
    delete file.project.map;
    const old = parseProject(JSON.stringify(file));
    expect(old.ok && old.project.map).toBeNull();
    file.project.map = { provider: 'osm', lat: 120, lon: 0 };
    expect(parseProject(JSON.stringify(file))).toEqual({ ok: false, error: 'map.lat / map.lon are not a valid position.' });
  });

  it('the map does not affect the Regenerate hint', async () => {
    const { needsRegeneration } = await import('../store');
    const store = createAppStore();
    store.getState().loadDemo('rectBasin');
    store.getState().generate();
    store.getState().setMap({ provider: 'osm', lat: 60.15, lon: 24.95, opacity: 0.7 });
    expect(needsRegeneration(store.getState().project)).toBe(false);
  });
});
