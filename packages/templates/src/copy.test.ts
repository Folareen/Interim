import { crisisContacts, findBannedWord, findCompanionPhrase } from '@interim/rules';
import { liveLocales, templateKeys, wordsSetSchema } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { copy, templates, wordsForDay, wordsLibrary } from './index';

// Spec section 16, tests 5, 10 and 10a: every fixed user facing string passes both scans in its
// own language.
const userFacing = liveLocales.flatMap((locale) => {
  const c = copy[locale];
  const texts = [
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
