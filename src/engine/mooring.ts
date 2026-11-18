/**
 * Preliminary sizing of the mooring of a floating pontoon (DECISIONS D64): a TypeScript port of
 * the reference implementation `anchoring.mjs` in docs/ANKKUROINTI_MITOITUS_SPEC.md (Appendix A),
 * tested against its Appendix B to ±1 %.
 *
 *  - Loads after AS 3962:2020: wind pressure qz = 0.0006 V² (V = 30 s ULS design wind), vessel
 *    windage areas of Table 4.4, drag coefficients of Table 4.3, windward boats in full and leeward
 *    20 % (4.8.3.3), a minimum wave line load of 2 kN/m (4.8.2.3), current on the pontoon, and the
 *    combination wind + 1.5 · current + 1.5 · wave (4.2(b)). Along the pontoon the boats in a row
 *    are shielded 100 / 50 / 30 % (Tobiasson & Kollmeyer; AS 3962 gives no rule for this case).
 *  - The load of a direction is shared by the legs anchored on the opposite side: equal horizontal
 *    tension Th = F · unevenFactor / Σ|u·d|. No moment balance, no stiffness sharing.
 *  - Inextensible static catenary at low and at high water: largest tension, chain factor of safety
 *    and the uplift Fv at the anchor.
 *  - Concrete anchor by friction of its submerged weight less the uplift, Fh = (W' − Fv)·μ, μ by
 *    seabed (NAVFAC DM-7.02); optional cohesive model for clay and mud.
 *  - Practical minimum rules (FCG 2022, SF Marina, Båtunionen) as warnings only.
 *
 * Units: m, kN, kg, kPa, m/s, degrees. Every function is pure.
 */

export const G = 9.81;

// ---------------------------------------------------------------------------
// 1. Tables
// ---------------------------------------------------------------------------

export type VesselType = 'motor' | 'yacht';

/** AS 3962:2020 Table 4.4: minimum windage areas [head m², beam m²] by length overall (m). */
export const VESSEL_WIND_AREA: Record<VesselType, Record<number, readonly [number, number]>> = {
  motor: { 8: [5, 16], 10: [7, 22], 12: [11, 29], 15: [18, 45], 18: [22, 64], 20: [24, 76], 25: [30, 95], 30: [45, 120], 35: [54, 167], 40: [78, 213], 45: [85, 264], 50: [90, 285] },
  yacht: { 8: [4, 11], 10: [5, 15], 12: [6, 20], 15: [9, 28], 18: [11, 40], 20: [12, 44], 25: [15, 60], 30: [35, 92], 35: [36, 122], 40: [40, 182], 45: [50, 210], 50: [60, 249] },
};

/** AS 3962:2020 Table 4.3: wind drag coefficients (default = upper end of each range). */
export const WIND_CD = {
  /** 0.7–0.9 */
  vesselBow: 0.9,
  /** 0.9–1.1 */
  vesselStern: 1.1,
  /** 0.9–1.1 */
  vesselBeam: 1.1,
  /** Pontoon side or end. */
  rectangular: 2.0,
} as const;
export type WindCd = { -readonly [K in keyof typeof WIND_CD]: number };

/** AS 3962:2020 Table 4.5: current drag coefficients. */
export const CURRENT_CD = { pontoon: 2.0, vesselBow: 0.3, vesselBeamHull: 0.6, vesselBeamKeel: 1.2 } as const;

export const SEABED_KEYS = ['rock', 'gravelCoarseSand', 'fineMediumSand', 'fineSiltySand', 'silt', 'stiffClay', 'mediumClay', 'softClayMud'] as const;
export type SeabedKey = (typeof SEABED_KEYS)[number];

/**
 * NAVFAC DM-7.02 (via the GEO5 help): mass concrete on foundation soil, tan δ; default = lower end
 * of the range. Soft clay / mud has no friction model: the cohesive model or an expert.
 */
