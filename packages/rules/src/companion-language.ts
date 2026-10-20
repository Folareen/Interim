import type { LiveLocale } from '@interim/types';
import { wholeWords } from './whole-words';

// docs/product/overview.md (Language and safety rules) owns these; spec section 13 describes the scan.
// Forced positivity, battle and journey framing, an earlier look as better, and a smaller or larger
// body as the goal. Runs beside findBannedWord on companion text, what to say lines and the words
// for today library. Each language's list is written and reviewed by a native speaker.
const apostrophe = "['’]?";
const patterns: Record<LiveLocale, RegExp> = {
  en: wholeWords([
    'stay positive',
    'think positive',
    'be strong',
    'stay strong',
    `you${apostrophe}ve got this`,
    'you got this',
    'everything happens for a reason',
    'bright side',
    'silver lining',
    'at least you',
    'fight(?:s|ing|er|ers)?',
    'fought',
    'battl(?:e|es|ed|ing)',
    'beat(?:s|ing|en)?',
    'warriors?',
    'survivors?',
    'conquer(?:s|ed|ing)?',
    'journeys?',
    'old self',
    'back to normal',
    'used to look',
    'slimming',
    'slimmer',
    'thinner',
    'hide (?:your|the)',
    'disguis(?:e|es|ed|ing)',
    'problem areas?',
  ]),
};

/** Finds the first companion phrase in user facing text in that language, or undefined when it is clean. */
export function findCompanionPhrase(text: string, locale: LiveLocale): string | undefined {
  return patterns[locale].exec(text)?.[0];
}
