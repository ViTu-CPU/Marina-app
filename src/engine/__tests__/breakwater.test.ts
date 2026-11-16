import { describe, expect, it } from 'vitest';
import { attenuation, BREAKWATERS, breakwaterJoints, breakwaterModules, breakwaterProductOf, breakwaterProposal, breakwatersOf, defaultBreakwaterProduct, weightPerMetre } from '../breakwater';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { RECT_BASIN_SITE } from '../demos';
import { generateLayouts } from '../generate';
import { pierPolygon, prepareSite } from '../site';
import { convexInsideRegion } from '../geometry';
import type { WaveAssessment, WaveCheck } from '../waves';

const bw = (id: string) => BREAKWATERS.find((b) => b.id === id)!;
const check = (hm0: number, wavelength: number, limit: number, ok = hm0 <= limit): WaveCheck => ({
  event: 'fiftyYear',
  heading: 'head',
  limit,
  ok,
  waves: { u10: 20, averagingS: 3600, ustar: 0.8, hm0, tp: 3, wavelength, limit: 'fetch' },
});
const assessment = (checks: WaveCheck[]) => ({ checks }) as unknown as WaveAssessment;

describe('Marinetek floating breakwaters (D48)', () => {
  it('products from the brochures, lightest per metre first', () => {
    expect(BREAKWATERS.map((b) => b.id)).toEqual(['3300BR', '3300K', '3800BR', '4300K', '5300K']);
    const w = BREAKWATERS.map(weightPerMetre);
    expect([...w].sort((a, b) => a - b)).toEqual(w);
    expect(weightPerMetre(bw('3300BR'))).toBeCloseTo(26.0 / 19.9, 9);
    expect(bw('3800BR').modules.map((m) => m.code)).toEqual(['M3816BR', 'M3820BR']);
  });

  it('attenuation: the smaller of the values read at Hs and at L; null beyond the curve', () => {
    // 3300BR at Hs 0.33 m: between (0.32, 74.2 %) and (0.36, 72.5 %) → 73.775 %; at L 4.6 m: between
    // (4.0, 76.1 %) and (4.8, 74.2 %) → 74.675 %. The smaller is used.
    expect(attenuation(bw('3300BR'), 0.33, 4.6)).toBeCloseTo(0.73775, 6);
    // Below the start of the curve: its first value.
    expect(attenuation(bw('3300BR'), 0.1, 1)).toBeCloseTo(0.849, 6);
    // Beyond the end (Hs 0.97 m, L 17.8 m for the 3300): not shown by the brochure.
    expect(attenuation(bw('3300BR'), 1.0, 10)).toBeNull();
    expect(attenuation(bw('3300BR'), 0.5, 18)).toBeNull();
  });

  it('nothing fails: no proposal', () => {
    expect(breakwaterProposal(null)).toBeNull();
    expect(breakwaterProposal(assessment([check(0.2, 4, 0.3)]))).toBeNull();
  });

  it('short waves: the lightest type is enough', () => {
    // Hs 0.33 m, L 4.6 m against 0.30 m: 0.33 · (1 − 0.738) = 0.087 m.
    const p = breakwaterProposal(assessment([check(0.33, 4.6, 0.3)]))!;
    expect(p.proposed!.id).toBe('3300BR');
    expect(p.evaluations[0]!.checks[0]!.transmitted).toBeCloseTo(0.33 * (1 - 0.73775), 6);
  });

  it('a 1.0 m, 20 m wave against 0.6 m: 3300BR beyond its curve, 3300K too weak, 3800BR enough but beyond 18 m, 4300K proposed', () => {
    const p = breakwaterProposal(assessment([check(1.0, 20, 0.6)]))!;
    const ev = (id: string) => p.evaluations.find((e) => e.product.id === id)!;
    expect(ev('3300BR').checks[0]!.transmitted).toBeNull();
    expect(ev('3300BR').ok).toBe(false);
    // 3300K: Ac min(37.9 %, 27.9 %) → 0.721 m.
    expect(ev('3300K').checks[0]!.transmitted).toBeCloseTo(1 - 0.27888, 3);
    expect(ev('3300K').ok).toBe(false);
    // 3800BR: min(49.3 %, 40.4 %) → 0.596 m ≤ 0.6 m, but the brochure: "work best when the sea wave length is less than 18 m".
    expect(ev('3800BR').ok).toBe(true);
    expect(ev('3800BR').beyondBestWavelength).toBe(true);
    // 4300K: min(63.8 %, 60.5 %) → 0.395 m, keels work best below 26 m.
    expect(ev('4300K').checks[0]!.transmitted).toBeCloseTo(1 - 0.60508, 3);
    expect(p.proposed!.id).toBe('4300K');
  });

  it('waves longer than every curve: none proposed', () => {
    const p = breakwaterProposal(assessment([check(1.2, 30, 0.6)]))!;
    expect(p.proposed).toBeNull();
    expect(p.evaluations.every((e) => !e.ok)).toBe(true);
  });
});

