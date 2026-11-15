import { describe, expect, it } from 'vitest';
import { DEMO_PROJECTS } from '../demos';
import { generateLayouts } from '../generate';
import { distance } from '../geometry';
import { combinationLength, jointPositions, moduleCombination, PIER_SERIES, pierModules } from '../modules';

const PREMIER = [19.9, 16.05, 12.2];

describe('pier modules (D44, I89)', () => {
  it('Marinetek series with the brochure module lengths; Premier 2700 is the default', () => {
    expect(PIER_SERIES.find((s) => s.id === 'premier2700')).toEqual({ id: 'premier2700', name: 'Marinetek Premier 2700', width: 2.7, lengths: PREMIER });
    expect(PIER_SERIES.find((s) => s.id === 'free')!.lengths).toEqual([]);
  });

  it('the longest combination that fits, fewer and longer modules first', () => {
    // 45 m: 44.3 m beats 2 × 19.9 = 39.8 m; of the two 44.3 m combinations (2 × 16.05 + 12.2 and
    // 19.9 + 2 × 12.2) the one with the longest module.
    expect(moduleCombination(45, 45, PREMIER)).toEqual([19.9, 12.2, 12.2]);
    // 40 m: 2 × 19.9 = 39.8 m.
    expect(moduleCombination(40, 40, PREMIER)).toEqual([19.9, 19.9]);
    // 100 m: 5 × 19.9 = 99.5 m (Iisalmi: 5 × 20 m).
    expect(combinationLength(moduleCombination(100, 100, PREMIER)!)).toBeCloseTo(99.5, 9);
    // 32.5 m: 16.05 + 16.05 = 32.1 m; 19.9 + 12.2 = 32.1 m too → fewer modules tie, the longer first.
    expect(moduleCombination(32.5, 32.5, PREMIER)).toEqual([19.9, 12.2]);
    // Shorter than one module: none.
    expect(moduleCombination(10, 10, PREMIER)).toBeNull();
  });

  it('with target counts: the shortest combination that holds the berths within the available length', () => {
    // Berths need 25 m, the site allows 60 m: 12.2 + 12.2 = 24.4 < 25, so 19.9 + 12.2 = 32.1? No: 16.05 + 12.2 = 28.25 m.
    expect(moduleCombination(25, 60, PREMIER)).toEqual([16.05, 12.2]);
    // When nothing that long fits: the longest within the available length.
    expect(moduleCombination(25, 20, PREMIER)).toEqual([19.9]);
  });

  it('modules and joints of a built pier (longest at the shore)', () => {
    expect(pierModules(44.3, PREMIER)).toEqual([19.9, 12.2, 12.2]);
    expect(jointPositions(44.3, PREMIER).map((x) => Math.round(x * 100) / 100)).toEqual([19.9, 32.1]);
    expect(jointPositions(99.5, PREMIER).map((x) => Math.round(x * 10) / 10)).toEqual([19.9, 39.8, 59.7, 79.6]);
    // A manually set length: the covering combination.
    expect(pierModules(30, PREMIER)).toEqual([19.9, 12.2]);
    expect(pierModules(30, [])).toEqual([]);
  });

  it('every generated pier of the demos is a whole number of modules', () => {
    for (const demo of DEMO_PROJECTS) {
      const p = demo.create();
      const { layouts } = generateLayouts({ site: p.site, boatClasses: p.boatClasses, params: p.params, objective: p.objective });
      expect(layouts.length).toBeGreaterThanOrEqual(3);
      for (const l of layouts) {
        for (const pier of l.piers) {
          const length = distance(pier.start, pier.end);
          const modules = pierModules(length, PREMIER);
          expect(Math.abs(combinationLength(modules) - length)).toBeLessThan(0.05);
          expect(pier.width).toBe(2.7);
        }
      }
    }
  });
});
