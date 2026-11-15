import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS } from '../demos';
import { fillPierSide, type EditContext } from '../edit';
import { generateLayouts } from '../generate';
import { convexInsideRegion, convexPolygonsOverlap } from '../geometry';
import type { BoatClass, Layout, Params } from '../model';
import { yBoomDivider, yBoomPattern } from '../patterns/yBoom';
import { pierPolygon, prepareSite } from '../site';

const boat = (id: string): BoatClass => DEFAULT_BOAT_CLASSES.find((c) => c.id === id)!;
const Y: Params = { ...DEFAULT_PARAMS, berthType: 'yBoom' };
const width = (r: { s0: number; s1: number }) => r.s1 - r.s0;
const depth = (r: { d0: number; d1: number }) => r.d1 - r.d0;

describe('Y-boom berths (D34), hand-calculated', () => {
  it('a boom where a standard boom is long enough, else a finger', () => {
    // 5 m: 0.8 × 5 = 4.0 → boom 5 m (≤ slot 5.5); 7 m: 5.6 → boom 6 m.
    expect(yBoomDivider(boat('c5'), Y)).toEqual({ kind: 'boom', length: 5, width: 0.4 });
    expect(yBoomDivider(boat('c7'), Y)).toEqual({ kind: 'boom', length: 6, width: 0.4 });
    // 9 m: 7.2 > the longest boom (7 m) → finger 8 m, 0.8 m wide; 12 m: 9.6 → finger 10 m.
    expect(yBoomDivider(boat('c9'), Y)).toEqual({ kind: 'finger', length: 8, width: 0.8 });
    expect(yBoomDivider(boat('c12'), Y)).toEqual({ kind: 'finger', length: 10, width: 0.8 });
  });

  it('one boat per bay: boom 0.4 | slot 2.5 | boom 0.4', () => {
    expect(yBoomPattern.boatsPerBay(Y)).toBe(1);
    const bay = yBoomPattern.bay([boat('c5')], 0, Y);
    expect(bay.advance).toBeCloseTo(2.9, 12); // 0.4 + 2.0 + 0.5
    expect(bay.footprint).toBeCloseTo(3.3, 12);
    expect(bay.dividers).toHaveLength(2);
    for (const d of bay.dividers) {
      expect(width(d)).toBeCloseTo(0.4, 12);
      expect(depth(d)).toBeCloseTo(5, 12);
      expect(d.kind).toBe('boom');
    }
    expect(depth(bay.berths[0]!.slot)).toBeCloseTo(5.5, 12);
    expect(() => yBoomPattern.bay([boat('c5'), boat('c5')], 0, Y)).toThrow();
  });
});

describe('Y-boom layouts on the demo projects', () => {
  for (const demo of DEMO_PROJECTS) {
    const project = demo.create();
    const params: Params = { ...project.params, berthType: 'yBoom' };
    const result = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params, objective: project.objective });
    const prepared = prepareSite(project.site, params);

    it(`${demo.id}: berths of type yBoom with booms for small and fingers for large boats`, () => {
      expect(result.layouts.length).toBeGreaterThan(0);
      const best = result.layouts[0]!;
      expect(best.berths.length).toBeGreaterThan(0);
      for (const b of best.berths) expect(b.type).toBe('yBoom');
      expect(best.fingers.some((f) => f.kind === 'boom')).toBe(true);
      expect(best.fingers.some((f) => f.kind === undefined)).toBe(true);
    });

    it(`${demo.id}: no overlaps between piers, booms, fingers and slots; everything in the water`, () => {
      for (const layout of result.layouts) {
        const shapes = [
          ...layout.piers.map((p) => pierPolygon(p.start, p.end, p.width)),
          ...layout.fingers.map((f) => f.shape),
          ...layout.berths.map((b) => b.slot),
        ];
        for (const s of shapes) expect(convexInsideRegion(s, prepared.water)).toBe(true);
        let overlaps = 0;
        for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) if (convexPolygonsOverlap(shapes[i]!, shapes[j]!)) overlaps++;
        expect(overlaps).toBe(0);
        expect(layout.stats.issueCounts.error).toBe(0);
      }
    });
  }

  it('one side of a finger-pier layout refilled with Y-boom berths', () => {
    const project = DEMO_PROJECTS[0]!.create();
    const layout = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params: project.params, objective: DEFAULT_OBJECTIVE }).layouts[0]!;
    const ctx: EditContext = { prepared: prepareSite(project.site, project.params), classes: project.boatClasses, params: project.params };
    const pier = layout.piers[0]!;
    const filled: Layout = fillPierSide(layout, pier.id, 'left', { classId: 'c7', emptyLength: 0, berthType: 'yBoom' }, ctx);
    const left = filled.berths.filter((b) => b.pierId === pier.id && b.side === 'left');
    expect(left.length).toBeGreaterThan(0);
    for (const b of left) expect(b.type).toBe('yBoom');
    const right = filled.berths.filter((b) => b.pierId === pier.id && b.side === 'right');
    for (const b of right) expect(b.type).toBeUndefined();
    expect(filled.stats.issueCounts.error).toBe(0);
  });
});
