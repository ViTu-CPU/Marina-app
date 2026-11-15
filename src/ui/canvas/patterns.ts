/** Small tiling images for hatched fills (SPEC §8: fairways and restricted zones). */
import { HATCH } from './colors';

function hatch(background: string, line: string): HTMLCanvasElement {
  const size = 10;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // One diagonal plus its wrap-around corners, so the tile repeats seamlessly.
    ctx.moveTo(0, size);
    ctx.lineTo(size, 0);
    ctx.moveTo(-1, 1);
    ctx.lineTo(1, -1);
    ctx.moveTo(size - 1, size + 1);
    ctx.lineTo(size + 1, size - 1);
    ctx.stroke();
  }
  return canvas;
}

let cache: { fairway: HTMLCanvasElement; zone: HTMLCanvasElement } | null = null;

export function hatchPatterns(): { fairway: HTMLCanvasElement; zone: HTMLCanvasElement } {
  cache ??= {
    fairway: hatch(...HATCH.fairway),
    zone: hatch(...HATCH.zone),
  };
  return cache;
}
