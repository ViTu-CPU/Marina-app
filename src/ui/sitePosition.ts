/** The position the site lookups use (D41, D47, D50): an entered one, else the centre of the site on the map. */
import { centroid } from '../engine/geometry';
import { localToLatLon } from '../state/geo';
import { useAppStore } from '../state/store';

export function useSitePosition(): { position: { lat: number; lon: number } | null; siteCentre: { lat: number; lon: number } | null } {
  const location = useAppStore((s) => s.project.waves.location);
  const map = useAppStore((s) => s.project.map);
  const water = useAppStore((s) => s.project.site.water);
  // U36: the start map is not a site yet: it gives a position only once the water area is drawn on it.
  const placed = map !== null && (!map.startMap || water.length >= 3);
  const siteCentre = map && placed ? localToLatLon(map, water.length >= 3 ? centroid(water) : { x: 0, y: 0 }) : null;
  return { position: location ?? siteCentre, siteCentre };
}
