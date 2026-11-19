// @vitest-environment jsdom
/** I121: the design depth follows the lookup around the site position by itself. */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appStore, emptyProject } from '../../state/store';
import { resetSiteDepthTries, siteDepthStatus, useAutoSiteDepth } from '../siteDepth';

describe('automatic design depth (I121)', () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return new Response(JSON.stringify(new Array(1000).fill(-3.64)));
  }) as typeof fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    calls = 0;
    resetSiteDepthTries();
    siteDepthStatus.setState({ state: { kind: 'idle' } });
    appStore.getState().replaceProject(emptyProject());
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const settle = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  };

  it('without a position nothing is asked and the depth stays 4 m', async () => {
    renderHook(() => useAutoSiteDepth({ fetchImpl }));
    await settle();
    expect(calls).toBe(0);
    expect(appStore.getState().project.anchoring.depth).toBe(4);
  });

  it('a position in the Waves window: the mean depth becomes the design depth, once per position', async () => {
    renderHook(() => useAutoSiteDepth({ fetchImpl }));
    act(() => appStore.getState().setWaves({ location: { lat: 60.15, lon: 24.95 } }));
    await settle();
    expect(calls).toBe(8);
    expect(appStore.getState().project.anchoring.depth).toBe(3.6);
    expect(appStore.getState().project.siteDepth.result).toMatchObject({ source: 'emodnet', radius: 200, position: { lat: 60.15, lon: 24.95 } });
    expect(appStore.getState().project.siteDepth.result!.depth).toBeCloseTo(3.64, 9);
    // Undo brings the old depth back without a new lookup.
    act(() => appStore.getState().undo());
    await settle();
    expect(calls).toBe(8);
    expect(appStore.getState().project.anchoring.depth).toBe(4);
  });

  it('a depth typed in by hand is not overwritten', async () => {
    renderHook(() => useAutoSiteDepth({ fetchImpl }));
    act(() => appStore.getState().setDesignDepth(6));
    act(() => appStore.getState().setWaves({ location: { lat: 60.15, lon: 24.95 } }));
    await settle();
    expect(calls).toBe(0);
    expect(appStore.getState().project.anchoring.depth).toBe(6);
  });
});
