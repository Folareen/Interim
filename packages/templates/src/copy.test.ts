import { crisisWording, findBannedWord, findCompanionPhrase } from '@interim/rules';
import { liveLocales, templateKeys, wordsSetSchema } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { localeNames, messages, templates, wordsForDay, wordsLibrary } from './index';

const leaves = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return [];
};

/** Every string with the path to it, so a missing or extra key shows where. */
const entries = (value: unknown, path = ''): [string, string][] => {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => entries(item, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => entries(item, path ? `${path}.${key}` : key));
  }
  return [];
};

const marks = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

// Spec section 16, tests 5, 10 and 10a: every fixed user facing string passes both scans in its
// own language.
const userFacing = liveLocales.flatMap((locale) => {
  const texts = [
    ...leaves(messages[locale]),
    ...Object.values(wordsLibrary[locale]).flatMap((set) => [
      set.label,
      ...(set.translation ? [set.translation] : []),
      ...set.passages.flatMap((p) => [p.text, p.source]),
    ]),
    ...Object.values(crisisWording[locale]),
  ];
  return texts.map((text) => [locale, text] as const);
});

describe('fixed copy', () => {
  it.each(userFacing)('passes the language scans (%s): %s', (locale, text) => {
    expect(findBannedWord(text, locale)).toBeUndefined();
    expect(findCompanionPhrase(text, locale)).toBeUndefined();
  });
});

describe('translations', () => {
  const reference = new Map(entries(messages.en));

  it.each(liveLocales)('%s has exactly the keys English has, each with text', (locale) => {
    const own = entries(messages[locale]);
    expect(own.map(([path]) => path)).toEqual([...reference.keys()]);
    for (const [path, text] of own) expect(text.trim(), `${locale} ${path}`).not.toBe('');
  });

  it.each(liveLocales)('%s keeps the same {marks} as English in every string', (locale) => {
    for (const [path, text] of entries(messages[locale])) {
      expect(marks(text), `${locale} ${path}`).toEqual(marks(reference.get(path) ?? ''));
    }
  });

  it('leaves no translation identical to English except names and shared words', () => {
    // `demo.checkInLine` is two marks and a comma, so it reads the same in every language.
    const allowed = new Set(['common.appName', 'ready.situationLabel', 'notifications.title', 'demo.checkInLine']);
    for (const locale of liveLocales.filter((l) => l !== 'en' && l !== 'pcm')) {
      for (const [path, text] of entries(messages[locale])) {
        if (allowed.has(path) || path.startsWith('common.appName')) continue;
        if (text === reference.get(path) && text.length > 12) throw new Error(`${locale} ${path} is still English`);
      }
    }
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

describe('language names', () => {
  it('has a name for every planned language, in that language', () => {
    expect(localeNames.en).toBe('English');
    expect(localeNames.yo).toBe('Yorùbá');
    expect(Object.keys(localeNames)).toEqual([...liveLocales]);
  });
});

