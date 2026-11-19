/**
 * D64: the acceptance tests of docs/ANKKUROINTI_MITOITUS_SPEC.md, Appendix B (values computed with
 * the reference code of Appendix A, Node 22; tolerance ±1 %).
 */
import { describe, expect, it } from 'vitest';
import {
  catenary,
  chainWeight,
  checkAnchoring,
  distributeToLegs,
  environmentalLoads,
  requiredAnchorMassFriction,
  submergedWeight_kN,
  vesselWindArea,
  windPressure,
  type MooringInput,
  type MooringLeg,
} from '../mooring';

/** |actual − expected| ≤ 1 % of expected (absolute 0.01 for values near zero). */
const near = (actual: number, expected: number, what = '') => {
  const tol = Math.max(Math.abs(expected) * 0.01, 0.01);
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
};

const five = Array.from({ length: 5 }, () => ({ loa: 10, type: 'motor' as const }));
const common = {
  pontoon: { length: 20, width: 2.4, freeboard: 0.5, draft: 0.4 },
  berths: { sideA: five, sideB: five },
  env: { windSpeed: 25, waveLineLoad: 0, currentSpeed: 0, waterDensity: 1025 },
};

describe('Appendix B, test 1: loads (environmentalLoads)', () => {
  const loads = environmentalLoads(common.pontoon, common.berths, common.env);
  it('qz = 0.375 kPa', () => near(loads.q, 0.375, 'qz'));
  it('across: wind 24.83, wave 40.00, ULS 84.83 kN', () => {
    for (const id of ['perp+', 'perp-'] as const) {
      const c = loads.cases.find((x) => x.id === id)!;
      near(c.wind, 24.83, `${id} wind`);
      near(c.wave, 40.0, `${id} wave`);
      near(c.F_uls, 84.83, `${id} ULS`);
    }
  });
  it('along: wind 44.46, wave 4.80, ULS 51.66 kN', () => {
    for (const id of ['par+', 'par-'] as const) {
      const c = loads.cases.find((x) => x.id === id)!;
      near(c.wind, 44.46, `${id} wind`);
      near(c.wave, 4.8, `${id} wave`);
      near(c.F_uls, 51.66, `${id} ULS`);
    }
  });
  it('AS 3962 Table 4.4 areas, interpolated; end values outside 8–50 m with a flag', () => {
    expect(vesselWindArea('motor', 10)).toEqual({ head: 7, beam: 22, extrapolated: false });
    expect(vesselWindArea('yacht', 11)).toEqual({ head: 5.5, beam: 17.5, extrapolated: false });
    expect(vesselWindArea('motor', 6)).toEqual({ head: 5, beam: 16, extrapolated: true });
    expect(windPressure(20)).toBeCloseTo(0.24, 12);
  });
  it('a minimum wave load below 2 kN/m and an ice load give warnings', () => {
    const l = environmentalLoads(common.pontoon, common.berths, { ...common.env, iceLineLoad: 30 }, { waveMin: 1 });
    expect(l.warnings.map((w) => w.code)).toEqual(['WAVE_MIN_BELOW_AS3962', 'ICE_LOAD_GIVEN']);
    expect(l.ice).toEqual({ F_perp: 600, F_par: 72 });
  });
});

describe('Appendix B, test 2: catenary (22 mm chain without kg/m, h = 6 m)', () => {
  const cw = chainWeight({ d_mm: 22 }, 1025);
  it('10.60 kg/m dry, w = 0.09040 kN/m, flagged as estimated', () => {
    near(cw.dryKgPerM, 10.6, 'kg/m');
    near(cw.w_kNperM, 0.0904, 'w');
    expect(cw.estimated).toBe(true);
  });
  const rows: [number, number, boolean, number, number, number, number, number][] = [
    // Th, L, touchdown, on seabed, X, T_fair, Fv, angle
    [2, 30, true, 12.64, 28.58, 2.54, 0, 0],
    [5, 30, true, 3.55, 29.08, 5.54, 0, 0],
    [10, 30, false, 0, 29.31, 10.57, 0.7, 4.02],
    [26.39, 30, false, 0, 29.38, 27.24, 4.04, 8.7],
    [26.39, 18, false, 0, 16.97, 28.27, 8.52, 17.89],
    [26.39, 40, false, 0, 39.52, 27.02, 2.2, 4.78],
  ];
  for (const [Th, L, touchdown, onSeabed, X, Tfair, Fv, deg] of rows) {
    it(`Th ${Th} kN, L ${L} m`, () => {
      const c = catenary(Th, cw.w_kNperM, 6, L);
      if (!c.ok) throw new Error(c.error);
      expect(c.touchdown).toBe(touchdown);
      near(c.onSeabed, onSeabed, 'on seabed');
      near(c.X, X, 'X');
      near(c.Tfair, Tfair, 'T_fair');
      near(c.Vanchor, Fv, 'Fv');
      near(c.upliftDeg, deg, 'angle');
    });
  }
  it('a chain shorter than the height difference is an error', () => {
    expect(catenary(5, 0.09, 6, 5)).toEqual({ ok: false, error: 'Chain shorter than the height difference.' });
  });
});