export const SEABED_FRICTION: Record<SeabedKey, { label: string; mu: number | null; range: readonly [number, number] | null }> = {
  rock: { label: 'Intact rock', mu: 0.7, range: [0.7, 0.7] },
  gravelCoarseSand: { label: 'Gravel / coarse sand', mu: 0.55, range: [0.55, 0.6] },
  fineMediumSand: { label: 'Fine–medium sand', mu: 0.45, range: [0.45, 0.55] },
  fineSiltySand: { label: 'Fine silty sand', mu: 0.35, range: [0.35, 0.45] },
  silt: { label: 'Fine silt', mu: 0.3, range: [0.3, 0.3] },
  stiffClay: { label: 'Very stiff clay', mu: 0.4, range: [0.4, 0.5] },
  mediumClay: { label: 'Medium–stiff clay', mu: 0.3, range: [0.3, 0.35] },
  softClayMud: { label: 'Soft clay / mud', mu: null, range: null },
};

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------

export interface MooringWarning {
  code: string;
  message: string;
}

function interp(table: Record<number, readonly [number, number]>, L: number): { head: number; beam: number; extrapolated: boolean } {
  const keys = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  if (L <= first) return { head: table[first]![0], beam: table[first]![1], extrapolated: L < first };
  if (L >= last) return { head: table[last]![0], beam: table[last]![1], extrapolated: L > last };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (L >= a && L <= b) {
      const t = (L - a) / (b - a);
      return { head: table[a]![0] + t * (table[b]![0] - table[a]![0]), beam: table[a]![1] + t * (table[b]![1] - table[a]![1]), extrapolated: false };
    }
  }
  return { head: table[last]![0], beam: table[last]![1], extrapolated: true };
}

/** AS 3962 Table 4.4 windage areas of a boat, interpolated by length; the table's end values outside 8–50 m. */
export function vesselWindArea(type: VesselType, loa: number): { head: number; beam: number; extrapolated: boolean } {
  return interp(VESSEL_WIND_AREA[type] ?? VESSEL_WIND_AREA.motor, loa);
}

function bisect(f: (x: number) => number, lo: number, hi: number, tol = 1e-9, maxIter = 200): number {
  let flo = f(lo);
  const fhi = f(hi);
  if (flo * fhi > 0) throw new Error('bisect: no sign change');
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (Math.abs(fm) < tol || hi - lo < tol) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return 0.5 * (lo + hi);
}

/** AS 3962 Eq. 4.8.3.3(1): qz [kPa] = 0.0006 V² (V = 30 s design wind, m/s). */
export const windPressure = (V: number): number => 0.0006 * V * V;

/** AS 3962 Eq. 4.8.4.3(1): p [kPa] = ½ ρ CD v² / 1000. */
export const currentPressure = (rho: number, cd: number, v: number): number => (0.5 * rho * cd * v * v) / 1000;

// ---------------------------------------------------------------------------
// 3. Environmental loads on one pontoon (four main directions)
// ---------------------------------------------------------------------------

export interface MooringPontoon {
  length: number;
  width: number;
  /** Freeboard (wind area), m. */
  freeboard: number;
  /** Draught (current area), m. */
  draft: number;
  type?: 'walkway' | 'wave_attenuator';
}

export interface MooringBoat {
  loa: number;
  type: VesselType;
}

/** sideA = +y side, sideB = −y side, each in order along the pontoon (first boat first). */
export interface MooringBerths {
  sideA: readonly MooringBoat[];
  sideB: readonly MooringBoat[];
}

export interface MooringEnv {
  /** 30 s ULS design wind, m/s (AS 3962 4.8.3.2–3). */
  windSpeed: number;
  /** Wave line load from the user's wave analysis, kN/m; max(this, waveMin) is used. */
  waveLineLoad?: number;
  currentSpeed?: number;
  waterDensity?: number;
  /** Reported only, not designed. */
  iceLineLoad?: number;
  extraStatic_kN?: number;
  winterInWater?: boolean;
}

