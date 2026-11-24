import { beforeEach, describe, expect, it } from 'vitest';
import { latLonToLocal } from '../../state/geo';
import { appStore, emptyProject } from '../../state/store';
import { pickWavePoint } from '../tools/wavePoint';

beforeEach(() => appStore.getState().replaceProject(emptyProject()));

describe('wave point picked on the map (U35)', () => {
  it('without a map nothing is set', () => {
    expect(pickWavePoint({ x: 10, y: 10 })).toBe(false);
    expect(appStore.getState().project.waves.location).toBeNull();
  });

  it('a click sets the entered position (to about 1 m) and ends the tool', () => {
    const p = emptyProject();
    p.map = { provider: 'osm', lat: 60.15, lon: 24.95, opacity: 0.8 };
    appStore.getState().replaceProject(p);
    appStore.getState().setTool('wavePoint');
    // A point 500 m east and 300 m north of the map origin.
    expect(pickWavePoint({ x: 500, y: 300 })).toBe(true);
    const loc = appStore.getState().project.waves.location!;
    const back = latLonToLocal(p.map!, loc.lat, loc.lon);
    // 1e-5° is about 1.1 m north–south and 0.6 m east–west at 60° N.
    expect(Math.abs(back.x - 500)).toBeLessThan(0.6);
    expect(Math.abs(back.y - 300)).toBeLessThan(1.2);
    expect(loc.lat).toBe(Math.round(loc.lat * 1e5) / 1e5);
    expect(appStore.getState().tool).toBe('select');
    // One undo step gives back the earlier position.
    appStore.getState().undo();
    expect(appStore.getState().project.waves.location).toBeNull();
  });
});
