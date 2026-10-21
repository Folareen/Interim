import type { CaptureProblem } from '@interim/types';

/** What the device and the server measure on a photo, so both apply one rule. */
export interface PhotoStats {
  width: number;
  height: number;
  /** Mean brightness, 0 (black) to 255 (white). */
  meanLuma: number;
  /** Variance of a Laplacian filter over a grayscale copy; low means soft or blurred. */
  sharpness: number;
}

/**
 * The long side photos are shrunk to before light and sharpness are measured. The device and the
 * server both use it, because the sharpness number depends on the resolution.
 */
export const STATS_LONG_SIDE = 640;

/** Added to every pixel of the sharpness filter so negative responses are not clipped to black. */
export const SHARPNESS_OFFSET = 128;

// Provisional until the panel run (docs/product/spec.md section 17, item 4): they were set on
// synthetic and portrait photos, and must be tuned so people of every skin tone and hair type
// pass at a similar rate. Keep them here, never inline in a caller.
const MIN_SHORT_SIDE = 480;
const MIN_LUMA = 55;
const MAX_LUMA = 215;
const MIN_SHARPNESS = 40;

/**
 * Whether a photo is usable before anything is uploaded or paid for.
 * @returns What to fix, or undefined when it passes. Advisory on the device; the server asks again.
 */
export function photoQualityProblem(stats: PhotoStats): CaptureProblem | undefined {
  if (Math.min(stats.width, stats.height) < MIN_SHORT_SIDE) return 'too_small';
  if (stats.meanLuma < MIN_LUMA) return 'too_dark';
  if (stats.meanLuma > MAX_LUMA) return 'too_bright';
  if (stats.sharpness < MIN_SHARPNESS) return 'blurry';
  return undefined;
}
