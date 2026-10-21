import { createHash } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';
import convertHeic from 'heic-convert';
import sharp from 'sharp';

/** The long side photos are capped to: the strictest limit any YouCam tool sends (beard style, under 1024 px). */
export const MAX_LONG_SIDE = 1000;

/** The smallest short side any YouCam tool accepts (skin analysis SD). */
export const MIN_SHORT_SIDE = 480;
// Guards against decompression bombs; a 12 MB file can still decode to a huge bitmap.
const MAX_INPUT_PIXELS = 50_000_000;

/** The formats the app accepts. HEIC is converted to JPEG. */
export type PhotoFormat = 'jpeg' | 'png' | 'heic';

/** Identifies the format from the file's first bytes. The file name and declared type are never trusted. */
export function detectFormat(bytes: Buffer): PhotoFormat | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.length >= 12 && bytes.toString('latin1', 4, 8) === 'ftyp') {
    const brand = bytes.toString('latin1', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return undefined;
}

/** A photo after normalisation, ready to store and send to YouCam. */
export interface NormalisedPhoto {
  jpeg: Buffer;
  /** Of the normalised file, so the same picture uploaded twice matches (spec section 5). */
  sha256: string;
  width: number;
  height: number;
  format: PhotoFormat;
}

/**
 * Turns an upload into the JPEG every later step uses: HEIC converted, orientation applied, all
 * EXIF and location data dropped, long side capped.
 * @throws UnprocessableEntityException with a plain sentence when the file cannot be used.
 */
export async function normalisePhoto(bytes: Buffer): Promise<NormalisedPhoto> {
  const format = detectFormat(bytes);
  if (!format) throw new UnprocessableEntityException('Use a JPEG, PNG or HEIC photo.');

  try {
    const decoded =
      format === 'heic' ? Buffer.from(await convertHeic({ buffer: bytes, format: 'JPEG', quality: 0.92 })) : bytes;
    // sharp drops metadata unless asked to keep it; rotate() bakes the EXIF orientation into the pixels.
    const { data, info } = await sharp(decoded, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_LONG_SIDE, height: MAX_LONG_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer({ resolveWithObject: true });

    if (Math.min(info.width, info.height) < MIN_SHORT_SIDE) {
      throw new UnprocessableEntityException('This photo is too small. Take it again closer to the camera.');
    }
    return {
      jpeg: data,
      sha256: createHash('sha256').update(data).digest('hex'),
      width: info.width,
      height: info.height,
      format,
    };
  } catch (error) {
    if (error instanceof UnprocessableEntityException) throw error;
    // Corrupt or oversized images land here; the person gets a sentence, not a decoder message.
    throw new UnprocessableEntityException('We could not read this photo. Try taking it again.');
  }
}
