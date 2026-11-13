import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { RECT_BASIN_SITE } from '../demos';
import { movePier, setBerthRemoved, setPierLocked, type EditContext } from '../edit';
import { generateLayouts } from '../generate';
import { prepareSite } from '../site';
import { IssueCode } from '../validate';

// The example basin without its rock, so that the starting layout has no issues at all.
const SITE = { ...RECT_BASIN_SITE, obstacles: [] };
const ctx: EditContext = {
  prepared: prepareSite(SITE, DEFAULT_PARAMS),
  classes: DEFAULT_BOAT_CLASSES,
  params: DEFAULT_PARAMS,
};
// Strategy A: every pier on the uniform 46 m pitch, with 18 m fairways.
const base = generateLayouts({
  site: SITE,
  boatClasses: DEFAULT_BOAT_CLASSES,
  params: DEFAULT_PARAMS,
  objective: DEFAULT_OBJECTIVE,
}).layouts.find((l) => l.strategy === 'A')!;
const codes = (issues: { code: string }[]) => [...new Set(issues.map((i) => i.code))].sort();

describe('manual edits (SPEC §8)', () => {
  it('the generated layout starts clean', () => {
    expect(base.issues).toEqual([]);
    expect(base.modified).toBe(false);
  });

  it('removing a berth lowers the count, keeps the fingers and sets modified', () => {
    const berth = base.berths[10]!;
    const edited = setBerthRemoved(base, berth.id, true, ctx);
    expect(edited.stats.totalBerths).toBe(base.stats.totalBerths - 1);
    expect(edited.stats.berthsByClass[berth.boatClassId]).toBe(base.stats.berthsByClass[berth.boatClassId]! - 1);
    expect(edited.fingers).toBe(base.fingers);
    expect(edited.stats.pontoonLength).toBe(base.stats.pontoonLength);
    expect(edited.modified).toBe(true);
    expect(base.berths[10]!.removed).toBe(false); // the input is not mutated
    // Restoring brings the numbers back; the layout stays marked as edited.
    const restored = setBerthRemoved(edited, berth.id, false, ctx);
    expect(restored.stats.totalBerths).toBe(base.stats.totalBerths);
    expect(restored.modified).toBe(true);
  });

  it('edits that change nothing return the same layout', () => {
    expect(setBerthRemoved(base, base.berths[0]!.id, false, ctx)).toBe(base);
    expect(setBerthRemoved(base, 'no-such-berth', true, ctx)).toBe(base);
    expect(movePier(base, base.piers[0]!.id, { x: 0, y: 0 }, ctx)).toBe(base);
    expect(movePier(base, 'no-such-pier', { x: 1, y: 0 }, ctx)).toBe(base);
    expect(setPierLocked(base, base.piers[0]!.id, false)).toBe(base);
  });

  it('moving a pier sideways moves its fingers and berths and re-validates', () => {
    const pier = base.piers[2]!;
    const moved = movePier(base, pier.id, { x: 6, y: 0 }, ctx);
    expect(moved.piers[2]!.start.x).toBeCloseTo(pier.start.x + 6, 6);
    const before = base.berths.find((b) => b.pierId === pier.id)!;
    const after = moved.berths.find((b) => b.id === before.id)!;
    expect(after.slot[0]!.x).toBeCloseTo(before.slot[0]!.x + 6, 6);
    expect(after.boat[0]!.x).toBeCloseTo(before.boat[0]!.x + 6, 6);
    // Other piers stay where they were.
    expect(moved.piers[0]).toBe(base.piers[0]);
    // 6 m closer to its eastern neighbour: that fairway is no longer 18 m wide.
    expect(moved.feasibility).toBe('geometricOK');
    expect(codes(moved.issues)).toContain(IssueCode.FAIRWAY_OBSTRUCTED);
    expect(moved.stats.issueCounts.warning).toBe(moved.issues.length);
    expect(moved.modified).toBe(true);
  });

  it('moving a pier onto its neighbour is a geometric error', () => {
    const [first, second] = base.piers;
    const moved = movePier(base, first!.id, { x: second!.start.x - first!.start.x - 1, y: 0 }, ctx);
    expect(moved.feasibility).toBe('geometricFail');
    expect(codes(moved.issues)).toContain(IssueCode.OVERLAP);
    expect(moved.berths.some((b) => b.issues.length > 0)).toBe(true);
  });

  it('moving a pier along its axis away from the shore breaks the shore connection', () => {
    const pier = base.piers[1]!;
    const moved = movePier(base, pier.id, { x: 0, y: 4 }, ctx);
    expect(codes(moved.issues)).toContain(IssueCode.PIER_NOT_CONNECTED_TO_SHORE);
    // Moving it back restores a clean layout.
    const back = movePier(moved, pier.id, { x: 0, y: -4 }, ctx);
    expect(back.issues).toEqual([]);
    expect(back.feasibility).toBe('operationalOK');
  });

  it('a locked pier cannot be moved', () => {
    const pier = base.piers[1]!;
    const locked = setPierLocked(base, pier.id, true);
    expect(locked.piers[1]!.locked).toBe(true);
    expect(locked.modified).toBe(false);
    expect(movePier(locked, pier.id, { x: 5, y: 0 }, ctx)).toBe(locked);
    expect(movePier(setPierLocked(locked, pier.id, false), pier.id, { x: 5, y: 0 }, ctx).modified).toBe(true);
  });
});
