import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { RECT_BASIN_SITE } from '../demos';
import { fillPier, newMixState, rowDesign, type FillContext } from '../fill';
import { convexIntersectsRegion, convexPolygonsOverlap, polygonArea } from '../geometry';
import type { BoatClass, Params, Site } from '../model';
import { fingerPierPattern } from '../patterns';
import { prepareSite } from '../site';

const OPEN_BASIN: Site = { ...RECT_BASIN_SITE, obstacles: [] };

const only = (id: string): BoatClass[] => DEFAULT_BOAT_CLASSES.filter((c) => c.id === id).map((c) => ({ ...c, share: 1 }));

function context(site: Site, classes: BoatClass[], params: Params = DEFAULT_PARAMS): FillContext {
  const design = rowDesign(classes, params, fingerPierPattern);
  if (!design) throw new Error('no active boat classes');
  return { prepared: prepareSite(site, params), classes, params, pattern: fingerPierPattern, design };
}

/** A pier from the south shore straight north at the given x. */
const pierAt = (x: number, length: number) => ({ id: 'P1', start: { x, y: 0 }, end: { x, y: length }, width: 3 });

const count = (berths: { side: string; boatClassId: string }[], side: string, classId?: string) =>
  berths.filter((b) => b.side === side && (classId === undefined || b.boatClassId === classId)).length;

describe('rowDesign (SPEC §5.3, uniform pitch by the longest class — DECISIONS D2)', () => {
  it('default mix: 12 m boats set the module', () => {
    const d = rowDesign(DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS, fingerPierPattern)!;
    expect(d.rowDepth).toBe(12.5); // 12.0 + 0.5
    expect(d.fairwayWidth).toBe(18); // max(8, 1.5 × 12)
    expect(d.pitch).toBe(46); // 3.0 + 2 × 12.5 + 18
    expect(d.minBayFootprint).toBeCloseTo(4.1, 12); // 0.8 + 2.5 + 0.8
  });

  it('5 m boats only: the minimum fairway width governs', () => {
    const d = rowDesign(only('c5'), DEFAULT_PARAMS, fingerPierPattern)!;
    expect(d.rowDepth).toBe(5.5);
    expect(d.fairwayWidth).toBe(8); // max(8, 1.5 × 5 = 7.5)
    expect(d.pitch).toBe(22); // 3.0 + 2 × 5.5 + 8
  });

  it('classes with zero share are ignored; none active gives null', () => {
    const classes = DEFAULT_BOAT_CLASSES.map((c) => ({ ...c, share: c.id === 'c12' ? 0 : c.share }));
    expect(rowDesign(classes, DEFAULT_PARAMS, fingerPierPattern)!.rowDepth).toBe(9.5);
    expect(rowDesign(classes.map((c) => ({ ...c, share: 0 })), DEFAULT_PARAMS, fingerPierPattern)).toBeNull();
  });
});