export interface MooringLoadOptions {
  cd?: Partial<WindCd>;
  leewardFactor?: number;
  rowShielding?: readonly number[];
  waveMin?: number;
}

export interface LoadCase {
  id: 'perp+' | 'perp-' | 'par+' | 'par-';
  /** Direction of the force on the pontoon (unit vector, local: x = long axis, y = +side A). */
  dir: readonly [number, number];
  wind: number;
  current: number;
  wave: number;
  /** wind + 1.5 · current + 1.5 · wave + extra static, kN. */
  F_uls: number;
}

export interface EnvironmentalLoads {
  q: number;
  cases: LoadCase[];
  ice: { F_perp: number; F_par: number } | null;
  warnings: MooringWarning[];
}

export function environmentalLoads(pontoon: MooringPontoon, berths: MooringBerths, env: MooringEnv, opts: MooringLoadOptions = {}): EnvironmentalLoads {
  const warnings: MooringWarning[] = [];
  const cd: WindCd = { ...WIND_CD, ...(opts.cd ?? {}) };
  const leeward = opts.leewardFactor ?? 0.2; // AS 3962 4.8.3.3
  const rowSh = opts.rowShielding ?? [1, 0.5, 0.3]; // Tobiasson & Kollmeyer
  const waveMin = opts.waveMin ?? 2.0; // AS 3962 4.8.2.3, kN/m
  if (waveMin < 2.0) {
    warnings.push({ code: 'WAVE_MIN_BELOW_AS3962', message: `Minimum wave line load ${waveMin} kN/m < 2 kN/m (AS 3962 4.8.2.3): allowed only with a more specific wave analysis.` });
  }
  const q = windPressure(env.windSpeed);
  const rho = env.waterDensity ?? 1025;

  const areas = (side: readonly MooringBoat[]) =>
    side.map((b) => {
      const a = vesselWindArea(b.type, b.loa);
      if (a.extrapolated) warnings.push({ code: 'VESSEL_OUTSIDE_TABLE_4_4', message: `Boat length ${b.loa} m is outside AS 3962 Table 4.4 (8–50 m): the end value is used.` });
      return a;
    });
  const A = areas(berths.sideA);
  const B = areas(berths.sideB);
  const sumHead = (arr: readonly { head: number }[]) => arr.reduce((s, a) => s + a.head, 0);
  const rowBeam = (arr: readonly { beam: number }[]) => arr.reduce((s, a, i) => s + a.beam * (rowSh[i] ?? rowSh[rowSh.length - 1] ?? 1), 0);

  // Across: wind and waves square to the pontoon, boats bow- or stern-on.
  const cdHead = Math.max(cd.vesselBow, cd.vesselStern);
  const windPerp = (windward: typeof A, lee: typeof A) => q * cdHead * (sumHead(windward) + leeward * sumHead(lee)) + q * cd.rectangular * pontoon.length * pontoon.freeboard;
  const waveLL = Math.max(env.waveLineLoad ?? 0, waveMin);
  const wavePerp = waveLL * pontoon.length;
  const curPerp = currentPressure(rho, CURRENT_CD.pontoon, env.currentSpeed ?? 0) * pontoon.length * pontoon.draft;

  // Along: wind along the pontoon, boats broadside in rows.
  const windPar = q * cd.vesselBeam * (rowBeam(A) + rowBeam(B)) + q * cd.rectangular * pontoon.width * pontoon.freeboard;
  const wavePar = waveLL * pontoon.width;
  const curPar = currentPressure(rho, CURRENT_CD.pontoon, env.currentSpeed ?? 0) * pontoon.width * pontoon.draft;

  const extra = env.extraStatic_kN ?? 0;
  const uls = (w: number, c: number, wa: number) => w + 1.5 * c + 1.5 * wa + extra; // AS 3962 4.2(b)
  const cases: LoadCase[] = (
    [
      // Wind from side B → force towards +y.
      { id: 'perp+', dir: [0, 1], wind: windPerp(B, A), current: curPerp, wave: wavePerp },
      { id: 'perp-', dir: [0, -1], wind: windPerp(A, B), current: curPerp, wave: wavePerp },
      { id: 'par+', dir: [1, 0], wind: windPar, current: curPar, wave: wavePar },
      { id: 'par-', dir: [-1, 0], wind: windPar, current: curPar, wave: wavePar },
    ] as const
  ).map((c) => ({ ...c, F_uls: uls(c.wind, c.current, c.wave) }));

  let ice: EnvironmentalLoads['ice'] = null;
  if ((env.iceLineLoad ?? 0) > 0) {
    ice = { F_perp: env.iceLineLoad! * pontoon.length, F_par: env.iceLineLoad! * pontoon.width };
    warnings.push({ code: 'ICE_LOAD_GIVEN', message: 'Ice load given: gravity anchors do not usually withstand the design ice load; it needs a separate study (RIL 201-3-2013). Ice loads are not designed here.' });
  }
  return { q, cases, ice, warnings };
}

