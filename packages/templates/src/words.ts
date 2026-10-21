import type { LiveLocale, WordsSet } from '@interim/types';
import { en } from './words/en';

/** One passage and where it comes from. */
export interface Passage {
  text: string;
  source: string;
}

/** A words for today set as the app lists it. */
export interface WordsSetConfig {
  label: string;
  /** Shown once under the set, so each passage's source can stay short. */
  translation: string | null;
  passages: readonly Passage[];
}

/**
 * Words for today by language. English has every set; another language lists only the sets it has
 * a checked public domain translation for, and the rest are shown in English.
 */
export const wordsLibrary: { en: Record<WordsSet, WordsSetConfig> } & Record<LiveLocale, Partial<Record<WordsSet, WordsSetConfig>>> = {
  en,
  fr: {},
  es: {},
  it: {},
  pt: {},
  sw: {},
  ha: {},
  yo: {},
  ig: {},
  pcm: {},
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A day's passage with its set's details and the language it is actually in. */
export interface DailyWords extends Passage {
  set: WordsSet;
  label: string;
  translation: string | null;
  /** Differs from the asked language when that language has no translation of the set yet. */
  locale: LiveLocale;
}

/**
 * The passage for one day. Everyone on the same set, language and date gets the same one, so
 * nothing about the person shapes the choice.
 * @param date The person's local date as YYYY-MM-DD.
 */
export function wordsForDay(set: WordsSet, date: string, locale: LiveLocale): DailyWords {
  const inLocale = wordsLibrary[locale][set];
  const used = inLocale ? locale : 'en';
  const { label, translation, passages } = inLocale ?? wordsLibrary.en[set];
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
  const passage = passages[((day % passages.length) + passages.length) % passages.length];
  if (!passage) throw new Error(`No passage for ${set} on ${date}`);
  return { ...passage, set, label, translation, locale: used };
}
