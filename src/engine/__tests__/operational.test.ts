import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { RECT_BASIN_SITE } from '../demos';
import { buildFairways } from '../fairways';
import { fillPier, newMixState, rowDesign } from '../fill';
import { isCounterClockwise, polygonArea } from '../geometry';
import type { MainPier, Polygon, Site } from '../model';
import { fingerPierPattern } from '../patterns';
import { layoutRows } from '../rows';
import { prepareSite } from '../site';
import { IssueCode, validateLayout, type LayoutElements } from '../validate';

const classes = DEFAULT_BOAT_CLASSES;
const params = DEFAULT_PARAMS;
const OPEN_BASIN: Site = { ...RECT_BASIN_SITE, obstacles: [] };

const pier = (id: string, x: number, y0: number, y1: number): MainPier => ({
  id,
  start: { x, y: y0 },
  end: { x, y: y1 },
  width: 3,
  locked: false,
  origin: 'generated',
});

/** Piers filled independently in an open basin, as if no other pier existed. */
function layoutOf(piers: MainPier[], site: Site = OPEN_BASIN): LayoutElements {
  const prepared = prepareSite(site, params);
  const design = rowDesign(classes, params, fingerPierPattern)!;
  const mix = newMixState(classes);
  const layout: LayoutElements = { piers, fingers: [], berths: [] };
  for (const p of piers) {
    const fill = fillPier(p, { prepared, classes, params, pattern: fingerPierPattern, design }, mix);
    layout.fingers.push(...fill.fingers);
    layout.berths.push(...fill.berths);
  }
  return layout;
}

const validate = (layout: LayoutElements, site: Site = OPEN_BASIN) =>
  validateLayout(layout, prepareSite(site, params), classes, params);
const codes = (r: { issues: { code: string }[] }) => [...new Set(r.issues.map((i) => i.code))].sort();
const shiftAll = (layout: LayoutElements, dx: number, dy: number): LayoutElements => {
  const move = (shape: Polygon) => shape.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return {
    piers: layout.piers.map((p) => ({ ...p, start: { x: p.start.x + dx, y: p.start.y + dy }, end: { x: p.end.x + dx, y: p.end.y + dy } })),
    fingers: layout.fingers.map((f) => ({ ...f, shape: move(f.shape) })),
    berths: layout.berths.map((b) => ({ ...b, slot: move(b.slot), boat: move(b.boat) })),
  };
};

/**
 * Default mix → row depth 12.5 m, fairway 18 m, pier pitch 46 m (see fill.test.ts).
 * Piers at x = 60 and x = 106, 122 m long (140 m basin − 18 m head clearance).
 */
const TWO_PIERS = [pier('P1', 60, 0, 122), pier('P2', 106, 0, 122)];