// ---------------------------------------------------------------------------
// 4. Sharing a load between the legs
// ---------------------------------------------------------------------------

/**
 * `dirDeg` of a leg: direction from the pontoon towards the anchor in the local frame (0° = +x,
 * 90° = +y). A leg resists the load when u·d < 0 (its anchor lies on the side opposite the load);
 * the active legs take the same horizontal tension (no stiffness sharing, no moment).
 */
export function distributeToLegs(
  F: number,
  dir: readonly [number, number],
  legs: readonly { dirDeg: number }[],
  unevenFactor = 1.0,
): { ok: true; Th: number[]; active: boolean[] } | { ok: false; error: string; Th: number[] } {
  const proj = legs.map((leg) => {
    const r = (leg.dirDeg * Math.PI) / 180;
    return Math.cos(r) * dir[0] + Math.sin(r) * dir[1];
  });
  const active = proj.map((p) => p < -1e-6);
  const sum = proj.reduce((s, p, i) => s + (active[i] ? -p : 0), 0);
  if (sum <= 0) return { ok: false, error: 'No anchor leg resists this load direction.', Th: legs.map(() => 0) };
  return { ok: true, Th: proj.map((_, i) => (active[i] ? (F * unevenFactor) / sum : 0)), active };
}

// ---------------------------------------------------------------------------
// 5. Catenary (inextensible, static)
// ---------------------------------------------------------------------------

export type CatenaryResult =
  | {
      ok: true;
      /** Part of the chain lies on the seabed (no uplift at the anchor). */
      touchdown: boolean;
      onSeabed: number;
      /** Horizontal distance from the anchor (or touchdown) to the fairlead, m. */
      X: number;
      Tfair: number;
      Tanchor: number;
      /** Uplift at the anchor, kN. */
      Vanchor: number;
      upliftDeg: number;
    }
  | { ok: false; error: string };

/** Th [kN] horizontal tension, w [kN/m] submerged chain weight, h [m] anchor eye to fairlead, L [m] chain length. */
export function catenary(Th: number, w: number, h: number, L: number): CatenaryResult {
  if (L <= h) return { ok: false, error: 'Chain shorter than the height difference.' };
  if (Th <= 1e-9) return { ok: true, touchdown: true, onSeabed: L - h, X: L - h, Tfair: w * h, Tanchor: 0, Vanchor: 0, upliftDeg: 0 };
  const a = Th / w;
  const ls = Math.sqrt(h * (h + 2 * a)); // hanging length to the touchdown point
  if (L >= ls) {
    const xs = a * Math.acosh(1 + h / a);
    return { ok: true, touchdown: true, onSeabed: L - ls, X: L - ls + xs, Tfair: Th + w * h, Tanchor: Th, Vanchor: 0, upliftDeg: 0 };
  }
  // Fully suspended: L² − h² = (2a sinh(X/2a))²
  const X = bisect((x) => (2 * a * Math.sinh(x / (2 * a))) ** 2 - (L * L - h * h), 1e-9, L);
  // The reference code brackets x1 in ±50 L. A very taut chain (a ≫ L) has its vertex further away
  // (x1 ≈ a·asinh(h/X)), so the bracket also grows with a, capped where cosh would overflow. The
  // equation and its single root are unchanged.
  const lim = Math.min(50 * L + 50 * a, 700 * a);
  const x1 = bisect((x) => a * (Math.cosh((x + X) / a) - Math.cosh(x / a)) - h, -lim, lim);
  const Vanchor = Math.max(0, Th * Math.sinh(x1 / a));
  return {
    ok: true,
    touchdown: false,
    onSeabed: 0,
    X,
    Tfair: Th * Math.cosh((x1 + X) / a),
    Tanchor: Th * Math.cosh(x1 / a),
    Vanchor,
    upliftDeg: (Math.atan2(Vanchor, Th) * 180) / Math.PI,
  };
}

