/**
 * I121: the anchoring design depth from the mean water depth around the site position (the
 * position of the wave screening: an entered one, else the centre of the site on the map). The
 * lookup runs by itself when the position is known and the depth follows the lookup
 * (`siteDepth.auto`); a depth typed in by hand turns that off. Each position and ray length is
 * looked up once per session by itself (undo does not start it again); the button always runs it.
 */
import { useEffect } from 'react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { SiteDepthResult } from '../engine/model';
import { lookupSiteDepth, type FetchOptions } from '../state/depth';
import { appStore, useAppStore } from '../state/store';
import { useSitePosition } from './sitePosition';

/** The smallest and largest design depth the anchoring field accepts, m. */
export const DESIGN_DEPTH_RANGE: [number, number] = [0.5, 100];
/** Wait after the position changes before looking it up, ms. */
const DEBOUNCE_MS = 800;

export type SiteDepthState =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'error'; message: string }
  /** No source has a depth around the position. */
  | { kind: 'none' }
  /** A mean depth outside the field's range: kept, not applied. */
  | { kind: 'outOfRange'; depth: number };

export const siteDepthStatus = createStore<{ state: SiteDepthState }>(() => ({ state: { kind: 'idle' } }));
export const useSiteDepthStatus = (): SiteDepthState => useStore(siteDepthStatus, (s) => s.state);
const setStatus = (state: SiteDepthState) => siteDepthStatus.setState({ state });

const tried = new Set<string>();
export const siteDepthKey = (position: { lat: number; lon: number }, radius: number): string => `${position.lat.toFixed(5)},${position.lon.toFixed(5)},${radius}`;
/** Forget the positions looked up by themselves (tests, and when the user turns the automatic depth on). */
export function resetSiteDepthTries(): void {
  tried.clear();
}

/** Look up the mean depth around `position` and set the design depth from it when it lies in the field's range. */
export async function runSiteDepthLookup(position: { lat: number; lon: number }, radius: number, o: FetchOptions = {}): Promise<SiteDepthResult | null> {
  setStatus({ kind: 'running', done: 0, total: 1 });
  try {
    const found = await lookupSiteDepth(position.lat, position.lon, radius, { ...o, onProgress: (done, total) => setStatus({ kind: 'running', done, total }) });
    if (!found) {
      setStatus({ kind: 'none' });
      return null;
    }
    const result: SiteDepthResult = { ...found, position: { lat: position.lat, lon: position.lon }, radius, fetchedOn: new Date().toISOString().slice(0, 10) };
    const depth = Math.round(result.depth * 10) / 10;
    if (depth < DESIGN_DEPTH_RANGE[0] || depth > DESIGN_DEPTH_RANGE[1]) {
      appStore.getState().setSiteDepth({ result });
      setStatus({ kind: 'outOfRange', depth: result.depth });
    } else {
      appStore.getState().applySiteDepth(result);
      setStatus({ kind: 'idle' });
    }
    return result;
  } catch (e) {
    if (o.signal?.aborted) setStatus({ kind: 'idle' });
    else setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Runs the lookup by itself when the site position is known and the design depth follows it. */
export function useAutoSiteDepth(o: Pick<FetchOptions, 'fetchImpl'> = {}): void {
  const { position } = useSitePosition();
  const auto = useAppStore((s) => s.project.siteDepth.auto);
  const radius = useAppStore((s) => s.project.siteDepth.radius);
  const result = useAppStore((s) => s.project.siteDepth.result);
  const lat = position?.lat;
  const lon = position?.lon;
  const fetchImpl = o.fetchImpl;
  useEffect(() => {
    if (!auto || lat === undefined || lon === undefined) return;
    const key = siteDepthKey({ lat, lon }, radius);
    if ((result && siteDepthKey(result.position, result.radius) === key) || tried.has(key)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      tried.add(key);
      void runSiteDepthLookup({ lat, lon }, radius, { signal: controller.signal, ...(fetchImpl ? { fetchImpl } : {}) });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [auto, lat, lon, radius, result, fetchImpl]);
}
