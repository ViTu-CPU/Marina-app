import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { addPier, deletePier, fillPierSide, setBerthClass, setPierLength, setPierLocked, type EditContext } from '../edit';
import { evaluateLayout } from '../layout';
import type { Layout, Site } from '../model';
import { rowFrame, toLocalRect } from '../rows';
import { prepareSite } from '../site';
import { IssueCode } from '../validate';

/**
 * A 100 m × 80 m basin, shore along the south edge, entrance along the north edge.
 * One pier is drawn by hand from (50, 0) to (50, 60), width 3 m; its left side faces west.
 */
const site: Site = {
  water: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }],
  shoreline: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  entrance: { a: { x: 0, y: 80 }, b: { x: 100, y: 80 } },
  obstacles: [],
  zones: [],
};
const ctx: EditContext = { prepared: prepareSite(site, DEFAULT_PARAMS), classes: DEFAULT_BOAT_CLASSES, params: DEFAULT_PARAMS };
const empty: Layout = evaluateLayout(
  { id: 'L1', name: 'Manual', strategy: 'manual', piers: [], fingers: [], berths: [], modified: false },
  ctx.prepared,
  ctx.classes,
  ctx.params,
);
const withPier = addPier(empty, { x: 50, y: 0 }, { x: 50, y: 60 }, ctx);

/**
 * Left side, 5 m boats only, 10 m empty at the shore end:
 *   double bay 0.8 + 2 × 2.5 = 5.8 m; bays from s = 10 to 60 → n × 5.8 + 0.8 ≤ 50 → n = 8
 *   (47.2 m); 2.8 m left < single bay 0.8 + 2.5 + 0.8 = 4.1 m → 16 berths, 9 fingers × 4.0 m.
 * Right side, 12 m boats only, from the shore end:
 *   slot 3.5 + 0.5 = 4.0 × 12.5 m, double bay 0.8 + 8.0 = 8.8 m, finger 0.8 × 12 = 9.6 m;
 *   6 double bays (52.8 m) + single bay 4.8 m + closing finger 0.8 m = 58.4 ≤ 60 → 13 berths,
 *   8 fingers × 9.6 m. Water needed beside the pier edge: 12.5 + 18 (fairway) = 30.5 ≤ 48.5 m.
 */
const left = fillPierSide(withPier, 'P1', 'left', { classId: 'c5', emptyLength: 10 }, ctx);
const both = fillPierSide(left, 'P1', 'right', { classId: 'c12', emptyLength: 0 }, ctx);

