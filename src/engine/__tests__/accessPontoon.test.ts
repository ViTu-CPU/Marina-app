import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { generateLayouts } from '../generate';
import { evaluateLayout } from '../layout';
import type { AccessPontoon, BoatClass, Site } from '../model';
import { connectionLines, prepareSite } from '../site';
import { IssueCode } from '../validate';

/** The hand calculations in this file use fairway factor 1.5 (the default before DECISIONS D27). */
const PARAMS: typeof DEFAULT_PARAMS = { ...DEFAULT_PARAMS, fairwayFactor: 1.5 };
const FIVE_M_ONLY: BoatClass[] = DEFAULT_BOAT_CLASSES.map((c) => ({ ...c, share: c.id === 'c5' ? 1 : 0 }));

/** The 60 m × 80 m basin of the hand-calculated generator test, with an access pontoon. */
const basin = (pontoons: AccessPontoon[]): Site => ({
  water: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }, { x: 0, y: 80 }],
  shoreline: [{ x: 0, y: 0 }, { x: 60, y: 0 }],
  entrance: { a: { x: 0, y: 80 }, b: { x: 60, y: 80 } },
  obstacles: [],
  zones: [],
  accessPontoons: pontoons,
});

describe('access pontoon in front of a high quay wall (D21)', () => {
  /**
   * The south shore is a quay wall. A 3 m wide access pontoon runs along it with a 1 m
   * gap: centreline y = 2.5, so it covers 1 ≤ y ≤ 4. Piers start from its outer edge.
   *
   *   pier length = 80 − 4 − 8 (head clearance) = 68 m
   *   per row: 11 double bays (11 × 5.8 = 63.8 m) + one single bay (3.3 m) + closing
   *   finger 0.8 m = 67.9 m ≤ 68 m → 2 × 11 + 1 = 23 berths
   *   strategy A: 2 piers with both rows (as in the basin without pontoon) → 92 berths
   *   access pontoon: 60 m, deck 60 × 3 = 180 m²
   */
  const pontoon: AccessPontoon = { id: 'access-1', start: { x: 0, y: 2.5 }, end: { x: 60, y: 2.5 }, width: 3 };
  const site = basin([pontoon]);
  const result = generateLayouts({ site, boatClasses: FIVE_M_ONLY, params: PARAMS, objective: DEFAULT_OBJECTIVE });
  const a = result.layouts.find((l) => l.strategy === 'A');

  it('piers start at the outer edge of the pontoon', () => {
    expect(a).toBeDefined();
    expect(a!.piers).toHaveLength(2);
    for (const p of a!.piers) {
      expect(p.start.y).toBeCloseTo(4, 6);
      expect(p.end.y).toBeCloseTo(72, 6);
    }
  });

  it('strategy A: 92 berths', () => {
    expect(a!.stats.totalBerths).toBe(92);
    expect(a!.feasibility).toBe('operationalOK');
  });

  it('the pontoon counts in the pontoon metres and deck area of every layout', () => {
    for (const l of result.layouts) expect(l.stats.accessPontoonLength).toBeCloseTo(60, 6);
    expect(a!.stats.pontoonLength).toBeCloseTo(a!.stats.mainPierLength + a!.stats.fingerLength + 60, 6);
    const piersAndFingers = a!.stats.pontoonDeckArea - 180;
    expect(piersAndFingers).toBeCloseTo(2 * 68 * 3 + 2 * 2 * 13 * 4 * 0.8, 6); // piers + 52 fingers 4.0 × 0.8 m
  });

  it('no structure or berth is built on the pontoon', () => {
    for (const l of result.layouts) {
      for (const b of l.berths) for (const v of b.slot) expect(v.y).toBeGreaterThanOrEqual(4 - 1e-6);
    }
  });

  it('pier edges of the pontoon are connection lines', () => {
    expect(connectionLines(site)).toHaveLength(3); // shoreline + both long edges
  });

  it('a pontoon more than 12 m from the shore is flagged (gangway length)', () => {
    const far = basin([{ ...pontoon, start: { x: 0, y: 21.5 }, end: { x: 60, y: 21.5 } }]);
    const prepared = prepareSite(far, PARAMS);
    const evaluated = evaluateLayout(
      { id: 'L', name: 'L', strategy: 'manual', piers: [], fingers: [], berths: [], modified: false },
      prepared,
      FIVE_M_ONLY,
      PARAMS,
    );
    const issue = evaluated.issues.find((i) => i.code === IssueCode.ACCESS_PONTOON_FAR_FROM_SHORE);
    expect(issue?.elementId).toBe('access-1');
    expect(issue?.message).toContain('20.0 m');
  });

  it('a pier that overlaps the pontoon is an error', () => {
    const prepared = prepareSite(site, PARAMS);
    const evaluated = evaluateLayout(
      {
        id: 'L',
        name: 'L',
        strategy: 'manual',
        piers: [{ id: 'P1', start: { x: 30, y: 2 }, end: { x: 30, y: 40 }, width: 3, locked: false, origin: 'manual' }],
        fingers: [],
        berths: [],
        modified: true,
      },
      prepared,
      FIVE_M_ONLY,
      PARAMS,
    );
    expect(evaluated.issues.some((i) => i.code === IssueCode.OVERLAP)).toBe(true);
    expect(evaluated.feasibility).toBe('geometricFail');
  });

  it('without access pontoons nothing changes', () => {
    const plain = generateLayouts({ site: basin([]), boatClasses: FIVE_M_ONLY, params: PARAMS, objective: DEFAULT_OBJECTIVE });
    const pa = plain.layouts.find((l) => l.strategy === 'A')!;
    expect(pa.stats.totalBerths).toBe(96);
    expect(pa.stats.accessPontoonLength).toBe(0);
  });
});
