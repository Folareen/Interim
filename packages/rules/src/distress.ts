import type { LiveLocale } from '@interim/types';
import { wholeWords } from './whole-words';

// Plain code, never the model (docs/product/spec.md section 13): the device runs this on reflection
// text and a match replaces the screen with crisis contacts. It errs towards matching, since a
// false match costs one screen and a missed one costs far more. Each language's list is native-reviewed.
const apostrophe = "['’]?";
const patterns: Record<LiveLocale, RegExp> = {
  en: wholeWords([
    'suicid(?:e|al)',
    'kill(?:ing)? myself',
    'end(?:ing)? my life',
    'end it all',
    'take my (?:own )?life',
    'want(?:ed)? to die',
    'wanna die',
    'better off dead',
    'better off without me',
    'no reason to live',
    `don${apostrophe}t want to (?:be here|live|wake up)`,
    `can${apostrophe}t go on`,
    'self[- ]?harm(?:ing)?',
    'hurt(?:ing)? myself',
    'cut(?:ting)? myself',
  ]),
};

/**
 * Whether text suggests crisis or self-harm, so the app shows crisis contacts before anything else.
 * English is always checked as well, because people mix languages when they write.
 */
export function soundsLikeCrisis(text: string, locale: LiveLocale): boolean {
  return patterns[locale].test(text) || patterns.en.test(text);
}

/** Regions with their own crisis contacts. `other` points to a directory. */
export type CrisisRegion = 'us' | 'ca' | 'gb' | 'ie' | 'au' | 'other';

/** One crisis service. `phone` is null for a directory that lists services instead. */
export interface CrisisContact {
  name: string;
  phone: string | null;
  how: Record<LiveLocale, string>;
  url: string;
}

// Check each entry against the official service before launch.
/** Crisis contacts per region. `other` points to a directory of helplines by country. */
export const crisisContacts: Record<CrisisRegion, readonly CrisisContact[]> = {
  us: [{ name: '988 Suicide & Crisis Lifeline', phone: '988', how: { en: 'Call or text 988, any time.' }, url: 'https://988lifeline.org' }],
  ca: [{ name: '9-8-8 Suicide Crisis Helpline', phone: '988', how: { en: 'Call or text 988, any time.' }, url: 'https://988.ca' }],
  gb: [{ name: 'Samaritans', phone: '116 123', how: { en: 'Call 116 123 free, any time.' }, url: 'https://www.samaritans.org' }],
  ie: [{ name: 'Samaritans', phone: '116 123', how: { en: 'Call 116 123 free, any time.' }, url: 'https://www.samaritans.org/ireland' }],
  au: [{ name: 'Lifeline', phone: '13 11 14', how: { en: 'Call 13 11 14, any time.' }, url: 'https://www.lifeline.org.au' }],
  other: [{ name: 'Find A Helpline', phone: null, how: { en: 'Find a free, confidential helpline in your country.' }, url: 'https://findahelpline.com' }],
};

const regions: Record<string, CrisisRegion> = { US: 'us', CA: 'ca', GB: 'gb', UK: 'gb', IE: 'ie', AU: 'au' };

/**
 * Picks the crisis region from a BCP 47 locale such as `navigator.language`. An unknown or missing
 * region falls back to the directory.
 * @example crisisRegionFor('en-GB') // 'gb'
 */
export function crisisRegionFor(locale: string): CrisisRegion {
  const region = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(locale)?.[1]?.toUpperCase();
  return (region && regions[region]) || 'other';
}
