/**
 * Manual edits of a layout (SPEC §8): remove/restore a berth, lock a pier, move a pier.
 * Each edit returns a new, fully re-evaluated layout marked as modified.
 */
import { add, roundVec } from './geometry';
import { evaluateLayout } from './layout';
import type { BoatClass, Layout, Params, Polygon, Vec2 } from './model';
import type { PreparedSite } from './site';

export interface EditContext {
  prepared: PreparedSite;
  classes: BoatClass[];
  params: Params;
}

function reevaluate(layout: Layout, ctx: EditContext): Layout {
  const next = evaluateLayout({ ...layout, modified: true }, ctx.prepared, ctx.classes, ctx.params);
  return { ...next, score: layout.score };
}

/** Mark a berth as removed or restore it. The fingers stay. */
export function setBerthRemoved(layout: Layout, berthId: string, removed: boolean, ctx: EditContext): Layout {
  if (!layout.berths.some((b) => b.id === berthId && b.removed !== removed)) return layout;
  return reevaluate(
    { ...layout, berths: layout.berths.map((b) => (b.id === berthId ? { ...b, removed } : b)) },
    ctx,
  );
}

/** Lock or unlock a pier. A locked pier cannot be moved. Does not count as a geometry edit. */
export function setPierLocked(layout: Layout, pierId: string, locked: boolean): Layout {
  if (!layout.piers.some((p) => p.id === pierId && p.locked !== locked)) return layout;
  return { ...layout, piers: layout.piers.map((p) => (p.id === pierId ? { ...p, locked } : p)) };
}

/**
 * Move a pier with its fingers and berths by `delta` (metres, world axes). The caller
 * decides the direction (along the pier axis or square to it). Locked piers do not move.
 */
export function movePier(layout: Layout, pierId: string, delta: Vec2, ctx: EditContext): Layout {
  const pier = layout.piers.find((p) => p.id === pierId);
  if (!pier || pier.locked || (delta.x === 0 && delta.y === 0)) return layout;
  const shift = (shape: Polygon): Polygon => shape.map((p) => roundVec(add(p, delta)));
  return reevaluate(
    {
      ...layout,
      piers: layout.piers.map((p) =>
        p.id === pierId ? { ...p, start: roundVec(add(p.start, delta)), end: roundVec(add(p.end, delta)) } : p,
      ),
      fingers: layout.fingers.map((f) => (f.pierId === pierId ? { ...f, shape: shift(f.shape) } : f)),
      berths: layout.berths.map((b) => (b.pierId === pierId ? { ...b, slot: shift(b.slot), boat: shift(b.boat) } : b)),
    },
    ctx,
  );
}
