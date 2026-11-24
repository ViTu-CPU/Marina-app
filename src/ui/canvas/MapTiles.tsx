/**
 * Online map drawn under the site, inside the world-space group: OpenStreetMap tiles or, U34, a
 * City of Helsinki base map as WMS images in the same tile grid, with the detailed plan over it.
 */
import { useEffect, useMemo, useReducer } from 'react';
import { Image as KonvaImage } from 'react-konva';
import type { MapBackground } from '../../engine/model';
import { tileRect, tilesCovering, tileZoomFor } from '../../state/geo';
import { baseTileUrl, planTileUrl } from '../../state/helsinki';
import { visibleBounds, type Size, type View } from '../../state/view';

/** Tiles kept in memory. The browser's own HTTP cache follows the server's cache headers. */
const CACHE_LIMIT = 300;

type Entry = { image: HTMLImageElement; ready: boolean };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();

function requestTile(url: string): Entry {
  let entry = cache.get(url);
  if (entry) return entry;
  const image = new Image();
  // Needed so that the canvas can still be exported as a PNG with map tiles on it.
  image.crossOrigin = 'anonymous';
  entry = { image, ready: false };
  const created = entry;
  image.onload = () => {
    created.ready = true;
    for (const notify of listeners) notify();
  };
  image.onerror = () => cache.delete(url);
  image.src = url;
  cache.set(url, entry);
  // Drop the oldest entries; a Map iterates in insertion order.
  for (const key of cache.keys()) {
    if (cache.size <= CACHE_LIMIT) break;
    cache.delete(key);
  }
  return entry;
}

export function MapTiles({ map, view, viewport }: { map: MapBackground; view: View; viewport: Size }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(redraw);
    return () => void listeners.delete(redraw);
  }, []);

  const origin = useMemo(() => ({ lat: map.lat, lon: map.lon }), [map.lat, map.lon]);
  // Only the tiles in view are requested; nothing is fetched ahead (OSM Tile Usage Policy).
  const tiles = tilesCovering(origin, visibleBounds(view, viewport), tileZoomFor(origin, view.zoom));

  const layers: { key: string; url: (tile: (typeof tiles)[number]) => string }[] = [{ key: map.provider, url: (tile) => baseTileUrl(map.provider, tile) }];
  if (map.planOverlay) layers.push({ key: 'plan', url: planTileUrl });

  return (
    <>
      {layers.flatMap((layer) =>
        tiles.map((tile) => {
          const entry = requestTile(layer.url(tile));
          if (!entry.ready) return null;
          const rect = tileRect(origin, tile);
          return (
            <KonvaImage
              key={`${layer.key}/${tile.z}/${tile.x}/${tile.y}`}
              image={entry.image}
              x={rect.x}
              y={rect.top}
              width={rect.width}
              height={rect.height}
              // The world group flips y; flip the tile back.
              scaleY={-1}
              opacity={map.opacity}
              listening={false}
            />
          );
        }),
      )}
    </>
  );
}
