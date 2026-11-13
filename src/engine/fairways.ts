/**
 * Fairway polygons (SPEC §5.6): the water strips in front of the berth rows and around
 * the pier heads, clipped to navigable water and to what is not occupied.
 *
 * Built from the actual rows of a layout, so it also works after manual edits.
 */
import { regionFromPolygon, roundVec, type Region } from './geometry';
import { differenceRegions, intersectRegions, unionRegions } from './geometryOps';
import type { Fairway, MainPier } from './model';
import { localRectToPolygon } from './patterns';
import { pierAxis, rowFrame, type RowInfo } from './rows';
import { pierPolygon, type PreparedSite } from './site';

/** Piers and the full blocks of their berth rows: water that is not available for passing. */
export function occupiedRegion(piers: MainPier[], rows: RowInfo[]): Region {
  const shapes: Region[] = piers.map((p) => regionFromPolygon(pierPolygon(p.start, p.end, p.width)));
  for (const row of rows) {
    shapes.push(regionFromPolygon(localRectToPolygon({ s0: row.sMin, s1: row.sMax, d0: 0, d1: row.depth }, row.frame)));
  }
  return unionRegions(shapes);
}

export function buildFairways(piers: MainPier[], rows: RowInfo[], prepared: PreparedSite): Fairway[] {
  if (rows.length === 0) return [];
  const strips: Region[] = [];
  let requiredWidth = 0;
  for (const pier of piers) {
    const pierRows = rows.filter((r) => r.pierId === pier.id);
    if (pierRows.length === 0) continue;
    const { length } = pierAxis(pier);
    const headWidth = Math.max(...pierRows.map((r) => r.fairwayWidth));
    requiredWidth = Math.max(requiredWidth, headWidth);
    // Strip in front of each row, from the start of the row to the pier head.
    for (const row of pierRows) {
      strips.push(
        regionFromPolygon(
          localRectToPolygon({ s0: row.sMin, s1: length, d0: row.depth, d1: row.depth + row.fairwayWidth }, row.frame),
        ),
      );
    }
    // Strip across the pier head, wide enough to join the row strips on both sides.
    const reach = (side: 'left' | 'right'): number => {
      const row = pierRows.find((r) => r.side === side);
      return row ? row.depth + row.fairwayWidth : 0;
    };
    strips.push(
      regionFromPolygon(
        localRectToPolygon(
          { s0: length, s1: length + headWidth, d0: -(pier.width + reach('right')), d1: reach('left') },
          rowFrame(pier, 'left'),
        ),
      ),
    );
  }
  const free = differenceRegions(
    intersectRegions(unionRegions(strips), prepared.navigableRegion),
    occupiedRegion(piers, rows),
  );
  return free.map((part, i) => ({
    id: `FW${i + 1}`,
    shape: part.outer.map(roundVec),
    holes: part.holes.map((h) => h.map(roundVec)),
    requiredWidth,
  }));
}