describe('fillPier, hand-calculated berth counts (SPEC §10)', () => {
  it('case 1: 60 m pier, 5.0 × 2.0 m boats, two per bay → 20 per side, 40 in total', () => {
    // Slot 2.0 + 0.5 = 2.5 m. Bay = finger 0.8 + 2 × 2.5 = 5.8 m.
    // n bays need n × 5.8 + 0.8 (closing finger): 10 → 58.8 ≤ 60, 11 → 64.6 > 60.
    // Left over after 10 bays: 60 − 58.0 = 2.0 m < 4.1 m (single-boat bay) → nothing more.
    const classes = only('c5');
    const fill = fillPier(pierAt(110, 60), context(OPEN_BASIN, classes), newMixState(classes));
    expect(count(fill.berths, 'left')).toBe(20);
    expect(count(fill.berths, 'right')).toBe(20);
    // 11 fingers per side, each 0.8 × 5.0 = 4.0 m long and 0.8 m wide.
    expect(fill.fingers).toHaveLength(22);
    for (const f of fill.fingers) expect(polygonArea(f.shape)).toBeCloseTo(4.0 * 0.8, 6);
  });

  it('case 2: 60 m pier, 7.0 × 2.5 m boats, one per bay → 15 per side, 30 in total', () => {
    // Slot 2.5 + 0.5 = 3.0 m. Bay = 0.8 + 3.0 = 3.8 m.
    // 15 × 3.8 + 0.8 = 57.8 ≤ 60; 16 × 3.8 + 0.8 = 61.6 > 60.
    const classes = only('c7');
    const params: Params = { ...DEFAULT_PARAMS, boatsPerBay: 1 };
    const fill = fillPier(pierAt(110, 60), context(OPEN_BASIN, classes, params), newMixState(classes));
    expect(count(fill.berths, 'left')).toBe(15);
    expect(count(fill.berths, 'right')).toBe(15);
    expect(fill.fingers).toHaveLength(32); // 16 per side
  });

  it('case 3: shoreOffset 10 m leaves 50 m → 8 bays, 16 per side, 32 in total', () => {
    // 8 × 5.8 + 0.8 = 47.2 ≤ 50; 9 × 5.8 + 0.8 = 53.0 > 50. Left over 50 − 46.4 = 3.6 < 4.1.
    const classes = only('c5');
    const params: Params = { ...DEFAULT_PARAMS, shoreOffset: 10 };
    const fill = fillPier(pierAt(110, 60), context(OPEN_BASIN, classes, params), newMixState(classes));
    expect(fill.berths).toHaveLength(32);
    // The first finger starts 10 m from the shore.
    expect(Math.min(...fill.fingers.flatMap((f) => f.shape.map((p) => p.y)))).toBeCloseTo(10, 6);
  });

  it('case 4: 63 m pier → 10 full bays plus a single-boat bay, 21 per side, 42 in total', () => {
    // After 10 bays the cursor is at 58.0; 63 − 58 = 5.0 ≥ 0.8 + 2.5 + 0.8 = 4.1 → one more boat.
    const classes = only('c5');
    const fill = fillPier(pierAt(110, 63), context(OPEN_BASIN, classes), newMixState(classes));
    expect(count(fill.berths, 'left')).toBe(21);
    expect(count(fill.berths, 'right')).toBe(21);
    expect(fill.fingers).toHaveLength(24); // 12 per side
  });

  it('case 5: a row needs slot 5.5 + fairway 8 = 13.5 m of water beside the pier', () => {
    const classes = only('c5');
    // Pier centre at x = 10 → west edge at 8.5 m from the wall: no room for the west row.
    const narrow = fillPier(pierAt(10, 60), context(OPEN_BASIN, classes), newMixState(classes));
    expect(count(narrow.berths, 'left')).toBe(0);
    expect(count(narrow.berths, 'right')).toBe(20);
    // Pier centre at x = 15 → west edge at exactly 13.5 m: the west row fits.
    const enough = fillPier(pierAt(15, 60), context(OPEN_BASIN, classes), newMixState(classes));
    expect(count(enough.berths, 'left')).toBe(20);
    expect(count(enough.berths, 'right')).toBe(20);
  });

  it('case 6: two classes 50/50 on a 60 m pier → 17 per side, 17 of each class', () => {
    // Classes 5.0 × 2.0 (slot 2.5) and 9.0 × 3.0 (slot 3.5), two per bay, picked alternately.
    // Mixed bay = 0.8 + 2.5 + 3.5 = 6.8 m. 8 × 6.8 + 0.8 = 55.2 ≤ 60; 9 bays → 62.0 > 60.
    // Cursor after 8 bays: 54.4, left over 5.6 m:
    //   two 5 m boats need 0.8 + 5.0 + 0.8 = 6.6 > 5.6 → no; one boat of the class that is
    //   behind its share: west row a 5 m boat (4.1 m), east row a 9 m boat (5.1 m) → fits.
    // West row: 9 × 5 m + 8 × 9 m. East row: 8 × 5 m + 9 × 9 m.
    const classes: BoatClass[] = [
      { ...DEFAULT_BOAT_CLASSES[0]!, share: 0.5 },
      { ...DEFAULT_BOAT_CLASSES[2]!, share: 0.5 },
    ];
    const mix = newMixState(classes);
    const fill = fillPier(pierAt(110, 60), context(OPEN_BASIN, classes), mix);
    expect(count(fill.berths, 'left')).toBe(17);
    expect(count(fill.berths, 'right')).toBe(17);
    expect(count(fill.berths, 'left', 'c5')).toBe(9);
    expect(count(fill.berths, 'left', 'c9')).toBe(8);
    expect(count(fill.berths, 'right', 'c5')).toBe(8);
    expect(count(fill.berths, 'right', 'c9')).toBe(9);
    expect(mix).toEqual({ total: 34, counts: { c5: 17, c9: 17 } });
  });
});

describe('fillPier, properties', () => {
  const classes = DEFAULT_BOAT_CLASSES;
  const ctx = context(RECT_BASIN_SITE, classes);

  it('larger boats are placed towards the pier head', () => {
    const fill = fillPier(pierAt(60, 100), ctx, newMixState(classes));
    const lengthOf = (id: string) => classes.find((c) => c.id === id)!.length;
    for (const side of ['left', 'right']) {
      const lengths = fill.berths.filter((b) => b.side === side).map((b) => lengthOf(b.boatClassId));
      expect(lengths.length).toBeGreaterThan(10);
      expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    }
  });

  it('the class mix follows the target shares', () => {
    const mix = newMixState(classes);
    const fill = fillPier(pierAt(60, 100), ctx, mix);
    expect(mix.total).toBe(fill.berths.length);
    for (const c of classes) {
      // The deficit rule keeps every class within one berth of its target.
      expect(Math.abs(mix.counts[c.id]! - c.share * mix.total)).toBeLessThanOrEqual(1);
    }
  });

  it('nothing overlaps and berths skip the rock buffer', () => {
    // Pier at x = 128 runs past the rock at (150, 70): its east row reaches towards the rock.
    const fill = fillPier(pierAt(128, 110), ctx, newMixState(classes));
    const open = fillPier(pierAt(128, 110), context(OPEN_BASIN, classes), newMixState(classes));
    expect(count(fill.berths, 'right')).toBeLessThan(count(open.berths, 'right'));
    expect(count(fill.berths, 'right')).toBeGreaterThan(0);
    for (const b of fill.berths) {
      expect(convexIntersectsRegion(b.slot, ctx.prepared.obstacleBuffer)).toBe(false);
    }
    const shapes = [...fill.berths.map((b) => b.slot), ...fill.fingers.map((f) => f.shape)];
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        expect(convexPolygonsOverlap(shapes[i]!, shapes[j]!)).toBe(false);
      }
    }
  });

  it('ids are unique and the result is deterministic', () => {
    const a = fillPier(pierAt(128, 110), ctx, newMixState(classes));
    const b = fillPier(pierAt(128, 110), ctx, newMixState(classes));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const ids = [...a.berths.map((x) => x.id), ...a.fingers.map((x) => x.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
