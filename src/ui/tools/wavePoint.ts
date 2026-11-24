/**
 * U35: the point of the wave screening picked on the map. The click's local metres become a
 * latitude and longitude through the map's origin (U14), rounded to 1e-5° (about 1 m), and are
 * stored as the entered position, which every lookup of the wave panel starts from.
 */
import type { Vec2 } from '../../engine/model';
import { localToLatLon } from '../../state/geo';
import { appStore } from '../../state/store';

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** Set the wave position at a point of the drawing; false when there is no map to place it by. */
export function pickWavePoint(at: Vec2): boolean {
  const s = appStore.getState();
  const map = s.project.map;
  if (!map) return false;
  const g = localToLatLon(map, at);
  s.setWaves({ location: { lat: round5(g.lat), lon: round5(g.lon) } });
  s.setTool('select');
  return true;
}