export interface MooringChain {
  d_mm: number;
  /** Manufacturer's mass per metre; missing → 0.0219·d² (studless link chain, approximate) with a warning. */
  kgPerM?: number | null;
  MBL_kN: number;
  length_m: number;
}

/** Chain weight in water, kN/m. */
export function chainWeight(chain: Pick<MooringChain, 'd_mm' | 'kgPerM'>, waterDensity = 1025): { dryKgPerM: number; w_kNperM: number; estimated: boolean } {
  const dry = chain.kgPerM ?? 0.0219 * chain.d_mm ** 2;
  const sub = dry * (1 - waterDensity / 7850);
  return { dryKgPerM: dry, w_kNperM: (sub * G) / 1000, estimated: chain.kgPerM === null || chain.kgPerM === undefined };
}

// ---------------------------------------------------------------------------
// 6. Concrete anchor capacity
// ---------------------------------------------------------------------------

export function submergedWeight_kN(massDryKg: number, rhoConcrete = 2400, rhoWater = 1025): number {
  return (massDryKg * G * (1 - rhoWater / rhoConcrete)) / 1000;
}

/** Friction: Fh = (W' − Fv)·μ; seabed sloping down in the direction of the pull β: W'(μ cosβ − sinβ) − Fv·μ (→ 0 at tanβ = μ). */
export function anchorCapacityFriction(Wsub: number, Fv: number, mu: number, slopeDeg = 0): number {
  const b = (slopeDeg * Math.PI) / 180;
  return Math.max(0, Wsub * (mu * Math.cos(b) - Math.sin(b)) - Fv * mu);
}

export interface CohesiveParams {
  /** Undrained shear strength at the base of the anchor, kPa. */
  Su_z: number;
  /** Mean undrained shear strength over 0…z, kPa. */
  Su_a: number;
  /** Base area, m². */
  A: number;
  /** Width against the load, m. */
  B: number;
  /** Embedment, m. */
  z: number;
  /** Effective unit weight of the soil, kN/m³. */
  gammaB: number;
}

/** Cohesive model (NCEL via PNNL 2009 App. A-1): Fh = Su_z·A + (2·Su_a·z + ½·γb·z²)·B. */
export function anchorCapacityCohesive({ Su_z, Su_a, A, B, z, gammaB }: CohesiveParams): number {
  return Su_z * A + (2 * Su_a * z + 0.5 * gammaB * z * z) * B;
}

/** Dry mass of a friction anchor for Th, Fv (kN) and the factor of safety, kg; Infinity when the slope leaves no friction. */
export function requiredAnchorMassFriction(Th: number, Fv: number, mu: number, FoS: number, rhoConcrete = 2400, rhoWater = 1025, slopeDeg = 0): number {
  const b = (slopeDeg * Math.PI) / 180;
  const eff = mu * Math.cos(b) - Math.sin(b);
  if (eff <= 0) return Infinity;
  const Wreq = (FoS * Th + Fv * mu) / eff; // kN submerged
  return (Wreq * 1000) / G / (1 - rhoWater / rhoConcrete);
}