describe('breakwaters drawn by the user (D58)', () => {
  it('type of a drawn breakwater: the given one, an unknown id the lightest; a new one the proposal, else the lightest', () => {
    expect(breakwaterProductOf({ product: '4300K' }).width).toBe(bw('4300K').width);
    expect(breakwaterProductOf({ product: 'x' }).id).toBe('3300BR');
    expect(defaultBreakwaterProduct(null)).toBe('3300BR');
    expect(defaultBreakwaterProduct({ proposed: bw('3800BR'), evaluations: [] })).toBe('3800BR');
    expect(defaultBreakwaterProduct({ proposed: null, evaluations: [] })).toBe('3300BR');
    expect(breakwatersOf({ ...RECT_BASIN_SITE, breakwaters: [{ id: 'b', start: { x: 1, y: 1 }, end: { x: 1, y: 1 }, product: '3300BR' }] })).toEqual([]);
  });

  it('modules of a drawn breakwater: the combination nearest to the drawn length', () => {
    const codes = (length: number) => breakwaterModules(length, bw('3300BR')).map((m) => m.code);
    // 19.90 and 16.05 m modules.
    expect(codes(60)).toEqual(['M3320BR', 'M3320BR', 'M3320BR']); // 59.7 m
    expect(codes(36)).toEqual(['M3320BR', 'M3316BR']); // 35.95 m
    expect(codes(10)).toEqual(['M3316BR']); // shorter than one module: the nearest single one
    expect(codes(0)).toEqual([]);
    expect(breakwaterJoints(60, bw('3300BR'))).toEqual([19.9, 39.8]);
  });

  it('piers, boats and fairways keep the obstacle clearance from a breakwater', () => {
    // Across the rectangular basin at y = 100 from x = 0 to 150; the piers run north from y = 0.
    const site = { ...RECT_BASIN_SITE, obstacles: [], breakwaters: [{ id: 'breakwater-1', start: { x: 0, y: 100 }, end: { x: 150, y: 100 }, product: '3800BR' }] };
    const params = { ...DEFAULT_PARAMS };
    const prepared = prepareSite(site, params);
    const footprint = pierPolygon(site.breakwaters[0]!.start, site.breakwaters[0]!.end, bw('3800BR').width);
    expect(convexInsideRegion(footprint, prepared.structureRegion)).toBe(false);
    expect(convexInsideRegion(footprint, prepared.navigableRegion)).toBe(false);
    const result = generateLayouts({ site, boatClasses: DEFAULT_BOAT_CLASSES, params, objective: DEFAULT_OBJECTIVE });
    expect(result.layouts.length).toBeGreaterThan(0);
    const edge = 100 - bw('3800BR').width / 2 - params.obstacleClearance;
    let under = 0;
    for (const layout of result.layouts) {
      for (const pier of layout.piers) {
        const xs = [pier.start.x, pier.end.x];
        if (Math.max(...xs) < 150 - 1) {
          under++;
          expect(Math.max(pier.start.y, pier.end.y)).toBeLessThanOrEqual(edge + 1e-6);
        }
      }
    }
    // Piers under the breakwater exist (without it they run on to about y = 128).
    expect(under).toBeGreaterThan(0);
  });
});
