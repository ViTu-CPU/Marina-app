/**
 * Fast, approximate "can a boat get here from the entrance?" test for the generator's
 * search (SPEC §6, fairway network connected to the entrance).
 *
 * The exact test in validate.ts shrinks the free water with a polygon buffer, which is
 * far too slow to run on every candidate of the search. This module answers the same
 * question on a coarse grid: a cell is passable when a circle nearly as wide as the
 * fairway fits around its centre, and passable cells are flood-filled from the entrance.
 *
 * It is only used to RANK candidates during the search. It is deliberately a little
 * lenient (by about one grid cell), and every layout that is returned is afterwards
 * checked with the exact test.
 */
import { boundingBox, pointInRegion } from './geometry';
import type { Vec2 } from './model';
import type { PreparedSite } from './site';

export interface ReachGrid {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minY: number;
  /** Radius of the circle that must fit around a passable cell centre, m. */
  radius: number;
  /** 1 where the site alone (water boundary, obstacle buffers, zones) leaves the cell passable. */
  open: Uint8Array;
  /** Indices of passable cells next to the entrance. */
  seeds: Int32Array;
}

/** A rectangle given in a local frame: origin + s·along + d·outward. */
export interface OccupiedBox {
  origin: Vec2;
  along: Vec2;
  outward: Vec2;
  s0: number;
  s1: number;
  d0: number;
  d1: number;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function buildReachGrid(prepared: PreparedSite, fairwayWidth: number): ReachGrid {
  const cell = Math.min(2.5, Math.max(1, fairwayWidth / 8));
  const radius = Math.max(cell / 2, fairwayWidth / 2 - 0.75 * cell);
  const box = boundingBox(prepared.site.water);
  const cols = Math.max(1, Math.ceil((box.maxX - box.minX) / cell));
  const rows = Math.max(1, Math.ceil((box.maxY - box.minY) / cell));
  const open = new Uint8Array(cols * rows);

  const edges: number[] = [];
  for (const part of prepared.navigableRegion) {
    for (const ring of [part.outer, ...part.holes]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        edges.push(a.x, a.y, b.x, b.y);
      }
    }
  }
  const { a, b } = prepared.site.entrance;
  const seeds: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = box.minX + (c + 0.5) * cell;
      const y = box.minY + (r + 0.5) * cell;
      if (!pointInRegion({ x, y }, prepared.navigableRegion)) continue;
      let clearance = Infinity;
      for (let i = 0; i < edges.length && clearance >= radius; i += 4) {
        clearance = Math.min(clearance, distanceToSegment(x, y, edges[i]!, edges[i + 1]!, edges[i + 2]!, edges[i + 3]!));
      }
      if (clearance < radius) continue;
      const index = r * cols + c;
      open[index] = 1;
      if (distanceToSegment(x, y, a.x, a.y, b.x, b.y) <= fairwayWidth / 2 + cell) seeds.push(index);
    }
  }
  return { cell, cols, rows, minX: box.minX, minY: box.minY, radius, open, seeds: Int32Array.from(seeds) };
}

/**
 * Cells a fairway-wide circle can reach from the entrance once the given boxes
 * (piers and berth rows) are in the water. Returns 1 for reached cells.
 */
export function reachableCells(grid: ReachGrid, occupied: OccupiedBox[]): Uint8Array {
  const { cell, cols, rows, minX, minY, radius } = grid;
  const open = grid.open.slice();
  for (const box of occupied) {
    // Cells whose centre is closer than `radius` to the box are not passable.
    const corners = [
      [box.s0, box.d0],
      [box.s1, box.d0],
      [box.s1, box.d1],
      [box.s0, box.d1],
    ];
    let bMinX = Infinity;
    let bMinY = Infinity;
    let bMaxX = -Infinity;
    let bMaxY = -Infinity;
    for (const [s, d] of corners) {
      const x = box.origin.x + s! * box.along.x + d! * box.outward.x;
      const y = box.origin.y + s! * box.along.y + d! * box.outward.y;
      if (x < bMinX) bMinX = x;
      if (x > bMaxX) bMaxX = x;
      if (y < bMinY) bMinY = y;
      if (y > bMaxY) bMaxY = y;
    }
    const c0 = Math.max(0, Math.floor((bMinX - radius - minX) / cell));
    const c1 = Math.min(cols - 1, Math.floor((bMaxX + radius - minX) / cell));
    const r0 = Math.max(0, Math.floor((bMinY - radius - minY) / cell));
    const r1 = Math.min(rows - 1, Math.floor((bMaxY + radius - minY) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const index = r * cols + c;
        if (open[index] === 0) continue;
        const rx = minX + (c + 0.5) * cell - box.origin.x;
        const ry = minY + (r + 0.5) * cell - box.origin.y;
        const s = rx * box.along.x + ry * box.along.y;
        const d = rx * box.outward.x + ry * box.outward.y;
        const ds = s < box.s0 ? box.s0 - s : s > box.s1 ? s - box.s1 : 0;
        const dd = d < box.d0 ? box.d0 - d : d > box.d1 ? d - box.d1 : 0;
        if (ds * ds + dd * dd < radius * radius) open[index] = 0;
      }
    }
  }

  const reached = new Uint8Array(cols * rows);
  const stack = new Int32Array(cols * rows);
  let top = 0;
  for (const seed of grid.seeds) {
    if (open[seed] === 1 && reached[seed] === 0) {
      reached[seed] = 1;
      stack[top++] = seed;
    }
  }
  while (top > 0) {
    const index = stack[--top]!;
    const c = index % cols;
    const r = (index - c) / cols;
    if (c > 0 && open[index - 1] === 1 && reached[index - 1] === 0) {
      reached[index - 1] = 1;
      stack[top++] = index - 1;
    }
    if (c < cols - 1 && open[index + 1] === 1 && reached[index + 1] === 0) {
      reached[index + 1] = 1;
      stack[top++] = index + 1;
    }
    if (r > 0 && open[index - cols] === 1 && reached[index - cols] === 0) {
      reached[index - cols] = 1;
      stack[top++] = index - cols;
    }
    if (r < rows - 1 && open[index + cols] === 1 && reached[index + cols] === 0) {
      reached[index + cols] = 1;
      stack[top++] = index + cols;
    }
  }
  return reached;
}

/**
 * True when the point lies in the water swept by the circle, i.e. a reached cell centre
 * is within `sweep` metres of it. Dead ends of a fairway are swept although the
 * circle's centre cannot get into them.
 */
export function isSwept(grid: ReachGrid, reached: Uint8Array, x: number, y: number, sweep: number): boolean {
  const { cell, cols, rows, minX, minY } = grid;
  const c = Math.floor((x - minX) / cell);
  const r = Math.floor((y - minY) / cell);
  if (c >= 0 && c < cols && r >= 0 && r < rows && reached[r * cols + c] === 1) return true;
  const span = Math.ceil(sweep / cell);
  const limit = (sweep + cell) * (sweep + cell);
  for (let rr = Math.max(0, r - span); rr <= Math.min(rows - 1, r + span); rr++) {
    for (let cc = Math.max(0, c - span); cc <= Math.min(cols - 1, c + span); cc++) {
      if (reached[rr * cols + cc] !== 1) continue;
      const dx = minX + (cc + 0.5) * cell - x;
      const dy = minY + (rr + 0.5) * cell - y;
      if (dx * dx + dy * dy <= limit) return true;
    }
  }
  return false;
}
