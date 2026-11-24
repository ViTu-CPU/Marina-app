// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { appStore, emptyProject } from '../../state/store';
import { useSitePosition } from '../sitePosition';

beforeEach(() => appStore.getState().replaceProject(emptyProject()));

describe('start map and the site position (U36)', () => {
  it('gives no site position until a water area is drawn on it', () => {
    const { result, rerender } = renderHook(() => useSitePosition());
    expect(result.current.position).toBeNull();
    appStore.getState().updateSite((s) => ({ ...s, water: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }));
    rerender();
    // The centroid (66.7, 33.3) m from Senate Square: north-east of it.
    const p = result.current.position!;
    expect(p.lat).toBeGreaterThan(60.16944);
    expect(p.lon).toBeGreaterThan(24.9525);
  });

  it('a map placed by the user gives its position at once', () => {
    appStore.getState().setMap({ provider: 'osm', lat: 60.2, lon: 25, opacity: 0.8 });
    const { result } = renderHook(() => useSitePosition());
    expect(result.current.position!.lat).toBeCloseTo(60.2, 9);
    expect(result.current.position!.lon).toBeCloseTo(25, 9);
  });
});
