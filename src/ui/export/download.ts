/** Browser download and file-open helpers. */
import type Konva from 'konva';

export function downloadText(filename: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  downloadUrl(filename, url);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadUrl(filename: string, url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** A file name without characters that file systems reject. */
export const safeFileName = (name: string): string => name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-') || 'marina';

let stage: Konva.Stage | null = null;

/** The canvas registers its stage here so that the toolbar can export it. */
export const registerStage = (s: Konva.Stage | null): void => {
  stage = s;
};

/**
 * PNG of the canvas as currently shown, at twice the screen resolution. The disclaimer
 * and the scale bar are drawn on the canvas itself, so they are part of the image.
 */
export function exportPng(filename: string): boolean {
  if (!stage) return false;
  downloadUrl(filename, stage.toDataURL({ pixelRatio: 2, mimeType: 'image/png' }));
  return true;
}

export const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

export const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The image could not be read.'));
    image.src = url;
  });
