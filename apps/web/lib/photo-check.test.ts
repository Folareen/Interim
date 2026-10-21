import { describe, expect, it } from 'vitest';
import { pixelStats } from './photo-check';

const image = (width: number, height: number, value: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.fill(value(x, y), (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
  return data;
};

describe('pixelStats', () => {
  it('reads a flat grey image as evenly lit and blurred', () => {
    const stats = pixelStats(image(20, 20, () => 128), 20, 20);
    expect(stats.meanLuma).toBeCloseTo(128, 0);
    expect(stats.sharpness).toBe(0);
  });

  it('reads a dark image as dark', () => {
    expect(pixelStats(image(20, 20, () => 10), 20, 20).meanLuma).toBeLessThan(55);
  });

  it('reads an image with edges as sharper than a smooth one', () => {
    const checker = pixelStats(image(20, 20, (x, y) => ((x + y) % 2 ? 200 : 60)), 20, 20);
    const gradient = pixelStats(image(20, 20, (x) => x * 10), 20, 20);
    expect(checker.sharpness).toBeGreaterThan(gradient.sharpness);
    expect(checker.sharpness).toBeGreaterThan(40);
  });

  it('does not fail on an image too small to have an interior', () => {
    expect(pixelStats(image(2, 2, () => 100), 2, 2).sharpness).toBe(0);
  });
});
