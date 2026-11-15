import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS } from '../demos';
import { movePier, setBerthClass, type EditContext } from '../edit';
import { generateLayouts } from '../generate';
import { convexInsideRegion, convexPolygonsOverlap, pointInRing } from '../geometry';
import type { BoatClass, Params } from '../model';
import { sternBuoyDistance, sternBuoyPattern } from '../patterns/sternBuoy';
import { pierPolygon, prepareSite } from '../site';

const boat = (id: string): BoatClass => DEFAULT_BOAT_CLASSES.find((c) => c.id === id)!;
const SB: Params = { ...DEFAULT_PARAMS, berthType: 'sternBuoy', waterDepth: 4 };

describe('stern-buoy berths (D35), hand-calculated', () => {
  it('buoy at boat length + water depth; the slot reaches beyond it', () => {
    // 5 m boat in 4 m of water: buoy 9.0 m from the pier edge; slot 9.0 + 0.5 = 9.5 m.
    expect(sternBuoyDistance(boat('c5'), SB)).toBe(9);
    expect(sternBuoyPattern.slotLength(boat('c5'), SB)).toBe(9.5);
    // 12 m boat: 16.0 m and 16.5 m.
    expect(sternBuoyPattern.slotLength(boat('c12'), SB)).toBe(16.5);
  });

  it('one boat per bay, side by side, no fingers', () => {
    expect(sternBuoyPattern.boatsPerBay(SB)).toBe(1);
    const bay = sternBuoyPattern.bay([boat('c5')], 0, SB);
    expect(bay.dividers).toEqual([]);
    expect(bay.advance).toBeCloseTo(2.5, 12); // 2.0 + 0.5
    expect(bay.footprint).toBeCloseTo(2.5, 12);
    expect(bay.berths[0]!.buoy).toEqual({ s: 1.25, d: 9 });
    expect(bay.berths[0]!.boat).toEqual({ s0: 0.25, s1: 2.25, d0: 0.2, d1: 5.2 });
  });
});

describe('stern-buoy layouts on the demo projects', () => {
  for (const demo of DEMO_PROJECTS) {
    const project = demo.create();
    const params: Params = { ...project.params, berthType: 'sternBuoy', waterDepth: project.anchoring.depth };
    const result = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params, objective: project.objective });
    const prepared = prepareSite(project.site, params);

    it(`${demo.id}: every berth has its buoy inside its slot, no fingers, no overlaps, no errors`, () => {
      expect(result.layouts.length).toBeGreaterThan(0);
      for (const layout of result.layouts) {
        expect(layout.fingers).toEqual([]);
        for (const b of layout.berths) {
          expect(b.type).toBe('sternBuoy');
          expect(b.buoy).toBeDefined();
          expect(pointInRing(b.buoy!, b.slot)).toBe(true);
        }
        const shapes = [...layout.piers.map((p) => pierPolygon(p.start, p.end, p.width)), ...layout.berths.map((b) => b.slot)];
        for (const s of shapes) expect(convexInsideRegion(s, prepared.water)).toBe(true);
        let overlaps = 0;
        for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) if (convexPolygonsOverlap(shapes[i]!, shapes[j]!)) overlaps++;
        expect(overlaps).toBe(0);
        expect(layout.stats.issueCounts.error).toBe(0);
      }
    });
  }

  it('moving a pier moves its buoys; a new class moves the buoy with the boat length', () => {
    const project = DEMO_PROJECTS[0]!.create();
    const params: Params = { ...project.params, berthType: 'sternBuoy', waterDepth: 4 };
    const layout = generateLayouts({ site: project.site, boatClasses: project.boatClasses, params, objective: project.objective }).layouts[0]!;
    const ctx: EditContext = { prepared: prepareSite(project.site, params), classes: project.boatClasses, params };
    const pier = layout.piers.find((p) => !p.locked)!;
    const berth = layout.berths.find((b) => b.pierId === pier.id)!;
    const moved = movePier(layout, pier.id, { x: 0, y: 1 }, ctx);
    const after = moved.berths.find((b) => b.id === berth.id)!;
    expect(after.buoy!.y - berth.buoy!.y).toBeCloseTo(1, 6);
    expect(after.buoy!.x - berth.buoy!.x).toBeCloseTo(0, 6);
    // From its class to the 12 m class: the buoy moves out by the difference in boat length.
    const from = project.boatClasses.find((c) => c.id === berth.boatClassId)!;
    const changed = setBerthClass(layout, berth.id, 'c12', ctx).berths.find((b) => b.id === berth.id)!;
    const shift = Math.hypot(changed.buoy!.x - berth.buoy!.x, changed.buoy!.y - berth.buoy!.y);
    expect(shift).toBeGreaterThanOrEqual(12 - from.length - 1e-6);
  });
});
