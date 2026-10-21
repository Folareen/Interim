import { SHARPNESS_OFFSET, STATS_LONG_SIDE, type PhotoStats, photoQualityProblem } from '@interim/rules';
import type { CaptureProblem } from '@interim/types';

/**
 * Brightness and sharpness of an image, from its RGBA pixels. The same measures as the server's
 * (`snapshots/photo.ts`), so a photo that passes here passes there. The device check is advisory;
 * the server asks again before anything is paid for.
 */
export function pixelStats(rgba: Uint8ClampedArray, width: number, height: number): Pick<PhotoStats, 'meanLuma' | 'sharpness'> {
  const gray = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const g = 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
    gray[i] = g;
    sum += g;
  }

  // Variance of a Laplacian filter, offset and clipped as the server's filter is.
  let n = 0;
  let mean = 0;
  let squares = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const at = y * width + x;
      const edge = (gray[at - 1] ?? 0) + (gray[at + 1] ?? 0) + (gray[at - width] ?? 0) + (gray[at + width] ?? 0) - 4 * (gray[at] ?? 0);
      const v = Math.min(255, Math.max(0, SHARPNESS_OFFSET + edge));
      n++;
      mean += v;
      squares += v * v;
    }
  }
  const variance = n === 0 ? 0 : squares / n - (mean / n) ** 2;
  return { meanLuma: sum / gray.length, sharpness: variance };
}

/**
 * Checks a photo on the device before it is uploaded.
 * @returns What to fix, or undefined when it passes. A format the browser cannot decode (some HEIC)
 * also returns undefined, because the server converts and checks it.
 */
export async function checkPhoto(photo: Blob): Promise<CaptureProblem | undefined> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(photo);
  } catch {
    return undefined;
  }
  const scale = Math.min(1, STATS_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(bitmap, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const stats = pixelStats(data, width, height);
  const original = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return photoQualityProblem({ ...original, ...stats });
}
