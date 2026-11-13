import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { RECT_BASIN_SITE } from '../demos';
import { fillPier, newMixState, rowDesign } from '../fill';
import type { Berth, MainPier, Polygon, Site } from '../model';
import { fingerPierPattern } from '../patterns';
import { prepareSite } from '../site';
import { IssueCode, validateLayout, type LayoutElements } from '../validate';

const classes = DEFAULT_BOAT_CLASSES;
const params = DEFAULT_PARAMS;

const pier = (id: string, x: number, y0: number, y1: number): MainPier => ({
  id,
  start: { x, y: y0 },
  end: { x, y: y1 },
  width: 3,
  locked: false,
  origin: 'generated',
});

/** One 60 m pier at x = 60 with both rows filled: a layout the generator would produce. */
function sampleLayout(site: Site): LayoutElements {
  const prepared = prepareSite(site, params);
  const p = pier('P1', 60, 0, 60);
  const design = rowDesign(classes, params, fingerPierPattern)!;
  const fill = fillPier(p, { prepared, classes, params, pattern: fingerPierPattern, design }, newMixState(classes));
  return { piers: [p], fingers: fill.fingers, berths: fill.berths };
}

const shift = (shape: Polygon, dx: number, dy: number): Polygon => shape.map((p) => ({ x: p.x + dx, y: p.y + dy }));
/** Distinct codes of the geometric errors (warnings are covered in operational.test.ts). */
const codes = (r: { issues: { code: string; severity: string }[] }) =>
  [...new Set(r.issues.filter((i) => i.severity === 'error').map((i) => i.code))].sort();
const validate = (layout: LayoutElements, site: Site = RECT_BASIN_SITE) =>
  validateLayout(layout, prepareSite(site, params), classes, params);

describe('geometric validation (SPEC §6)', () => {
  it('a generated pier with its berths has no geometric errors', () => {
    const layout = sampleLayout(RECT_BASIN_SITE);
    expect(layout.berths.length).toBeGreaterThan(20);
    const result = validate(layout);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.feasibility).not.toBe('geometricFail');
  });

  it('flags a slot that leaves the water area', () => {
    const layout = sampleLayout(RECT_BASIN_SITE);
    const moved: Berth = { ...layout.berths[0]!, slot: shift(layout.berths[0]!.slot, 0, -3), boat: shift(layout.berths[0]!.boat, 0, -3) };
    const result = validate({ ...layout, berths: [moved, ...layout.berths.slice(1)] });
    expect(result.feasibility).toBe('geometricFail');
    const issue = result.issues.find((i) => i.code === IssueCode.SLOT_OUTSIDE_WATER);
    expect(issue?.elementId).toBe(moved.id);
    expect(issue?.severity).toBe('error');
    // The issue is also attached to the berth itself.
    expect(result.berths[0]!.issues.map((i) => i.code)).toContain(IssueCode.SLOT_OUTSIDE_WATER);
    expect(result.berths[1]!.issues).toEqual([]);
  });

  it('flags a pier and a finger outside the water', () => {
    const layout = sampleLayout(RECT_BASIN_SITE);
    const result = validate({
      piers: [pier('P1', 60, -5, 60)],
      fingers: [{ ...layout.fingers[0]!, shape: shift(layout.fingers[0]!.shape, -300, 0) }],
      berths: [],
    });
    expect(codes(result)).toEqual([IssueCode.FINGER_OUTSIDE_WATER, IssueCode.PIER_OUTSIDE_WATER]);
  });

  it('flags a pier inside the obstacle buffer but not one just outside it', () => {
    // Rock centre (150, 70), circumscribed radius ≈ 6.12 m, buffer 2 m → clear beyond ≈ 8.12 m.
    // A 3 m wide pier at x = 140 has its east edge at 141.5: 8.5 m from the centre → clear.
    expect(codes(validate({ piers: [pier('P1', 140, 0, 120)], fingers: [], berths: [] }))).toEqual([]);
    // At x = 141 the east edge is at 142.5: 7.5 m from the centre → inside the buffer.
    const result = validate({ piers: [pier('P1', 141, 0, 120)], fingers: [], berths: [] });
    expect(codes(result)).toEqual([IssueCode.STRUCTURE_IN_OBSTACLE_BUFFER]);
    expect(result.issues.find((i) => i.severity === 'error')!.message).toContain('2.0 m');
  });

  it('structures may not enter noStructures or protected zones; slots may lie in noStructures', () => {
    const zone = (kind: 'noStructures' | 'protected' | 'noNavigation'): Site => ({
      ...RECT_BASIN_SITE,
      obstacles: [],
      zones: [{ id: 'z', kind, shape: [{ x: 40, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 40 }, { x: 40, y: 40 }] }],
    });
    const layout = sampleLayout({ ...RECT_BASIN_SITE, obstacles: [] });

    const noStructures = validate(layout, zone('noStructures'));
    expect(codes(noStructures)).toEqual([IssueCode.STRUCTURE_IN_RESTRICTED_ZONE]);
    expect(noStructures.issues.some((i) => i.elementId === 'P1')).toBe(true);

    const protectedZone = validate(layout, zone('protected'));
    expect(codes(protectedZone)).toEqual([IssueCode.SLOT_IN_PROTECTED_ZONE, IssueCode.STRUCTURE_IN_RESTRICTED_ZONE]);

    // A noNavigation zone is an operational matter, not a geometric error.
    expect(validate(layout, zone('noNavigation')).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('flags overlaps above 1 cm and ignores touching elements', () => {
    const a = pier('P1', 60, 0, 60);
    // Second pier 3.0 m to the east: edges touch exactly.
    expect(codes(validate({ piers: [a, pier('P2', 63, 0, 60)], fingers: [], berths: [] }))).toEqual([]);
    // 2.995 m: overlap of 5 mm is within the tolerance.
    expect(codes(validate({ piers: [a, pier('P2', 62.995, 0, 60)], fingers: [], berths: [] }))).toEqual([]);
    // 2.5 m: overlap of 0.5 m.
    const result = validate({ piers: [a, pier('P2', 62.5, 0, 60)], fingers: [], berths: [] });
    expect(codes(result)).toEqual([IssueCode.OVERLAP]);
    expect(result.issues[0]!.message).toContain('0.50 m');
    expect(result.feasibility).toBe('geometricFail');
  });

  it('flags a boat that does not fit in its slot', () => {
    const layout = sampleLayout(RECT_BASIN_SITE);
    const b = layout.berths[0]!;
    const result = validate({ ...layout, berths: [{ ...b, boat: shift(b.boat, 0.5, 0) }, ...layout.berths.slice(1)] });
    expect(codes(result)).toEqual([IssueCode.BOAT_OUTSIDE_SLOT]);
  });

  it('removed berths are not checked', () => {
    const layout = sampleLayout(RECT_BASIN_SITE);
    const bad: Berth = { ...layout.berths[0]!, slot: shift(layout.berths[0]!.slot, 0, -3), removed: true };
    expect(validate({ ...layout, berths: [bad, ...layout.berths.slice(1)] }).issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});
