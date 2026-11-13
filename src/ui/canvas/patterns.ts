/** Small tiling images for hatched fills (SPEC §8: fairways and restricted zones). */

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
    fairway: hatch('rgba(186, 230, 253, 0.55)', 'rgba(56, 189, 248, 0.9)'),
    zone: hatch('rgba(254, 202, 202, 0.45)', 'rgba(220, 38, 38, 0.9)'),
  };
  return cache;
}
