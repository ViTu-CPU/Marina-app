import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import { polygonArea } from '../geometry';
import type { BoatClass, Params } from '../model';
import { fingerPierPattern, localRectToPolygon, type LocalRect } from '../patterns';

const boat = (id: string): BoatClass => DEFAULT_BOAT_CLASSES.find((c) => c.id === id)!;
const width = (r: LocalRect) => r.s1 - r.s0;
const depth = (r: LocalRect) => r.d1 - r.d0;

/**
 * Default parameters: fingerWidth 0.8, fingerLengthRatio 0.8, beamClearance 0.5,
 * lengthClearance 0.5, boatsPerBay 2.
 */
describe('finger pier pattern (SPEC §4), hand-calculated', () => {
  it('slot length = boat length + lengthClearance', () => {
    expect(fingerPierPattern.slotLength(boat('c5'), DEFAULT_PARAMS)).toBe(5.5);
    expect(fingerPierPattern.slotLength(boat('c12'), DEFAULT_PARAMS)).toBe(12.5);
  });

  it('bay with two 5.0 × 2.0 m boats', () => {
    const bay = fingerPierPattern.bay([boat('c5'), boat('c5')], 0, DEFAULT_PARAMS);
    // Slot width 2.0 + 0.5 = 2.5; bay = finger 0.8 + 2 × 2.5 = 5.8; with closing finger 6.6.
    expect(bay.advance).toBeCloseTo(5.8, 12);
    expect(bay.footprint).toBeCloseTo(6.6, 12);
    expect(bay.berths).toHaveLength(2);
    for (const b of bay.berths) {
      expect(width(b.slot)).toBeCloseTo(2.5, 12);
      expect(depth(b.slot)).toBeCloseTo(5.5, 12);
      expect(width(b.boat)).toBeCloseTo(2.0, 12);
      expect(depth(b.boat)).toBeCloseTo(5.0, 12);
    }
    // finger | slot | slot | finger along the pier
    expect(bay.dividers[0]).toEqual({ s0: 0, s1: 0.8, d0: 0, d1: 4 });
    expect(bay.berths[0]!.slot.s0).toBeCloseTo(0.8, 12);
    expect(bay.berths[1]!.slot.s0).toBeCloseTo(3.3, 12);
    expect(bay.dividers[1]!.s0).toBeCloseTo(5.8, 12);
    expect(bay.dividers[1]!.s1).toBeCloseTo(6.6, 12);
    // Finger length 0.8 × 5.0 = 4.0.
    expect(depth(bay.dividers[1]!)).toBeCloseTo(4.0, 12);
  });

  it('the boat is centred across the slot and sits 0.2 m off the pier', () => {
    const [b] = fingerPierPattern.bay([boat('c7')], 10, DEFAULT_PARAMS).berths;
    // Slot 10.8 … 13.8 (beam 2.5 + 0.5); boat 11.05 … 13.55.
    expect(b!.slot.s0).toBeCloseTo(10.8, 12);
    expect(b!.slot.s1).toBeCloseTo(13.8, 12);
    expect(b!.boat.s0).toBeCloseTo(11.05, 12);
    expect(b!.boat.s1).toBeCloseTo(13.55, 12);
    expect(b!.boat.d0).toBeCloseTo(0.2, 12);
    expect(b!.boat.d1).toBeCloseTo(7.2, 12);
    expect(b!.boat.d1).toBeLessThanOrEqual(b!.slot.d1);
  });

  it('mixed bay: fingers follow the longer boat', () => {
    const bay = fingerPierPattern.bay([boat('c5'), boat('c12')], 0, DEFAULT_PARAMS);
    // 0.8 + (2.0 + 0.5) + (3.5 + 0.5) = 7.3
    expect(bay.advance).toBeCloseTo(7.3, 12);
    // 0.8 × 12.0 = 9.6
    expect(depth(bay.dividers[0]!)).toBeCloseTo(9.6, 12);
    expect(depth(bay.dividers[1]!)).toBeCloseTo(9.6, 12);
    expect(depth(bay.berths[0]!.slot)).toBeCloseTo(5.5, 12);
    expect(depth(bay.berths[1]!.slot)).toBeCloseTo(12.5, 12);
  });

  it('boatsPerBay = 1: a finger between every boat', () => {
    const params: Params = { ...DEFAULT_PARAMS, boatsPerBay: 1 };
    const bay = fingerPierPattern.bay([boat('c9')], 0, params);
    // 0.8 + (3.0 + 0.5) = 4.3
    expect(bay.advance).toBeCloseTo(4.3, 12);
    expect(() => fingerPierPattern.bay([boat('c9'), boat('c9')], 0, params)).toThrow();
  });

  it('with zero length clearance the boat touches the pier and fills the slot', () => {
    const params: Params = { ...DEFAULT_PARAMS, lengthClearance: 0 };
    const [b] = fingerPierPattern.bay([boat('c5')], 0, params).berths;
    expect(b!.boat.d0).toBe(0);
    expect(b!.boat.d1).toBe(b!.slot.d1);
  });
});

describe('row frame', () => {
  it('maps local rectangles to world polygons', () => {
    // Pier runs north along x = 10; this row is on its east side.
    const frame = { origin: { x: 11.5, y: 0 }, along: { x: 0, y: 1 }, outward: { x: 1, y: 0 } };
    const poly = localRectToPolygon({ s0: 2, s1: 4.5, d0: 0, d1: 5.5 }, frame);
    expect(polygonArea(poly)).toBeCloseTo(2.5 * 5.5, 9);
    expect(Math.min(...poly.map((p) => p.x))).toBeCloseTo(11.5, 12);
    expect(Math.max(...poly.map((p) => p.x))).toBeCloseTo(17, 12);
    expect(Math.min(...poly.map((p) => p.y))).toBeCloseTo(2, 12);
    expect(Math.max(...poly.map((p) => p.y))).toBeCloseTo(4.5, 12);
  });
});
