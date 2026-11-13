/**
 * View transform between world coordinates (metres, x east, y north) and screen pixels
 * (x right, y down). Pure functions; the canvas component holds the state.
 */
import type { Box } from '../engine/geometry';
import type { Vec2 } from '../engine/model';

export interface View {
  /** World point shown at the centre of the canvas. */
  cx: number;
  cy: number;
  /** Pixels per metre. */
  zoom: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 400;

export const DEFAULT_VIEW: View = { cx: 0, cy: 0, zoom: 4 };

export const worldToScreen = (view: View, size: Size, p: Vec2): Vec2 => ({
  x: (p.x - view.cx) * view.zoom + size.width / 2,
  y: -(p.y - view.cy) * view.zoom + size.height / 2,
});

export const screenToWorld = (view: View, size: Size, p: Vec2): Vec2 => ({
  x: (p.x - size.width / 2) / view.zoom + view.cx,
  y: -(p.y - size.height / 2) / view.zoom + view.cy,
});

/** Zoom by `factor`, keeping the world point under the cursor where it is (SPEC §8). */
export function zoomAt(view: View, size: Size, cursor: Vec2, factor: number): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const anchor = screenToWorld(view, size, cursor);
  return {
    zoom,
    cx: anchor.x - (cursor.x - size.width / 2) / zoom,
    cy: anchor.y + (cursor.y - size.height / 2) / zoom,
  };
}

/** Move the view by a drag of (dx, dy) screen pixels. */
export const panBy = (view: View, dx: number, dy: number): View => ({
  ...view,
  cx: view.cx - dx / view.zoom,
  cy: view.cy + dy / view.zoom,
});

/** The view that shows the whole box with `padding` pixels around it. */
export function fitBounds(box: Box, size: Size, padding = 40): View {
  const w = Math.max(box.maxX - box.minX, 1e-6);
  const h = Math.max(box.maxY - box.minY, 1e-6);
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min((size.width - 2 * padding) / w, (size.height - 2 * padding) / h)),
  );
  return { cx: (box.minX + box.maxX) / 2, cy: (box.minY + box.maxY) / 2, zoom };
}

export function visibleBounds(view: View, size: Size): Box {
  const a = screenToWorld(view, size, { x: 0, y: size.height });
  const b = screenToWorld(view, size, { x: size.width, y: 0 });
  return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
}

/** Smallest value of the series 1, 2, 5, 10, 20, 50, … (×10ⁿ) that is at least `value`. */
export function niceStep(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const m of [1, 2, 5, 10]) if (m * base >= value * (1 - 1e-9)) return m * base;
  return 10 * base;
}

/** Grid spacing in metres so that lines are at least `minPixels` apart. */
export const gridStep = (zoom: number, minPixels = 40): number => niceStep(minPixels / zoom);

/** A scale bar of a round number of metres, at most `maxPixels` long. */
export function scaleBar(zoom: number, maxPixels = 160): { metres: number; pixels: number } {
  let metres = niceStep(maxPixels / zoom);
  // niceStep rounds up; step down until the bar fits.
  while (metres * zoom > maxPixels) {
    const exponent = Math.floor(Math.log10(metres));
    const mantissa = Math.round(metres / 10 ** exponent);
    metres = mantissa === 1 ? 5 * 10 ** (exponent - 1) : mantissa === 2 ? 10 ** exponent : mantissa === 5 ? 2 * 10 ** exponent : 5 * 10 ** exponent;
  }
  return { metres, pixels: metres * zoom };
}
