/**
 * Polygon set operations (buffer, union, difference, intersection) backed by JSTS.
 *
 * This is the ONLY file that imports JSTS (DECISIONS I1). Everything crosses the
 * boundary as plain `Region` data, so the library can be replaced without touching
 * the rest of the engine. JSTS's bundled declarations type these operations as `any`;
 * the narrow interfaces below describe exactly the calls made here.
 */
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js';
import SnapOverlayOp from 'jsts/org/locationtech/jts/operation/overlay/snap/SnapOverlayOp.js';
import UnaryUnionOp from 'jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js';
import { ensureCounterClockwise, isCounterClockwise, polygonArea, type Region } from './geometry';
import type { Polygon, Vec2 } from './model';

interface JCoordinate {
  x: number;
  y: number;
}
interface JRing {
  getCoordinates(): JCoordinate[];
}
interface JGeometry {
  getGeometryType(): string;
  getNumGeometries(): number;
  getGeometryN(n: number): JGeometry;
  isEmpty(): boolean;
}
interface JPolygon extends JGeometry {
  getExteriorRing(): JRing;
  getNumInteriorRing(): number;
  getInteriorRingN(n: number): JRing;
}

const factory = new GeometryFactory();

/** Slivers smaller than this are numerical noise from overlay operations, m². */
const MIN_PART_AREA = 1e-6;

/** Arc approximation of round buffer corners: segments per quarter circle (JTS default). */
const QUADRANT_SEGMENTS = 8;

function toJstsRing(ring: Polygon): unknown {
  const coords = ring.map((p) => new Coordinate(p.x, p.y));
  const first = ring[0]!;
  coords.push(new Coordinate(first.x, first.y));
  return factory.createLinearRing(coords);
}

function toJsts(region: Region): JGeometry {
  const polygons = region.map((part) =>
    factory.createPolygon(toJstsRing(part.outer), part.holes.map(toJstsRing)),
  );
  if (polygons.length === 1) return polygons[0] as JGeometry;
  return factory.createMultiPolygon(polygons) as unknown as JGeometry;
}

function fromJstsRing(ring: JRing): Polygon {
  const coords = ring.getCoordinates();
  const out: Vec2[] = [];
  // JTS rings repeat the first point at the end; the model does not.
  for (let i = 0; i + 1 < coords.length; i++) out.push({ x: coords[i]!.x, y: coords[i]!.y });
  return out;
}

function fromJsts(geometry: JGeometry): Region {
  const region: Region = [];
  const visit = (g: JGeometry): void => {
    if (g.isEmpty()) return;
    if (g.getGeometryType() === 'Polygon') {
      const polygon = g as JPolygon;
      const outer = ensureCounterClockwise(fromJstsRing(polygon.getExteriorRing()));
      if (outer.length < 3 || polygonArea(outer) < MIN_PART_AREA) return;
      const holes: Polygon[] = [];
      for (let i = 0; i < polygon.getNumInteriorRing(); i++) {
        const hole = fromJstsRing(polygon.getInteriorRingN(i));
        if (hole.length < 3 || polygonArea(hole) < MIN_PART_AREA) continue;
        holes.push(isCounterClockwise(hole) ? hole.reverse() : hole);
      }
      region.push({ outer, holes });
      return;
    }
    // Multi-geometries and collections: keep the polygonal members, drop stray lines/points.
    for (let i = 0; i < g.getNumGeometries(); i++) {
      const child = g.getGeometryN(i);
      if (child !== g) visit(child);
    }
  };
  visit(geometry);
  return region;
}

const snapRegion = (region: Region, grid: number): Region => {
  const snap = (ring: Polygon): Polygon => ring.map((p) => ({ x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid }));
  return region.map((part) => ({ outer: snap(part.outer), holes: part.holes.map(snap) }));
};

/**
 * Overlay with fallbacks. JTS's classic overlay can throw a TopologyException when edges
 * of the two inputs nearly coincide. JSTS's own SnapIfNeededOverlayOp does not catch that
 * exception (its `instanceof` test fails), so the fallback chain is implemented here:
 * plain overlay → snapping overlay → the same on coordinates rounded to 1 µm, then 1 mm.
 */
function overlay(a: Region, b: Region, opCode: number): Region {
  const attempts: (() => JGeometry)[] = [
    () => OverlayOp.overlayOp(toJsts(a), toJsts(b), opCode) as JGeometry,
    () => SnapOverlayOp.overlayOp(toJsts(a), toJsts(b), opCode) as JGeometry,
    () => SnapOverlayOp.overlayOp(toJsts(snapRegion(a, 1e-6)), toJsts(snapRegion(b, 1e-6)), opCode) as JGeometry,
    () => SnapOverlayOp.overlayOp(toJsts(snapRegion(a, 1e-3)), toJsts(snapRegion(b, 1e-3)), opCode) as JGeometry,
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return fromJsts(attempt());
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Polygon overlay failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/**
 * Grow (distance > 0) or shrink (distance < 0) a region. Corners are rounded, so the
 * result of a positive buffer is the set of points within `distance` of the region.
 */
export function bufferRegion(region: Region, distance: number): Region {
  if (region.length === 0) return [];
  if (distance === 0) return region;
  return fromJsts(BufferOp.bufferOp(toJsts(region), distance, QUADRANT_SEGMENTS) as JGeometry);
}

/** Union of any number of regions; overlapping and touching parts are merged. */
export function unionRegions(regions: Region[]): Region {
  const parts = regions.flat();
  if (parts.length === 0) return [];
  if (parts.length === 1) return parts;
  const collection = factory.createGeometryCollection(parts.map((part) => toJsts([part])));
  try {
    return fromJsts(UnaryUnionOp.union(collection) as JGeometry);
  } catch {
    // Buffering by zero also unions a collection and uses JTS's more tolerant buffer noding.
    return fromJsts(BufferOp.bufferOp(collection, 0) as JGeometry);
  }
}

/** a − b */
export function differenceRegions(a: Region, b: Region): Region {
  if (a.length === 0) return [];
  if (b.length === 0) return a;
  return overlay(a, b, OverlayOp.DIFFERENCE);
}

/** a ∩ b */
export function intersectRegions(a: Region, b: Region): Region {
  if (a.length === 0 || b.length === 0) return [];
  return overlay(a, b, OverlayOp.INTERSECTION);
}
