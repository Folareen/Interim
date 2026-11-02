import type { StyleSampleSet } from '@interim/types';

/** Where the sample photos are read from, provided by the module from the environment. */
export interface StyleSamplesConfig {
  /** The directory the sets' file names are relative to (`packages/fixtures/own`). */
  dir: string;
  sets: Record<StyleSampleSet, { references: readonly string[]; current: string }>;
}
export const STYLE_SAMPLES = Symbol('STYLE_SAMPLES');

/**
 * The simulated people and outfits with recorded previews in `packages/fixtures`, so trying them
 * costs nothing in replay mode. The photos are saved unresized: a normalised upload of the same
 * file hashes the same, which is what finds the recording.
 */
export const sampleSets: StyleSamplesConfig['sets'] = {
  one: { references: ['style/tracksuit.jpg', 'style/layered-streetwear.jpg', 'style/smart-casual.jpg'], current: 'b/body-1.jpg' },
  two: { references: ['style/denim.jpg', 'style/earth-tones.jpg', 'style/monochrome.jpg'], current: 'style/current-woman.jpg' },
};
