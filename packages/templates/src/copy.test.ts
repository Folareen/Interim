import { crisisContacts, findBannedWord, findCompanionPhrase } from '@interim/rules';
import { liveLocales, templateKeys, wordsSetSchema } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { copy, fillCopy, localeNames, templates, wordsForDay, wordsLibrary } from './index';

const leaves = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return [];
};

// Spec section 16, tests 5, 10 and 10a: every fixed user facing string passes both scans in its
// own language.
const userFacing = liveLocales.flatMap((locale) => {
  const c = copy[locale];
  const texts = [
    ...leaves(c.ui),
    ...Object.values(c.templateLabels),
    ...Object.values(c.companionFallback),
    ...Object.values(c.whatToSay).flat(),
    ...Object.values(wordsLibrary[locale]).flatMap((set) => [
      set.label,
      ...(set.translation ? [set.translation] : []),
      ...set.passages.flatMap((p) => [p.text, p.source]),
    ]),
    ...Object.values(crisisContacts).flatMap((contacts) => contacts.map((contact) => contact.how[locale])),
  ];
  return texts.map((text) => [locale, text] as const);
});

describe('fixed copy', () => {
  it.each(userFacing)('passes the language scans (%s): %s', (locale, text) => {
    expect(findBannedWord(text, locale)).toBeUndefined();
    expect(findCompanionPhrase(text, locale)).toBeUndefined();
  });
});

describe('templates', () => {
  it('has one template per key, under its own key', () => {
    expect(Object.keys(templates)).toEqual([...templateKeys]);
    for (const key of templateKeys) expect(templates[key].key).toBe(key);
  });

  it('starts body photos off only after surgery', () => {
    const off = Object.values(templates).filter((t) => !t.bodyPhotosByDefault).map((t) => t.key);
    expect(off).toEqual(['after_surgery']);
  });
});

describe('wordsForDay', () => {
  it('gives everyone the same passage on the same day, set and language', () => {
    expect(wordsForDay('christian', '2026-10-20', 'en')).toEqual(wordsForDay('christian', '2026-10-20', 'en'));
  });

  it('moves to a new passage each day and cycles through the whole set', () => {
    for (const set of wordsSetSchema.options) {
      const { passages } = wordsLibrary.en[set];
      const seen = new Set<string>();
      const start = Date.parse('2026-01-01T00:00:00Z');
      for (let i = 0; i < passages.length; i++) {
        const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
        seen.add(wordsForDay(set, date, 'en').text);
      }
      expect(seen.size).toBe(passages.length);
    }
  });

  it('says which language the passage is in', () => {
    expect(wordsForDay('muslim', '2026-10-20', 'en')).toMatchObject({ set: 'muslim', locale: 'en', label: 'Qur’an verses' });
  });

  it('works for dates before 1970', () => {
    expect(wordsForDay('gentle', '1969-12-31', 'en').text).toBeTruthy();
  });
});

describe('fillCopy', () => {
  it('puts values at their marks, wherever the language needs them', () => {
    expect(fillCopy('Step {current} of {total}', { current: 2, total: 5 })).toBe('Step 2 of 5');
    expect(fillCopy('{total} steps, now on {current}', { current: 2, total: 5 })).toBe('5 steps, now on 2');
  });

  it('fails loudly when a value is missing rather than printing a mark', () => {
    expect(() => fillCopy('Step {current} of {total}', { current: 2 })).toThrow(/total/);
  });

  it('is used by every English string with a mark, and only with marks it can fill', () => {
    const marked = leaves(copy.en.ui).filter((text) => text.includes('{'));
    expect(marked).toEqual(['Step {current} of {total}']);
  });
});

describe('language names', () => {
  it('has a name for every planned language, in that language', () => {
    expect(localeNames.en).toBe('English');
    expect(localeNames.yo).toBe('Yorùbá');
    expect(Object.keys(localeNames)).toHaveLength(10);
  });
});

