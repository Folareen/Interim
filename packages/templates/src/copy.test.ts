import { findBannedWord, findCompanionPhrase } from '@interim/rules';
import { templateKeys, wordsSetSchema } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { companionFallback, templates, whatToSay, wordsForDay, wordsSets } from './index';

// Spec section 16, tests 5, 10 and 10a: every fixed user facing string passes both scans.
const userFacing = [
  ...Object.values(templates).map((t) => t.label),
  ...Object.values(companionFallback),
  ...Object.values(whatToSay).flat(),
  ...Object.values(wordsSets).flatMap((set) => [
    set.label,
    set.translation ?? '',
    ...set.passages.flatMap((p) => [p.text, p.source]),
  ]),
];

describe('fixed copy', () => {
  it.each(userFacing)('passes the language scans: %s', (text) => {
    expect(findBannedWord(text)).toBeUndefined();
    expect(findCompanionPhrase(text)).toBeUndefined();
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
  it('gives everyone the same passage on the same day and set', () => {
    expect(wordsForDay('christian', '2026-10-20')).toBe(wordsForDay('christian', '2026-10-20'));
  });

  it('moves to a new passage each day and cycles through the whole set', () => {
    for (const set of wordsSetSchema.options) {
      const { passages } = wordsSets[set];
      const seen = new Set<string>();
      const start = Date.parse('2026-01-01T00:00:00Z');
      for (let i = 0; i < passages.length; i++) {
        const date = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
        seen.add(wordsForDay(set, date).text);
      }
      expect(seen.size).toBe(passages.length);
    }
  });

  it('works for dates before 1970', () => {
    expect(wordsForDay('gentle', '1969-12-31').text).toBeTruthy();
  });
});
