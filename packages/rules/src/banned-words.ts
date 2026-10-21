import type { LiveLocale } from '@interim/types';
import { wholeWords } from './whole-words';

// Whole words only, so "health" is fine. Each language's list is native-reviewed before the language
// goes live. docs/product/overview.md owns the rules.

/** The banned words per language, as the planner prompt lists them. */
export const bannedWords: Record<LiveLocale, readonly string[]> = {
  en: ['patient', 'treatment', 'diagnosis', 'cure', 'heal', 'regrow'],
};

// The words above with their usual inflections.
const patterns: Record<LiveLocale, RegExp> = {
  en: wholeWords([
    'patients?',
    'treatments?',
    'diagnos(?:is|es|e|ed|ing)',
    'cures?',
    'cured',
    'curing',
    'heal(?:s|ed|ing|er|ers)?',
    'regrow(?:s|n|ing|th)?',
    'regrew',
  ]),
};

/** Finds the first banned word in user facing text in that language, or undefined when it is clean. */
export function findBannedWord(text: string, locale: LiveLocale): string | undefined {
  return patterns[locale].exec(text)?.[0];
}
