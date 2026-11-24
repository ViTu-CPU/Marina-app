/**
 * U34: pick a City of Helsinki detailed-plan area on the map and make it the site.
 * The lookups go to kartta.hel.fi (plan areas) and tiles.versatiles.org (water, as I113).
 */
import { boundingBox, polygonArea, type Region } from '../../engine/geometry';
import type { Site, Vec2 } from '../../engine/model';
import { planSite } from '../../engine/planSite';
import { localToLatLon } from '../../state/geo';
import { lookupPlanAt, lookupWaterRegion, planRegion } from '../../state/helsinki';
import { appStore } from '../../state/store';
import { fitBounds } from '../../state/view';

const NO_ENTRANCE: Site['entrance'] = { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };

/** Look up the plan area at a point of the drawing (local metres). Needs the map's position. */
export async function pickPlanAt(at: Vec2, fetchImpl: typeof fetch = fetch): Promise<void> {
  const s = appStore.getState();
  const map = s.project.map;
  if (!map) return;
  s.setPlanPick({ status: 'loading', at });
  try {
    const g = localToLatLon(map, at);
    const plans = await lookupPlanAt(g.lat, g.lon, fetchImpl);
    const latest = appStore.getState();
    // A newer click wins.
    if (latest.planPick?.at !== at) return;
    if (plans.length === 0) latest.setPlanPick({ status: 'none', at });
    else {
      const region = planRegion(plans[0]!, map);
      latest.setPlanPick({ status: 'found', at, plan: plans[0]!, region, others: plans.length - 1 });
      // Show the whole plan area.
      latest.setView(fitBounds(boundingBox(region.flatMap((p) => p.outer)), latest.viewport));
    }
  } catch (e) {
    if (appStore.getState().planPick?.at === at) appStore.getState().setPlanPick({ status: 'error', at, message: e instanceof Error ? e.message : String(e) });
  }
}

export type PlanUse = 'water' | 'whole';

/** What a plan-area choice did, for the message under the buttons. */
export interface PlanUseResult {
  area: number;
  islands: number;
  shoreline: boolean;
  otherParts: number;
}

/**
 * Make the picked plan area the site. 'water': the water within it (OpenStreetMap water areas),
 * its islands as obstacles and the suggested shoreline. 'whole': the whole plan area as the water
 * area (its largest part), for plans drawn for the water alone; shoreline to be drawn.
 * The entrance is cleared: it belonged to the old site. One undo step.
 */
export async function usePlanArea(use: PlanUse, waterLookup: typeof lookupWaterRegion = lookupWaterRegion): Promise<PlanUseResult | null> {
  const s = appStore.getState();
  const pick = s.planPick;
  const map = s.project.map;
  if (!pick || pick.status !== 'found' || !map) return null;
  let next: Pick<Site, 'water' | 'shoreline'> & { islands: Vec2[][] };
  let result: PlanUseResult;
  if (use === 'whole') {
    const main = [...pick.region].sort((a, b) => polygonArea(b.outer) - polygonArea(a.outer))[0]!;
    next = { water: main.outer, shoreline: [], islands: [] };
    result = { area: polygonArea(main.outer), islands: 0, shoreline: false, otherParts: pick.region.length - 1 };
  } else {
    const box = boundingBox(pick.region.flatMap((p) => p.outer));
    const { water } = await waterLookup(map, { minX: box.minX - 10, minY: box.minY - 10, maxX: box.maxX + 10, maxY: box.maxY + 10 });
    const site = planSite(pick.region as Region, water);
    if (!site) return { area: 0, islands: 0, shoreline: false, otherParts: 0 };
    next = { water: site.water, shoreline: site.shoreline, islands: site.islands };
    result = { area: site.area, islands: site.islands.length, shoreline: site.shoreline.length >= 2, otherParts: site.otherParts };
  }
  appStore.getState().updateSite((site) => {
    // Islands of an earlier plan choice go; obstacles drawn by hand stay.
    const kept = site.obstacles.filter((o) => !o.id.startsWith('plan-island-'));
    const taken = kept.map((o) => o.id);
    const islands = next.islands.map((shape, i) => {
      let n = i + 1;
      while (taken.includes(`plan-island-${n}`)) n++;
      taken.push(`plan-island-${n}`);
      return { id: `plan-island-${n}`, kind: 'island' as const, shape };
    });
    return { ...site, water: next.water, shoreline: next.shoreline, entrance: NO_ENTRANCE, obstacles: [...kept, ...islands] };
  });
  appStore.getState().fitView();
  return result;
}