// ---------------------------------------------------------------------------
// 7. The whole check
// ---------------------------------------------------------------------------

export const MOORING_DEFAULTS = {
  FoS_chain: 3.0,
  FoS_anchor: 1.5,
  unevenFactor: 1.0,
  rhoConcrete: 2400,
  waterDensity: 1025,
} as const;

export interface MooringLeg {
  id: string;
  dirDeg: number;
  chain: MooringChain;
  anchor: {
    massDryKg: number;
    seabed: SeabedKey;
    slopeDeg?: number;
    cohesive?: CohesiveParams;
    /** Default 1.0; > 1 only with a documented basis (pull test, measured embedment). */
    capacityFactor?: number;
    capacityFactorSource?: string;
  };
  h_LW: number;
  h_HW: number;
}

export interface MooringOptions extends MooringLoadOptions {
  FoS_chain?: number;
  FoS_anchor?: number;
  unevenFactor?: number;
  rhoConcrete?: number;
  waterDensity?: number;
  preset?: 'FCG_wave_attenuator';
}

export interface MooringInput {
  pontoon: MooringPontoon;
  berths: MooringBerths;
  env: MooringEnv;
  legs: readonly MooringLeg[];
  opts?: MooringOptions;
}

export interface LegCaseResult {
  case: LoadCase['id'];
  waterLevel: 'LW' | 'HW';
  Th: number;
  touchdown: boolean;
  onSeabed: number;
  X: number;
  Tfair: number;
  Tanchor: number;
  Vanchor: number;
  upliftDeg: number;
  chainFoS: number;
  anchorCapacity: number;
  anchorFoS: number;
  anchorMassReq: number;
  chainOK: boolean;
  anchorOK: boolean;
}

export interface LegResult {
  id: string;
  /** The case with the smallest anchor factor of safety. */
  governing: LegCaseResult | null;
  cases: LegCaseResult[];
}

export function checkAnchoring(input: MooringInput): { loads: EnvironmentalLoads; results: LegResult[]; warnings: MooringWarning[] } {
  const o = { ...MOORING_DEFAULTS, ...(input.opts ?? {}) };
  const loads = environmentalLoads(input.pontoon, input.berths, input.env, input.opts);
  const warnings: MooringWarning[] = [...loads.warnings];
  const results: LegResult[] = input.legs.map((leg) => ({ id: leg.id, governing: null, cases: [] }));
  const waterDensity = input.env.waterDensity ?? o.waterDensity;

  for (const c of loads.cases) {
    const dist = distributeToLegs(c.F_uls, c.dir, input.legs, o.unevenFactor);
    if (!dist.ok) {
      warnings.push({ code: 'NO_LEG_FOR_DIRECTION', message: `${c.id}: ${dist.error}` });
      continue;
    }
    input.legs.forEach((leg, i) => {
      const Th = dist.Th[i]!;
      if (Th <= 0) return;
      const cw = chainWeight(leg.chain, waterDensity);
      for (const [wl, h] of [
        ['LW', leg.h_LW],
        ['HW', leg.h_HW],
      ] as const) {
        const cat = catenary(Th, cw.w_kNperM, h, leg.chain.length_m);
        if (!cat.ok) {
          warnings.push({ code: 'CATENARY_FAILED', message: `${leg.id} ${c.id} ${wl}: ${cat.error}` });
          continue;
        }
        const Wsub = submergedWeight_kN(leg.anchor.massDryKg, o.rhoConcrete, waterDensity);
        const sb = SEABED_FRICTION[leg.anchor.seabed];
        let cap: number;
        if (leg.anchor.cohesive) cap = anchorCapacityCohesive(leg.anchor.cohesive);
        else if (sb?.mu) cap = anchorCapacityFriction(Wsub, cat.Vanchor, sb.mu, leg.anchor.slopeDeg ?? 0);
        else {
          cap = NaN;
          warnings.push({ code: 'NO_FRICTION_MODEL', message: `${leg.id}: seabed "${leg.anchor.seabed}" has no friction model: give the cohesive parameters.` });
        }
        const cf = leg.anchor.capacityFactor ?? 1.0;
        if (cf !== 1.0 && !leg.anchor.capacityFactorSource) warnings.push({ code: 'CAPACITY_FACTOR_WITHOUT_SOURCE', message: `${leg.id}: capacityFactor ${cf} without a documented basis (capacityFactorSource).` });
        cap *= cf;
        const chainFoS = leg.chain.MBL_kN / Math.max(cat.Tfair, cat.Tanchor);
        const anchorFoS = cap / Th;
        results[i]!.cases.push({
          case: c.id,
          waterLevel: wl,
          Th,
          touchdown: cat.touchdown,
          onSeabed: cat.onSeabed,
          X: cat.X,
          Tfair: cat.Tfair,
          Tanchor: cat.Tanchor,
          Vanchor: cat.Vanchor,
          upliftDeg: cat.upliftDeg,
          chainFoS,
          anchorCapacity: cap,
          anchorFoS,
          anchorMassReq: sb?.mu ? requiredAnchorMassFriction(Th, cat.Vanchor, sb.mu, o.FoS_anchor, o.rhoConcrete, waterDensity, leg.anchor.slopeDeg ?? 0) : NaN,
          chainOK: chainFoS >= o.FoS_chain,
          anchorOK: anchorFoS >= o.FoS_anchor,
        });
      }
    });
  }
  for (const res of results) {
    res.governing = res.cases.reduce<LegCaseResult | null>((g, r) => (!g || r.anchorFoS < g.anchorFoS ? r : g), null);
  }
  return { loads, results, warnings: [...warnings, ...ruleChecks(input)] };
}

