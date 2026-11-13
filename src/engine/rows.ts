/**
 * Berth rows of a layout, recovered from its elements.
 *
 * A row is the set of berths on one side of a main pier. Validation and the fairway
 * builder work on rows derived from the actual geometry, so they give the same answers
 * for generated layouts and for layouts the user has edited by hand.
 */
import { add, centroid, distance, dot, scale, sub } from './geometry';
import { fairwayWidthFor } from './fill';
import type { Berth, BoatClass, Finger, MainPier, Params, PierSide, Polygon, Vec2 } from './model';
import type { LocalRect, RowFrame } from './patterns';

export interface RowInfo {
  pierId: string;
  side: PierSide;
  frame: RowFrame;
  /** Extent of the row along the pier (berths in use and fingers), m from the pier start. */
  sMin: number;
  sMax: number;
  /** Depth of the row: the longest slot, measured from the pier edge, m. */
  depth: number;
  /** Fairway width required by the longest boat in the row, m. */
  fairwayWidth: number;
  /** Berths in use (not removed). */
  berths: Berth[];
}

export function pierAxis(pier: MainPier): { along: Vec2; left: Vec2; length: number } {
  const len = distance(pier.start, pier.end);
  const along = { x: (pier.end.x - pier.start.x) / len, y: (pier.end.y - pier.start.y) / len };
  return { along, left: { x: -along.y, y: along.x }, length: len };
}

export function rowFrame(pier: MainPier, side: PierSide): RowFrame {
  const { along, left } = pierAxis(pier);
  const outward = side === 'left' ? left : scale(left, -1);
  return { origin: add(pier.start, scale(outward, pier.width / 2)), along, outward };
}

/** Bounding rectangle of a polygon in row-local coordinates. */
export function toLocalRect(shape: Polygon, frame: RowFrame): LocalRect {
  const r: LocalRect = { s0: Infinity, s1: -Infinity, d0: Infinity, d1: -Infinity };
  for (const p of shape) {
    const rel = sub(p, frame.origin);
    const s = dot(rel, frame.along);
    const d = dot(rel, frame.outward);
    r.s0 = Math.min(r.s0, s);
    r.s1 = Math.max(r.s1, s);
    r.d0 = Math.min(r.d0, d);
    r.d1 = Math.max(r.d1, d);
  }
  return r;
}

export function layoutRows(
  piers: MainPier[],
  fingers: Finger[],
  berths: Berth[],
  classes: BoatClass[],
  params: Params,
): RowInfo[] {
  const lengthOf = new Map(classes.map((c) => [c.id, c.length]));
  const rows: RowInfo[] = [];
  for (const pier of piers) {
    for (const side of ['left', 'right'] as const) {
      const active = berths.filter((b) => b.pierId === pier.id && b.side === side && !b.removed);
      if (active.length === 0) continue;
      const frame = rowFrame(pier, side);
      let sMin = Infinity;
      let sMax = -Infinity;
      let depth = 0;
      for (const b of active) {
        const r = toLocalRect(b.slot, frame);
        sMin = Math.min(sMin, r.s0);
        sMax = Math.max(sMax, r.s1);
        depth = Math.max(depth, r.d1);
      }
      for (const f of fingers) {
        if (f.pierId !== pier.id) continue;
        if (dot(sub(centroid(f.shape), frame.origin), frame.outward) < 0) continue; // other side
        const r = toLocalRect(f.shape, frame);
        sMin = Math.min(sMin, r.s0);
        sMax = Math.max(sMax, r.s1);
      }
      const longest = Math.max(0, ...active.map((b) => lengthOf.get(b.boatClassId) ?? 0));
      rows.push({
        pierId: pier.id,
        side,
        frame,
        sMin,
        sMax,
        depth,
        fairwayWidth: fairwayWidthFor(longest, params),
        berths: active,
      });
    }
  }
  return rows;
}
