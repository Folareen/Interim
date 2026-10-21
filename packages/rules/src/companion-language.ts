import type { LiveLocale } from '@interim/types';
import { wholeWords } from './whole-words';

// Forced positivity, battle and journey framing, an earlier look as better, and a body size as the
// goal (docs/product/overview.md, Language and safety rules). Each language's list is native-reviewed.
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
