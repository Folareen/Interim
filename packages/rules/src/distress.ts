// docs/product/overview.md (The companion) and spec section 13. Plain code, never the model: the
// device runs this on reflection text, and a match replaces the screen with crisis contacts.
// It errs towards showing contacts; a false match costs one screen, a missed one costs far more.
const apostrophe = "['’]?";
const pattern = new RegExp(
  [
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
  ]
    .map((phrase) => `\\b${phrase}\\b`)
    .join('|'),
  'i',
);

/** Whether text suggests crisis or self-harm, so the app shows crisis contacts before anything else. */
export function soundsLikeCrisis(text: string): boolean {
  return pattern.test(text);
}

export type CrisisRegion = 'us' | 'ca' | 'gb' | 'ie' | 'au' | 'other';

/** One crisis service. `phone` is null for a directory that lists services instead. */
export interface CrisisContact {
  name: string;
  phone: string | null;
  how: string;
  url: string;
}

// Check each entry against the official service before launch (docs/product/research.md section 8).
/** Crisis contacts per region. `other` points to a directory of helplines by country. */
export const crisisContacts: Record<CrisisRegion, readonly CrisisContact[]> = {
  us: [{ name: '988 Suicide & Crisis Lifeline', phone: '988', how: 'Call or text 988, any time.', url: 'https://988lifeline.org' }],
  ca: [{ name: '9-8-8 Suicide Crisis Helpline', phone: '988', how: 'Call or text 988, any time.', url: 'https://988.ca' }],
  gb: [{ name: 'Samaritans', phone: '116 123', how: 'Call 116 123 free, any time.', url: 'https://www.samaritans.org' }],
  ie: [{ name: 'Samaritans', phone: '116 123', how: 'Call 116 123 free, any time.', url: 'https://www.samaritans.org/ireland' }],
  au: [{ name: 'Lifeline', phone: '13 11 14', how: 'Call 13 11 14, any time.', url: 'https://www.lifeline.org.au' }],
  other: [{ name: 'Find A Helpline', phone: null, how: 'Find a free, confidential helpline in your country.', url: 'https://findahelpline.com' }],
};

const regions: Record<string, CrisisRegion> = { US: 'us', CA: 'ca', GB: 'gb', UK: 'gb', IE: 'ie', AU: 'au' };

/**
 * Picks the crisis region from a BCP 47 locale such as the browser's `navigator.language`. The
 * person can change it, so an unknown or missing region falls back to the directory.
 * @example crisisRegionFor('en-GB') // 'gb'
 */
export function crisisRegionFor(locale: string): CrisisRegion {
  const region = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(locale)?.[1]?.toUpperCase();
  return (region && regions[region]) || 'other';
}
