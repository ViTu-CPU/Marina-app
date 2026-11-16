import { describe, expect, it } from 'vitest';
import { DEFAULT_ANCHORING } from '../anchoring';
import { as3962Checks, gangwayClearWidth, walkwayMinWidth, yachtDraught, type As3962Input } from '../as3962';
import { DEFAULT_BOAT_CLASSES, DEFAULT_PARAMS } from '../defaults';
import type { Berth, MainPier, Site } from '../model';

const site: Site = {
  water: [{ x: -200, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: -200, y: 300 }],
  shoreline: [{ x: -200, y: 0 }, { x: 200, y: 0 }],
  entrance: { a: { x: 200, y: 260 }, b: { x: 200, y: 300 } },
  obstacles: [],
  zones: [],
};
const pier = (length: number, width = 2.7): MainPier => ({ id: 'P1', start: { x: 0, y: 4 }, end: { x: 0, y: 4 + length }, width, locked: false, origin: 'generated' });
const berths = (n: number, classId = 'c9'): Berth[] =>
  Array.from({ length: n }, (_, i) => ({ id: `B${i}`, pierId: 'P1', side: 'left', boatClassId: classId, slot: [], boat: [], removed: false, issues: [] }));
const input = (patch: Partial<As3962Input> = {}): As3962Input => ({
  layout: { piers: [pier(80)], berths: berths(20), fingers: [] },
  site,
  params: DEFAULT_PARAMS,
  classes: DEFAULT_BOAT_CLASSES,
  anchoring: DEFAULT_ANCHORING,
  freeboard: 0.56,
  waveHeight: 0,
  ...patch,
});
const codes = (x: As3962Input) => as3962Checks(x).map((n) => `${n.severity}:${n.code}`);

describe('AS 3962-2001 advisory checks (D52)', () => {
  it('tables: gangway clear width (Table 3.3), walkway width (3.5), yacht draught (Table 3.1)', () => {
    expect([2, 10, 60, 120, 121].map(gangwayClearWidth)).toEqual([0.7, 0.9, 1.2, 1.5, 1.8]);
    expect([100, 101, 200, 201].map(walkwayMinWidth)).toEqual([1.5, 1.8, 1.8, 2.4]);
    expect(yachtDraught(5)).toBe(1.5); // below the table: the 8 m value (I100)
    expect(yachtDraught(11)).toBeCloseTo(1.9, 9);
    expect(yachtDraught(12)).toBe(2.0);
  });

  it('walkway: a 1.6 m pier is too narrow beyond 100 m', () => {
    expect(codes(input({ layout: { piers: [pier(80, 1.6)], berths: berths(20), fingers: [] } }))).not.toContain('warning:AS_WALKWAY_WIDTH');
    const narrow = as3962Checks(input({ layout: { piers: [pier(120, 1.6)], berths: berths(20), fingers: [] } })).find((n) => n.code === 'AS_WALKWAY_WIDTH')!;
    expect(narrow.message).toContain('at least 1.8 m');
  });

  it('gangway: width by the berths it serves; slope at the extreme water with the quay level', () => {
    const width = as3962Checks(input()).find((n) => n.code === 'AS_GANGWAY_WIDTH')!;
    expect(width.message).toContain('serves 20 berths → clear width at least 1.2 m');
    // Without a quay level: a note asking for it.
    expect(codes(input())).toContain('info:AS_GANGWAY_SLOPE');
    // Quay 1.0 m above the design level: at the low water (0.9 m) the deck is 0.9 − 0.56 = 0.34 m
    // below the quay level's water… rise 1.0 + 0.9 − 0.56 = 1.34 m on 6 m → 1:4.4, within 1:3.5.
    expect(codes(input({ anchoring: { ...DEFAULT_ANCHORING, quayLevel: 1.0 } }))).not.toContain('warning:AS_GANGWAY_SLOPE');
    // Quay 2.0 m: rise 2.34 m → 1:2.4, too steep; a gangway of 2.34 · √(1 + 3.5²) = 8.5 m is needed.
    const steep = as3962Checks(input({ anchoring: { ...DEFAULT_ANCHORING, quayLevel: 2.0 } })).find((n) => n.code === 'AS_GANGWAY_SLOPE')!;
    expect(steep.severity).toBe('warning');
    expect(steep.message).toContain('slope 1:2.4');
    expect(steep.message).toContain('at least 8.5 m');
  });

  it('depth at the berths: yacht draught + under-keel clearance + ½ Hs at the lowest water', () => {
    // 4 m − 0.9 m = 3.1 m available; 12 m boats need 2.0 + 0.3 = 2.3 m: fine.
    expect(codes(input({ layout: { piers: [pier(80)], berths: berths(10, 'c12'), fingers: [] } }))).not.toContain('warning:AS_BERTH_DEPTH');
    // 2.5 m − 0.9 m = 1.6 m < 9 m yacht: draught 1.65 m (between 1.5 and 1.8 m) + 0.3 m = 1.95 m.
    const shallow = as3962Checks(input({ anchoring: { ...DEFAULT_ANCHORING, depth: 2.5 } })).find((n) => n.code === 'AS_BERTH_DEPTH')!;
    expect(yachtDraught(9)).toBeCloseTo(1.65, 9);
    expect(shallow.message).toContain(`9 m ${(yachtDraught(9) + 0.3).toFixed(1)} m`);
    // Rock: 0.5 m clearance; waves add half their height: 1.65 + 0.5 + 0.2 = 2.35 m > 3.0 − 0.9 = 2.1 m.
    expect(as3962Checks(input({ anchoring: { ...DEFAULT_ANCHORING, depth: 3.0, seabed: 'rock' }, waveHeight: 0.4 })).find((n) => n.code === 'AS_BERTH_DEPTH')!.message).toContain(`9 m ${(yachtDraught(9) + 0.5 + 0.2).toFixed(1)} m`);
  });

  it('berth width, entrance, fairway, ladders', () => {
    // Two boats per bay at + 0.5 m each: the AS double berth; single berths get a note.
    expect(codes(input())).not.toContain('info:AS_BERTH_WIDTH');
    expect(codes(input({ params: { ...DEFAULT_PARAMS, boatsPerBay: 1 } }))).toContain('info:AS_BERTH_WIDTH');
    // Entrance 40 m ≥ max(20, 9 + 2, 5 · 3) = 20 m; 15 m is too narrow.
    expect(codes(input())).not.toContain('warning:AS_ENTRANCE');
    expect(codes(input({ site: { ...site, entrance: { a: { x: 200, y: 285 }, b: { x: 200, y: 300 } } } }))).toContain('warning:AS_ENTRANCE');
    expect(codes(input({ params: { ...DEFAULT_PARAMS, fairwayFactor: 1.4 } }))).toContain('warning:AS_FAIRWAY');
    expect(codes(input())).toContain('info:AS_LADDERS');
    expect(codes(input({ freeboard: 0.46 }))).not.toContain('info:AS_LADDERS');
  });
});