describe('operational validation (SPEC §6)', () => {
  it('two piers at the design pitch meet all configured constraints', () => {
    const layout = layoutOf(TWO_PIERS);
    expect(layout.berths.length).toBeGreaterThan(100);
    const result = validate(layout);
    expect(result.issues).toEqual([]);
    expect(result.feasibility).toBe('operationalOK');
  });

  it('piers 4 m too close: the fairway between them is obstructed', () => {
    const layout = layoutOf([pier('P1', 60, 0, 122), pier('P2', 102, 0, 122)]);
    const result = validate(layout);
    // Pier edges are 39 m apart instead of 43 m. Long slots (12.5 m) on the far side block
    // the 30.5 m corridor of the berths facing them. Berths facing short slots still have
    // their corridor, but the 14 m gap between the row blocks is too narrow to pass through.
    expect(codes(result)).toEqual([IssueCode.FAIRWAY_OBSTRUCTED, IssueCode.NOT_CONNECTED_TO_ENTRANCE]);
    expect(result.feasibility).toBe('geometricOK');
    expect(result.issues.every((i) => i.severity === 'warning')).toBe(true);
    const obstructed = result.issues.filter((i) => i.code === IssueCode.FAIRWAY_OBSTRUCTED);
    expect(obstructed[0]!.message).toContain('18.0 m');
    // Only the facing rows are affected: P1 east (right) and P2 west (left).
    const flagged = new Set(obstructed.map((i) => i.elementId));
    for (const b of layout.berths) {
      const facing = (b.pierId === 'P1' && b.side === 'right') || (b.pierId === 'P2' && b.side === 'left');
      if (!facing) expect(flagged.has(b.id)).toBe(false);
    }
    expect(flagged.size).toBeGreaterThan(10);
  });

  it('a row pushed too close to the basin wall has no room for its fairway', () => {
    // P1's west row needs 12.5 + 18 = 30.5 m from the pier edge (x = 58.5): 28 m to spare.
    // Moving everything 30 m west leaves 28.5 m beside the pier edge.
    const result = validate(shiftAll(layoutOf([TWO_PIERS[0]!]), -30, 0));
    expect(codes(result)).toEqual([IssueCode.FAIRWAY_OUTSIDE_WATER]);
    expect(result.berths.filter((b) => b.issues.length > 0).every((b) => b.side === 'left')).toBe(true);
  });

  it('a no-navigation zone in the fairway or over a slot is reported', () => {
    const site: Site = {
      ...OPEN_BASIN,
      // In the fairway east of P1 (x 74 … 92), between y = 40 and 60.
      zones: [{ id: 'z', kind: 'noNavigation', shape: [{ x: 80, y: 40 }, { x: 86, y: 40 }, { x: 86, y: 60 }, { x: 80, y: 60 }] }],
    };
    const layout = layoutOf([TWO_PIERS[0]!]);
    const result = validate(layout, site);
    expect(codes(result)).toEqual([IssueCode.FAIRWAY_IN_RESTRICTED_ZONE]);
    expect(result.feasibility).toBe('geometricOK');

    const overSlots: Site = {
      ...OPEN_BASIN,
      zones: [{ id: 'z', kind: 'noNavigation', shape: [{ x: 62, y: 40 }, { x: 70, y: 40 }, { x: 70, y: 60 }, { x: 62, y: 60 }] }],
    };
    expect(codes(validate(layout, overSlots))).toContain(IssueCode.SLOT_IN_NO_NAVIGATION_ZONE);
  });

  it('an obstacle in the fairway is reported', () => {
    const layout = layoutOf([TWO_PIERS[0]!]);
    const site: Site = {
      ...OPEN_BASIN,
      obstacles: [{ id: 'r', kind: 'rock', shape: [{ x: 82, y: 50 }, { x: 84, y: 50 }, { x: 84, y: 52 }, { x: 82, y: 52 }] }],
    };
    expect(codes(validate(layout, site))).toEqual([IssueCode.FAIRWAY_IN_OBSTACLE_BUFFER]);
  });

  it('a pier that does not start at the shoreline is reported', () => {
    const result = validate({ piers: [pier('P1', 60, 5, 100)], fingers: [], berths: [] });
    expect(codes(result)).toEqual([IssueCode.PIER_NOT_CONNECTED_TO_SHORE]);
    expect(result.issues[0]!.elementId).toBe('P1');
    // Within the 0.5 m tolerance it counts as connected.
    expect(validate({ piers: [pier('P1', 60, 0.4, 100)], fingers: [], berths: [] }).issues).toEqual([]);
  });

  it('rows behind a pier that spans the whole basin are cut off from the entrance', () => {
    // The entrance is in the north-east corner. A pier from the south wall to the north
    // wall leaves no way around its head, so its west row cannot be reached.
    const p = pier('P1', 110, 0, 140);
    const result = validate(layoutOf([p]));
    const cutOff = result.issues.filter((i) => i.code === IssueCode.NOT_CONNECTED_TO_ENTRANCE);
    expect(cutOff).toHaveLength(1);
    expect(cutOff[0]!.elementId).toBe('P1');
    expect(cutOff[0]!.message).toContain('left side');
    expect(result.feasibility).toBe('geometricOK');
  });

  it('a head clearance narrower than the fairway width cuts the far rows off', () => {
    // 140 − 130 = 10 m behind the pier head, but 18 m is required.
    const tight = validate(layoutOf([pier('P1', 110, 0, 130)]));
    expect(codes(tight)).toEqual([IssueCode.NOT_CONNECTED_TO_ENTRANCE]);
    // 140 − 122 = 18 m: exactly enough.
    expect(validate(layoutOf([pier('P1', 110, 0, 122)])).issues).toEqual([]);
  });
});

describe('fairway polygons (SPEC §5.6)', () => {
  const prepared = prepareSite(OPEN_BASIN, params);

  it('two piers: one connected fairway network of the expected area', () => {
    const layout = layoutOf(TWO_PIERS);
    const rows = layoutRows(layout.piers, layout.fingers, layout.berths, classes, params);
    expect(rows).toHaveLength(4);
    const fairways = buildFairways(layout.piers, rows, prepared);
    expect(fairways).toHaveLength(1);
    expect(fairways[0]!.requiredWidth).toBe(18);
    expect(isCounterClockwise(fairways[0]!.shape)).toBe(true);
    // Row strips: x 28–46, 74–92 (shared by both piers), 120–138, each 18 m wide and
    // 122 m long → 3 × 18 × 122 = 6588 m². Head strip: x 28–138, y 122–140 → 110 × 18 = 1980 m².
    expect(polygonArea(fairways[0]!.shape)).toBeCloseTo(6588 + 1980, 3);
  });

  it('is clipped by obstacle buffers and never overlaps slots or piers', () => {
    const site: Site = { ...OPEN_BASIN, obstacles: [{ id: 'r', kind: 'rock', shape: [{ x: 82, y: 50 }, { x: 84, y: 50 }, { x: 84, y: 52 }, { x: 82, y: 52 }] }] };
    const layout = layoutOf(TWO_PIERS);
    const rows = layoutRows(layout.piers, layout.fingers, layout.berths, classes, params);
    const fairways = buildFairways(layout.piers, rows, prepareSite(site, params));
    expect(fairways).toHaveLength(1);
    // The rock with its 2 m buffer (a rounded 6 × 6 m square, ≈ 4 + 16 + π·4 ≈ 32.6 m²) is a hole.
    expect(fairways[0]!.holes).toHaveLength(1);
    const holeArea = polygonArea(fairways[0]!.holes[0]!);
    expect(holeArea).toBeGreaterThan(32.4);
    expect(holeArea).toBeLessThan(32.6);
  });

  it('no rows, no fairways', () => {
    expect(buildFairways([pier('P1', 60, 0, 100)], [], prepared)).toEqual([]);
  });
});
