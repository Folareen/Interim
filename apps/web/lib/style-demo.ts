/**
 * The style previews shown on the public demo: simulated people and outfits whose previews were
 * recorded from real runs (`packages/fixtures`). The images are small copies in `public/demo/style`.
 */
export const styleDemo = [
  { id: 'man-tracksuit', reference: 'tracksuit', current: 'man' },
  { id: 'man-layered', reference: 'layered-streetwear', current: 'man' },
  { id: 'man-smart-casual', reference: 'smart-casual', current: 'man' },
  { id: 'woman-denim', reference: 'denim', current: 'woman' },
  { id: 'woman-earth-tones', reference: 'earth-tones', current: 'woman' },
  { id: 'woman-monochrome', reference: 'monochrome', current: 'woman' },
] as const;
