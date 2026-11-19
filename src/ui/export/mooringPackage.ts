/**
 * D64: the data package for the manufacturer of an elastic mooring (docs/ANKKUROINTI_MITOITUS_SPEC.md
 * §7). The tool does not size Seaflex or other elastic moorings: the manufacturer does (JFlex), from
 * the water-level range, wind, waves, current, depth and windage, with the site plan, the pontoon
 * types and sizes, the berth sizes, the seabed and the loads of §3. This module gathers them as JSON.
 */
import { MOORING_DISCLAIMER, type AnchoringResult } from '../../engine/anchoring';
import { breakwaterProductOf, breakwatersOf } from '../../engine/breakwater';
import { distance } from '../../engine/geometry';
import type { Layout, Project } from '../../engine/model';
import { accessPontoonsOf } from '../../engine/site';
import { DISCLAIMER } from '../../state/projectFile';

const r2 = (x: number) => Math.round(x * 100) / 100;

export function mooringPackage(project: Project, layout: Layout, anchoring: AnchoringResult, date: string, pierFreeboard: number | null): string {
  const a = project.anchoring;
  const classes = new Map(project.boatClasses.map((c) => [c.id, c]));
  const berthsOf = (pierId: string) => {
    const counts = new Map<string, number>();
    for (const b of layout.berths) if (b.pierId === pierId && !b.removed) counts.set(b.boatClassId, (counts.get(b.boatClassId) ?? 0) + 1);
    return [...counts.entries()].map(([id, count]) => {
      const c = classes.get(id);
      return { boatClass: c?.name ?? id, loa_m: c?.length ?? null, beam_m: c?.beam ?? null, type: c?.vesselType ?? 'motor', count };
    });
  };
  const freeboard = pierFreeboard ?? a.pontoonFreeboard;
  const pontoons = [
    ...layout.piers.map((p) => ({ id: p.id, kind: 'main pier', type: 'walkway', start: p.start, end: p.end, length_m: r2(distance(p.start, p.end)), width_m: p.width, freeboard_m: freeboard, draft_m: a.pontoonDraft, berths: berthsOf(p.id) })),
    ...accessPontoonsOf(project.site).map((p) => ({ id: p.id, kind: 'access pontoon', type: 'walkway', start: p.start, end: p.end, length_m: r2(distance(p.start, p.end)), width_m: p.width, freeboard_m: freeboard, draft_m: a.pontoonDraft, berths: [] })),
    ...breakwatersOf(project.site).map((b) => {
      const product = breakwaterProductOf(b);
      return { id: b.id, kind: 'breakwater', type: 'wave_attenuator', product: product.name, start: b.start, end: b.end, length_m: r2(distance(b.start, b.end)), width_m: product.width, freeboard_m: product.freeboard, draft_m: r2(product.height - product.freeboard), berths: [] };
    }),
  ];
  const data = {
    purpose: 'Input data for the design of an elastic mooring (e.g. Seaflex / JFlex) by its manufacturer. Not a design.',
    disclaimer: DISCLAIMER,
    sizingNote: MOORING_DISCLAIMER,
    date,
    project: project.name,
    alternative: layout.name,
    location: project.map ? { origin_lat: project.map.lat, origin_lon: project.map.lon, note: 'local x east, y north, metres from this origin' } : null,
    waterLevels: {
      designDepth_m: a.depth,
      highWaterAboveDesign_m: a.highWater,
      lowWaterBelowDesign_m: a.lowWater,
      normalHighWater_m: a.normalHighWater,
      normalLowWater_m: a.normalLowWater,
      range_m: r2(a.highWater + a.lowWater),
      gauge: project.waterLevels ? { station: project.waterLevels.station, source: project.waterLevels.source, years: `${project.waterLevels.startYear}–${project.waterLevels.endYear}` } : null,
    },
    wind: { designWind30s_ms: a.windSpeed, note: '30 s steady ULS design wind (AS 3962 4.8.3.2–3), entered by the user' },
    waves: {
      waveLineLoad_kNm: a.waveLineLoad,
      minimumWaveLineLoad_kNm: a.waveMin,
      fetches_m: project.waves.sectors.map((s, k) => ({ sector: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][k], fetch_m: s.fetch, depth_m: s.depth })).filter((s) => s.fetch_m > 0),
    },
    current_ms: a.currentSpeed,
    ice: { iceLineLoad_kNm: a.iceLineLoad, winterInWater: a.winterInWater, note: 'ice loads are not designed by the tool' },
    seabed: { type: a.seabed, slope_deg: a.slopeDeg, cohesive: a.cohesive },
    pontoons,
    loads_kN: anchoring.loads.map((l) => ({ pontoon: l.id, q_kPa: r2(l.q * 1000) / 1000, cases: l.cases.map((c) => ({ case: c.id, wind: r2(c.wind), current: r2(c.current), wave: r2(c.wave), uls: r2(c.F_uls) })), ice: l.ice, passedToAttachedPiers: l.transfers.map((x) => ({ case: x.case, pier: x.to, pierCase: x.toCase, kN: r2(x.kN) })) })),
    chainLegsOfTheToolsPlan: anchoring.lines
      .filter((l) => l.role !== 'buoy')
      .map((l) => ({ id: l.id, pontoon: l.holdsId, fixing: l.fixing, fix: { x: r2(l.fix.x), y: r2(l.fix.y) }, anchor: { x: r2(l.anchor.x), y: r2(l.anchor.y) }, dirDeg: r2(l.dirDeg), chainLength_m: r2(l.chainLength), maxHorizontal_kN: r2(l.horizontalKn) })),
  };
  return JSON.stringify(data, null, 2);
}
