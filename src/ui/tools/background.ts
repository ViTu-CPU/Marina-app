/**
 * Background image placement and two-point scale calibration (SPEC §3.2).
 */
import { distance } from '../../engine/geometry';
import type { BackgroundImage, Vec2 } from '../../engine/model';
import type { Size } from '../../state/view';

/**
 * Two-point calibration: the user clicked world points `p1` and `p2` on the image and
 * says they are `realDistance` metres apart. The image is rescaled about `p1`, so that
 * point stays where it is on screen. Returns null for unusable input.
 */
export function calibrateBackground(
  background: BackgroundImage,
  p1: Vec2,
  p2: Vec2,
  realDistance: number,
): BackgroundImage | null {
  const current = distance(p1, p2);
  if (!(current > 0) || !(realDistance > 0)) return null;
  const k = realDistance / current;
  return {
    ...background,
    metresPerPixel: background.metresPerPixel * k,
    origin: { x: p1.x + (background.origin.x - p1.x) * k, y: p1.y + (background.origin.y - p1.y) * k },
  };
}

/**
 * Initial placement of a newly loaded image: centred on `centre`, scaled so that it
 * spans `widthMetres`. The scale is only a starting point until the image is calibrated.
 */
export function placeBackground(dataUrl: string, image: Size, centre: Vec2, widthMetres: number): BackgroundImage {
  const metresPerPixel = widthMetres / image.width;
  return {
    dataUrl,
    metresPerPixel,
    // `origin` is the top-left corner: west of and north of the centre.
    origin: { x: centre.x - widthMetres / 2, y: centre.y + (image.height * metresPerPixel) / 2 },
    rotation: 0,
    opacity: 0.6,
  };
}