describe('Appendix B, test 3: required dry mass of the anchor (Th 26.39 kN, Fv 0, FoS 1.5)', () => {
  it('medium clay 23 477, fine–medium sand 15 652, gravel 12 806 kg; W′(10 000 kg) = 56.20 kN', () => {
    near(requiredAnchorMassFriction(26.39, 0, 0.3, 1.5, 2400, 1025), 23477, 'mediumClay');
    near(requiredAnchorMassFriction(26.39, 0, 0.45, 1.5, 2400, 1025), 15652, 'fineMediumSand');
    near(requiredAnchorMassFriction(26.39, 0, 0.55, 1.5, 2400, 1025), 12806, 'gravelCoarseSand');
    near(submergedWeight_kN(10000), 56.2, "W'");
  });
});

const leg = (id: string, dirDeg: number, length_m: number): MooringLeg => ({
  id,
  dirDeg,
  chain: { d_mm: 22, MBL_kN: 300, length_m },
  anchor: { massDryKg: 10000, seabed: 'fineMediumSand' },
  h_LW: 5.5,
  h_HW: 7.0,
});

describe('Appendix B, test 4: whole check, four corner legs at 30° from square', () => {
  const input: MooringInput = { ...common, legs: [leg('A1', 60, 30), leg('A2', 120, 30), leg('B1', -60, 30), leg('B2', -120, 30)] };
  const r = checkAnchoring(input);
  it('every leg: governing case along at HW, Th 51.66, T_fair 53.46, Fv 11.04, chain FoS 5.61, capacity 20.32, anchor FoS 0.39, m_req 32 604 kg', () => {
    for (const res of r.results) {
      const g = res.governing!;
      expect(['par+', 'par-']).toContain(g.case);
      expect(g.waterLevel).toBe('HW');
      near(g.Th, 51.66, `${res.id} Th`);
      near(g.Tfair, 53.46, `${res.id} T_fair`);
      near(g.Vanchor, 11.04, `${res.id} Fv`);
      near(g.chainFoS, 5.61, `${res.id} chain FoS`);
      near(g.anchorCapacity, 20.32, `${res.id} capacity`);
      near(g.anchorFoS, 0.39, `${res.id} anchor FoS`);
      near(g.anchorMassReq, 32604, `${res.id} m_req`);
      expect(g.anchorOK).toBe(false);
    }
  });
  it('warnings: 4 × "chain 4.3 × depth (HW) < 5"', () => {
    const chain = r.warnings.filter((w) => w.code === 'CHAIN_BELOW_5_DEPTHS');
    expect(chain).toHaveLength(4);
    for (const w of chain) expect(w.message).toMatch(/: chain 4\.3 × depth \(HW\) < 5 /);
  });
});

describe('Appendix B, test 5: longitudinal legs added (all chains 35 m)', () => {
  const legs = [leg('A1', 60, 35), leg('A2', 120, 35), leg('B1', -60, 35), leg('B2', -120, 35), leg('C1', 0, 35), leg('C2', 180, 35)];
  const r = checkAnchoring({ ...common, legs });
  const expectLeg = (id: string, cases: string[], Th: number, Tfair: number, Fv: number, chainFoS: number, cap: number, anchorFoS: number, mReq: number) => {
    const g = r.results.find((x) => x.id === id)!.governing!;
    expect(cases, id).toContain(g.case);
    expect(g.waterLevel).toBe('HW');
    near(g.Th, Th, `${id} Th`);
    near(g.Tfair, Tfair, `${id} T_fair`);
    near(g.Vanchor, Fv, `${id} Fv`);
    near(g.chainFoS, chainFoS, `${id} chain FoS`);
    near(g.anchorCapacity, cap, `${id} capacity`);
    near(g.anchorFoS, anchorFoS, `${id} anchor FoS`);
    near(g.anchorMassReq, mReq, `${id} m_req`);
  };
  it('A1, A2: perp− HW; B1, B2: perp+ HW; C1, C2: along HW', () => {
    for (const id of ['A1', 'A2']) expectLeg(id, ['perp-'], 48.97, 50.33, 8.42, 5.96, 21.5, 0.44, 30544);
    for (const id of ['B1', 'B2']) expectLeg(id, ['perp+'], 48.97, 50.33, 8.42, 5.96, 21.5, 0.44, 30544);
    for (const id of ['C1', 'C2']) expectLeg(id, ['par+', 'par-'], 25.83, 26.73, 3.7, 11.22, 23.63, 0.91, 15978);
  });
  it('distribution of the across and along loads', () => {
    const across = distributeToLegs(84.83, [0, 1], legs);
    const along = distributeToLegs(51.66, [1, 0], legs);
    if (!across.ok || !along.ok) throw new Error('no legs');
    [0, 0, 48.98, 48.98, 0, 0].forEach((v, i) => near(across.Th[i]!, v, `across ${i}`));
    [0, 25.83, 0, 25.83, 0, 25.83].forEach((v, i) => near(along.Th[i]!, v, `along ${i}`));
  });
  it('a direction no leg resists is an error', () => {
    expect(distributeToLegs(10, [0, 1], [{ dirDeg: 90 }])).toEqual({ ok: false, error: 'No anchor leg resists this load direction.', Th: [0] });
  });
});
