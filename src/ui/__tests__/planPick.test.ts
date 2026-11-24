import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { boundingBox, polygonArea, regionArea } from '../../engine/geometry';
import { regionFromPolygons } from '../../engine/planSite';
import { appStore, emptyProject } from '../../state/store';
import { latLonToLocal } from '../../state/geo';
import { pickPlanAt, usePlanArea } from '../tools/planPick';
import { hasEntrance } from '../tools/sitePaths';

/** The real answer of kartta.hel.fi for plan 461 (fetched 2026-11-23). */
const answer = readFileSync('src/state/__tests__/fixtures/hel-plan-461.json', 'utf8');
const fakeFetch = (async () => new Response(answer)) as unknown as typeof fetch;
const origin = { lat: 60.164, lon: 24.9525 };

beforeEach(() => {
  const p = emptyProject();
  p.map = { provider: 'helsinki-base', ...origin, opacity: 0.8, planOverlay: true };
  appStore.getState().replaceProject(p);
  appStore.getState().setPlanPick(null);
});

describe('pick a detailed plan area as the site (U34)', () => {
  it('a click looks up the plan at that point and shows its area in local metres', async () => {
    const at = latLonToLocal(origin, 60.164, 24.9525);
    await pickPlanAt(at, fakeFetch);
    const pick = appStore.getState().planPick!;
    expect(pick.status).toBe('found');
    if (pick.status !== 'found') return;
    expect(pick.plan.code).toBe('461');
    // The service's own area, 129 385.7 m², within 0.5 %.
    expect(Math.abs(regionArea(pick.region) / 129385.68 - 1)).toBeLessThan(0.005);
  });

  it('no plan at the point, and a failing service, are told apart', async () => {
    await pickPlanAt({ x: 0, y: 0 }, (async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }))) as unknown as typeof fetch);
    expect(appStore.getState().planPick?.status).toBe('none');
    await pickPlanAt({ x: 0, y: 0 }, (async () => new Response('', { status: 500 })) as unknown as typeof fetch);
    const pick = appStore.getState().planPick!;
    expect(pick.status === 'error' && pick.message).toBe('kartta.hel.fi answered 500');
  });

  it('"Use the water within it": water = plan ∩ water, islands as obstacles, a shoreline, the entrance cleared; one undo step', async () => {
    await pickPlanAt({ x: 0, y: 0 }, fakeFetch);
    const pick = appStore.getState().planPick!;
    if (pick.status !== 'found') throw new Error('no plan');
    // Water: the northern half of the plan's bounding box, with a 6 × 6 m islet inside the plan.
    const box = boundingBox(pick.region.flatMap((p) => p.outer));
    const midY = (box.minY + box.maxY) / 2;
    const inner = pick.region.sort((a, b) => polygonArea(b.outer) - polygonArea(a.outer))[0]!.outer;
    const c = boundingBox(inner);
    const cx = (c.minX + c.maxX) / 2;
    const cy = Math.max(midY + 20, (c.minY + c.maxY) / 2);
    const islet = [
      { x: cx - 3, y: cy - 3 },
      { x: cx + 3, y: cy - 3 },
      { x: cx + 3, y: cy + 3 },
      { x: cx - 3, y: cy + 3 },
    ];
    const north = [
      { x: box.minX - 50, y: midY },
      { x: box.maxX + 50, y: midY },
      { x: box.maxX + 50, y: box.maxY + 50 },
      { x: box.minX - 50, y: box.maxY + 50 },
    ];
    const waterLookup = async () => ({ water: regionFromPolygons([[north, islet]]), tiles: 1 });
    appStore.getState().updateSite((s) => ({ ...s, entrance: { a: { x: 1, y: 1 }, b: { x: 5, y: 5 } } }));
    const pastBefore = appStore.getState().past.length;
    const r = (await usePlanArea('water', waterLookup))!;
    const site = appStore.getState().project.site;
    expect(r.area).toBeGreaterThan(0);
    expect(site.water.length).toBeGreaterThanOrEqual(3);
    expect(site.water.every((p) => p.y >= midY - 0.6)).toBe(true);
    const islands = site.obstacles.filter((o) => o.kind === 'island');
    // The islet lies in the plan's water only if the plan covers that point; either way the count matches.
    expect(islands.length).toBe(r.islands);
    for (const o of islands) expect(o.id).toMatch(/^plan-island-\d+$/);
    expect(r.shoreline).toBe(site.shoreline.length >= 2);
    expect(hasEntrance(site)).toBe(false);
    expect(appStore.getState().past.length).toBe(pastBefore + 1);
    appStore.getState().undo();
    expect(hasEntrance(appStore.getState().project.site)).toBe(true);
  });

  it('"Use the whole area as water": the largest part of the plan; no shoreline', async () => {
    await pickPlanAt({ x: 0, y: 0 }, fakeFetch);
    const pick = appStore.getState().planPick!;
    if (pick.status !== 'found') throw new Error('no plan');
    const largest = Math.max(...pick.region.map((p) => polygonArea(p.outer)));
    const r = (await usePlanArea('whole'))!;
    expect(r.area).toBeCloseTo(largest, 6);
    expect(polygonArea(appStore.getState().project.site.water)).toBeCloseTo(largest, 6);
    expect(appStore.getState().project.site.shoreline).toEqual([]);
    expect(r.otherParts).toBe(pick.region.length - 1);
  });
});
