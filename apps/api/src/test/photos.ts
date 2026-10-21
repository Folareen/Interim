import sharp from 'sharp';

/** A photo that passes the quality check: mid brightness with plenty of edges. */
export function texturedJpeg(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } },
  })
    .jpeg()
    .toBuffer();
}

/** A flat grey photo: evenly lit, with no detail, so it reads as blurred. */
export function blurredJpeg(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#808080' } }).jpeg().toBuffer();
}

/** A textured photo that is too dark to use. */
export function darkJpeg(width = 800, height = 600): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#101010', noise: { type: 'gaussian', mean: 20, sigma: 12 } },
  })
    .jpeg()
    .toBuffer();
}
