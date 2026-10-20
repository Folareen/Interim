import { readFileSync } from 'node:fs';
import path from 'node:path';
import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { MAX_LONG_SIDE, detectFormat, normalisePhoto } from './photo';

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 70 } } });

describe('detectFormat', () => {
  it('reads the signature, not the name', async () => {
    expect(detectFormat(await solid(10, 10).jpeg().toBuffer())).toBe('jpeg');
    expect(detectFormat(await solid(10, 10).png().toBuffer())).toBe('png');
    expect(detectFormat(readFileSync(path.join(__dirname, 'fixtures/synthetic.heic')))).toBe('heic');
    expect(detectFormat(Buffer.from('not an image.jpg'))).toBeUndefined();
  });
});

describe('normalisePhoto', () => {
  it('converts PNG to JPEG', async () => {
    const result = await normalisePhoto(await solid(640, 800).png().toBuffer());
    expect(detectFormat(result.jpeg)).toBe('jpeg');
    expect(result.format).toBe('png');
  });

  it('converts HEIC to JPEG', async () => {
    const result = await normalisePhoto(readFileSync(path.join(__dirname, 'fixtures/synthetic.heic')));
    expect(detectFormat(result.jpeg)).toBe('jpeg');
    expect(result.format).toBe('heic');
    expect(Math.min(result.width, result.height)).toBeGreaterThanOrEqual(480);
  });

  it('caps the long side without enlarging', async () => {
    const big = await normalisePhoto(await solid(2000, 1500).jpeg().toBuffer());
    expect(Math.max(big.width, big.height)).toBe(MAX_LONG_SIDE);
    const small = await normalisePhoto(await solid(700, 600).jpeg().toBuffer());
    expect([small.width, small.height]).toEqual([700, 600]);
  });

  it('applies EXIF orientation and strips all EXIF', async () => {
    const tagged = await solid(800, 600).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const before = await sharp(tagged).metadata();
    expect(before.exif).toBeDefined();
    expect(before.orientation).toBe(6);

    const result = await normalisePhoto(tagged);
    expect([result.width, result.height]).toEqual([600, 800]);
    expect((await sharp(result.jpeg).metadata()).exif).toBeUndefined();
  });

  it('gives the same hash when the same picture is uploaded as different formats or twice', async () => {
    const png = await solid(640, 800).png().toBuffer();
    const a = await normalisePhoto(png);
    const b = await normalisePhoto(png);
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a file that is not an image, whatever it is called', async () => {
    await expect(normalisePhoto(Buffer.from('hello'))).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a photo that is too small', async () => {
    await expect(normalisePhoto(await solid(300, 300).jpeg().toBuffer())).rejects.toThrow(/too small/);
  });

  it('rejects a corrupt image with a plain message', async () => {
    const truncated = (await solid(800, 600).jpeg().toBuffer()).subarray(0, 40);
    await expect(normalisePhoto(truncated)).rejects.toThrow(/could not read/);
  });
});