describe('manual editing (D22)', () => {
  it('addPier adds an empty manual pier with the next id and the pier width', () => {
    expect(withPier.piers).toEqual([
      { id: 'P1', start: { x: 50, y: 0 }, end: { x: 50, y: 60 }, width: 3, locked: false, origin: 'manual' },
    ]);
    expect(withPier.modified).toBe(true);
    expect(addPier(withPier, { x: 80, y: 0 }, { x: 80, y: 30 }, ctx).piers.map((p) => p.id)).toEqual(['P1', 'P2']);
    expect(addPier(withPier, { x: 80, y: 0 }, { x: 80, y: 0.5 }, ctx)).toBe(withPier); // shorter than 1 m
  });

  it('fillPierSide with one class and empty metres at the shore end', () => {
    expect(left.stats.berthsByClass).toMatchObject({ c5: 16, c12: 0 });
    expect(left.berths.every((b) => b.side === 'left' && b.boatClassId === 'c5')).toBe(true);
    expect(left.stats.fingerLength).toBeCloseTo(36, 6);
    const frame = rowFrame(left.piers[0]!, 'left');
    const firstFinger = Math.min(...left.fingers.map((f) => toLocalRect(f.shape, frame).s0));
    expect(firstFinger).toBeCloseTo(10, 6);
  });

  it('the other side can hold another class: 13 berths of 12 m', () => {
    expect(both.stats.berthsByClass).toMatchObject({ c5: 16, c12: 13 });
    expect(both.stats.fingerLength).toBeCloseTo(36 + 8 * 9.6, 6);
    expect(both.feasibility).toBe('operationalOK');
  });

  it('filling a side again replaces only that side', () => {
    const again = fillPierSide(both, 'P1', 'left', { classId: 'c5', emptyLength: 0 }, ctx);
    // From s = 0: n × 5.8 + 0.8 ≤ 60 → n = 10 (58.8 m) → 20 berths.
    expect(again.stats.berthsByClass).toMatchObject({ c5: 20, c12: 13 });
  });

  it('with the mix, the classes follow the target shares over the whole layout', () => {
    const mixed = fillPierSide(withPier, 'P1', 'left', { classId: null, emptyLength: 0 }, ctx);
    const counts = mixed.stats.berthsByClass;
    expect(mixed.stats.totalBerths).toBeGreaterThan(0);
    // Rows are 7.5 + 8 m apart from the 12 m boats' fairway (18 m) → all four classes appear.
    for (const c of DEFAULT_BOAT_CLASSES) expect(counts[c.id]).toBeGreaterThan(0);
  });

  it('a fill keeps clear of a neighbouring pier and its berths', () => {
    // A second pier 22 m to the west (x = 28) with 5 m boats on its east side, whose slots
    // reach x = 29.5 + 5.5 = 35. P1's west edge is at 48.5, so 13.5 m are left: exactly a
    // 5 m row (5.5 m) and its 8 m fairway, shared with P2's row. A 12 m row would need 30.5 m.
    const twoPiers = fillPierSide(addPier(withPier, { x: 28, y: 0 }, { x: 28, y: 60 }, ctx), 'P2', 'right', { classId: 'c5', emptyLength: 0 }, ctx);
    const big = fillPierSide(twoPiers, 'P1', 'left', { classId: 'c12', emptyLength: 0 }, ctx);
    expect(big.berths.filter((b) => b.pierId === 'P1')).toHaveLength(0);
    const small = fillPierSide(twoPiers, 'P1', 'left', { classId: 'c5', emptyLength: 0 }, ctx);
    expect(small.berths.filter((b) => b.pierId === 'P1').length).toBeGreaterThan(0);
    expect(small.issues.filter((i) => i.code === IssueCode.OVERLAP)).toEqual([]);
  });

  it("a fill does not take the fairway that the berths of another row need", () => {
    // P1 at x = 20 with 12 m boats on its east side: slots 21.5 … 34.0, then an 18 m
    // fairway to x = 52. P2 at x = 57: a 5 m row on its west side would have slots from
    // 55.5 to 50.0 — inside that fairway — so none are placed, and P1's row stays intact.
    const a = fillPierSide(addPier(empty, { x: 20, y: 0 }, { x: 20, y: 60 }, ctx), 'P1', 'right', { classId: 'c12', emptyLength: 0 }, ctx);
    const b = fillPierSide(addPier(a, { x: 57, y: 0 }, { x: 57, y: 60 }, ctx), 'P2', 'left', { classId: 'c5', emptyLength: 0 }, ctx);
    expect(b.berths.filter((x) => x.pierId === 'P2')).toHaveLength(0);
    expect(b.fingers.filter((x) => x.pierId === 'P2')).toHaveLength(0);
    expect(b.berths.filter((x) => x.pierId === 'P1').every((x) => x.issues.length === 0)).toBe(true);
    // At x = 60 the slots (58.5 … 53.0) stay clear of the fairway (ends at 52) and are placed.
    const c = fillPierSide(addPier(a, { x: 60, y: 0 }, { x: 60, y: 60 }, ctx), 'P2', 'left', { classId: 'c5', emptyLength: 0 }, ctx);
    expect(c.berths.filter((x) => x.pierId === 'P2').length).toBe(20);
  });

  it('setBerthClass: a smaller boat fits, a wider one overlaps the next finger', () => {
    const big = both.berths.find((b) => b.boatClassId === 'c12')!;
    const smaller = setBerthClass(both, big.id, 'c5', ctx);
    expect(smaller.stats.berthsByClass).toMatchObject({ c5: 17, c12: 12 });
    expect(smaller.issues.filter((i) => i.code === IssueCode.OVERLAP)).toEqual([]);
    const small = both.berths.find((b) => b.boatClassId === 'c5')!;
    const wider = setBerthClass(both, small.id, 'c12', ctx);
    expect(wider.issues.some((i) => i.code === IssueCode.OVERLAP)).toBe(true);
    expect(setBerthClass(both, small.id, 'c5', ctx)).toBe(both);
  });

  it('setPierLength to 41 m drops what ends beyond the new head', () => {
    // Left (5 m, from s = 10): slots end at 13.3 + 5.8k and 15.8 + 5.8k → both kept for
    // k ≤ 4 (10 berths); fingers end at 10.8 + 5.8k ≤ 41 for k ≤ 5 (6 fingers).
    // Right (12 m, from s = 0): slots end at 8.8k + 4.8 and 8.8k + 8.8 → 9 berths;
    // fingers end at 8.8k + 0.8 ≤ 41 for k ≤ 4 (5 fingers).
    const shorter = setPierLength(both, 'P1', 41, ctx);
    expect(shorter.piers[0]!.end).toEqual({ x: 50, y: 41 });
    expect(shorter.stats.berthsByClass).toMatchObject({ c5: 10, c12: 9 });
    expect(shorter.fingers).toHaveLength(11);
    expect(setPierLength(setPierLocked(both, 'P1', true), 'P1', 41, ctx).piers[0]!.end).toEqual({ x: 50, y: 60 });
  });

  it('deletePier removes the pier with its fingers and berths, unless it is locked', () => {
    const gone = deletePier(both, 'P1', ctx);
    expect(gone.piers).toEqual([]);
    expect(gone.fingers).toEqual([]);
    expect(gone.berths).toEqual([]);
    expect(deletePier(setPierLocked(both, 'P1', true), 'P1', ctx).piers).toHaveLength(1);
  });
});
