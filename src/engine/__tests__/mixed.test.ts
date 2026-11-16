import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { DEMO_PROJECTS } from '../demos';
import { generateLayouts } from '../generate';
import type { BoatClass, Params } from '../model';
import { mixedPattern, patternFor } from '../patterns';

const boat = (id: string): BoatClass => DEFAULT_BOAT_CLASSES.find((c) => c.id === id)!;
const P: Params = { ...DEFAULT_PARAMS, berthType: 'mixed', boatsPerBay: 2 };

describe('mixed berths: Y-booms for small boats, fingers for large (D51)', () => {
  it('is offered as a berth type; finger piers stay the default (I98)', () => {
    expect(DEFAULT_PARAMS.berthType).toBe('finger');
    expect(patternFor('mixed')).toBe(mixedPattern);
  });

  it('two small boats: each between two booms (boom | slot | boom | slot | boom)', () => {
    // 5 m boats: boom 5 m (≥ 0.8 · 5 = 4 m), 0.4 m wide; slots 2.5 m.
    const bay = mixedPattern.bay([boat('c5'), boat('c5')], 0, P);
    expect(bay.dividers).toHaveLength(3);
    for (const d of bay.dividers) {
      expect(d.kind).toBe('boom');
      expect(d.s1 - d.s0).toBeCloseTo(0.4, 9);
      expect(d.d1).toBe(5);
    }
    const slots = bay.berths.map((b) => [b.slot.s0, b.slot.s1]).flat();
    [0.4, 2.9, 3.3, 5.8].forEach((v, i) => expect(slots[i]).toBeCloseTo(v, 9));
    expect(bay.advance).toBeCloseTo(5.8, 9);
    expect(bay.footprint).toBeCloseTo(6.2, 9);
  });

  it('a boat too long for a boom: a finger pier bay with standard fingers', () => {
    // 12 m: 0.8 · 12 = 9.6 m > the longest boom (7 m) → fingers of 10 m, 0.8 m wide, two boats per bay.
    const bay = mixedPattern.bay([boat('c12'), boat('c12')], 0, P);
    expect(bay.dividers).toHaveLength(2);
    for (const d of bay.dividers) {
      expect(d.kind).toBeUndefined();
      expect(d.s1 - d.s0).toBeCloseTo(0.8, 9);
      expect(d.d1).toBe(10);
    }
    expect(bay.berths).toHaveLength(2);
    // A small boat sharing a bay with a large one: the finger bay.
    expect(mixedPattern.bay([boat('c7'), boat('c12')], 0, P).dividers.every((d) => d.kind === undefined)).toBe(true);
  });

  it('the demos get booms and fingers in the same rows, no overlaps or errors', () => {
    for (const demo of DEMO_PROJECTS) {
      const p = demo.create();
      const { layouts } = generateLayouts({ site: p.site, boatClasses: p.boatClasses, params: { ...p.params, berthType: 'mixed' }, objective: DEFAULT_OBJECTIVE });
      const top = layouts[0]!;
      expect(top.feasibility).not.toBe('geometricFail');
      const booms = top.fingers.filter((f) => f.kind === 'boom').length;
      const fingers = top.fingers.length - booms;
      expect(booms).toBeGreaterThan(0);
      expect(fingers).toBeGreaterThan(0);
      expect(top.berths.every((b) => b.type === 'mixed')).toBe(true);
    }
  });
});
