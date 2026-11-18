/**
 * The wave input of the anchoring plan (D45, I104, D63).
 *
 * Per direction with open water (a sector with a fetch) the 50-year Hm0 and wavelength: from the
 * wave screening where it has a wind for the direction, else **estimated from the fetch with the
 * anchoring design wind** (USACE CEM, `designWaves`; I121). Before D63 such a direction took the
 * full 2 kN/m of AS 3962 4.8.2.3, whatever its fetch.
 *
 * Per pontoon (main pier, access pontoon) and direction: the share of its length that lies in the
 * shelter of the drawn breakwaters and the transmitted height Hm0 × (1 − Ac) behind the sheltering
 * breakwater's type (I93, I107). The wave load of the sheltered part follows the transmitted height
 * (I122). Diffraction round the ends, reflection and overtopping are not included, as in I107.
 * Breakwaters themselves are never sheltered.
 */
import { attenuation, breakwaterProductOf, breakwatersOf, shelterOf } from './breakwater';
import type { Layout, Project } from './model';
import { pierAxis } from './rows';
import { accessPontoonsOf } from './site';
import { bearingOf, designWaves, WAVE_SECTORS, waveAssessment, waveSectorBearing } from './waves';

/** Averaging time of the anchoring design wind, s (10-min mean, as the reference wind of D23). */
export const DESIGN_WIND_AVERAGING_S = 600;

export interface AnchoringWaves {
  /** Bearings the waves come from (sectors with a fetch). */
  from: number[];
  /** Names of the sectors whose waves exceed the criteria of the screening. */
  exceeding: string[];
  /** 50-year Hm0 of each direction, m (same order as `from`). */
  hs50: (number | null)[];
  /** Whether that height was estimated with the design wind (no wind for it in the screening). */
  estimated: boolean[];
  /**
   * Per pontoon id and direction (same order as `from`): the sheltered share of its length (0–1),
   * the breakwater and the 50-year Hm0 behind it (null when the brochure curve does not reach the
   * wave: then the sheltered part is treated as unsheltered).
   */
  shelter: Record<string, { share: number; breakwaterId: string | null; hs: number | null }[]>;
}

export function anchoringWaves(project: Pick<Project, 'waves' | 'anchoring' | 'site'>, layout: Pick<Layout, 'piers'>): AnchoringWaves {
  const { waves, anchoring, site } = project;
  const assessment = waveAssessment(waves, anchoring.depth, layout.piers.map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) })));
  const sectors = waves.sectors.flatMap((x, k) => (x.fetch > 0 ? [k] : []));
  const perSector = sectors.map((k) => {
    const fifty = assessment?.sectors.find((x) => x.sector === k)?.events.find((e) => e.event === 'fiftyYear')?.waves;
    if (fifty) return { hm0: fifty.hm0, wavelength: fifty.wavelength, estimated: false };
    const sector = waves.sectors[k]!;
    const depth = sector.depth ?? waves.fetchDepth ?? anchoring.depth;
    const est = designWaves(anchoring.windSpeed, DESIGN_WIND_AVERAGING_S, sector.fetch, depth);
    return { hm0: est.hm0, wavelength: est.wavelength, estimated: true };
  });
  const breakwaters = breakwatersOf(site);
  const items = [...layout.piers.map((p) => ({ id: p.id, start: p.start, end: p.end })), ...accessPontoonsOf(site).map((a) => ({ id: a.id, start: a.start, end: a.end }))];
  const shelter: AnchoringWaves['shelter'] = {};
  if (breakwaters.length > 0) {
    for (const item of items) {
      shelter[item.id] = sectors.map((k, i) => {
        const w = perSector[i]!;
        const { share, breakwater } = shelterOf(breakwaters, item.start, item.end, waveSectorBearing(k), waves.sectors[k]!.fetch);
        if (!breakwater || share <= 0) return { share: 0, breakwaterId: null, hs: null };
        const a = attenuation(breakwaterProductOf(breakwater), w.hm0, w.wavelength);
        return { share, breakwaterId: breakwater.id, hs: a === null ? null : w.hm0 * (1 - a) };
      });
    }
  }
  return {
    from: sectors.map(waveSectorBearing),
    exceeding: (assessment?.bad ?? []).map((k) => WAVE_SECTORS[k]!),
    hs50: perSector.map((w) => w.hm0),
    estimated: perSector.map((w) => w.estimated),
    shelter,
  };
}