// ---------------------------------------------------------------------------
// 8. Practical minimum rules (warnings, not calculation)
// ---------------------------------------------------------------------------

export function ruleChecks(input: Pick<MooringInput, 'legs' | 'pontoon' | 'env' | 'opts'>, preset = input.opts?.preset): MooringWarning[] {
  const w: MooringWarning[] = [];
  const legs = input.legs;
  for (const leg of legs) {
    const ratio = leg.chain.length_m / leg.h_HW;
    if (ratio < 4) w.push({ code: 'CHAIN_BELOW_4_DEPTHS', message: `${leg.id}: chain ${ratio.toFixed(1)} × depth (HW) < 4 (SF Marina's initial assumption ≈ 4 × the HAT depth).` });
    else if (ratio < 5) w.push({ code: 'CHAIN_BELOW_5_DEPTHS', message: `${leg.id}: chain ${ratio.toFixed(1)} × depth (HW) < 5 (FCG 2022 / Top Marine: ≥ 5 × depth).` });
  }
  if (legs.length < 4) w.push({ code: 'FEWER_THAN_4_ANCHOR_POINTS', message: `${legs.length} anchor points < 4 per pontoon (FCG 2022).` });
  if (preset === 'FCG_wave_attenuator') {
    const totalMass = legs.reduce((s, l) => s + l.anchor.massDryKg, 0);
    const perM = totalMass / input.pontoon.length;
    if (perM < 850) w.push({ code: 'FCG_ANCHOR_MASS_PER_METRE', message: `${perM.toFixed(0)} kg of anchors per metre < 850 kg/m (FCG 2022 wave attenuator; whether dry or submerged weight is not stated in the source).` });
    for (const leg of legs) {
      if (leg.chain.d_mm < 28 || leg.chain.MBL_kN < 300) w.push({ code: 'FCG_CHAIN', message: `${leg.id}: chain < Ø28 mm / 300 kN (FCG 2022 wave attenuator).` });
    }
  }
  if (input.env?.winterInWater) {
    w.push({
      code: 'WINTER_IN_WATER',
      message: 'Winter use: place the pier outside the shore ice break-up line; light pontoons are lifted for the winter (Båtunionen, Hamnhandboken 2016). Ice loads separately (RIL 201-3-2013).',
    });
  }
  return w;
}
