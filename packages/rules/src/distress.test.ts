import { describe, expect, it } from 'vitest';
import { findBannedWord } from './banned-words';
import { findCompanionPhrase } from './companion-language';
import { liveLocales } from '@interim/types';
import { crisisContacts, crisisRegionFor, crisisWording, soundsLikeCrisis } from './distress';

describe('soundsLikeCrisis', () => {
  it('matches crisis and self-harm language', () => {
    for (const text of [
      'Some days I want to die',
      "I don't want to be here anymore",
      'i dont want to wake up',
      'thinking about suicide',
      'I keep hurting myself',
      'I can’t go on like this',
      'everyone would be better off without me',
    ]) {
      expect(soundsLikeCrisis(text, 'en'), text).toBe(true);
    }
  });

  it('leaves ordinary hard feelings alone', () => {
    for (const text of [
      'I hate how my hair looks today',
      'I cried in the mirror this morning',
      'I want to go out but I am scared people will stare',
      'I could die of embarrassment at work',
    ]) {
      expect(soundsLikeCrisis(text, 'en'), text).toBe(false);
    }
  });
});

describe('crisis contacts', () => {
  it('picks the region from the locale', () => {
    expect(crisisRegionFor('en-US')).toBe('us');
    expect(crisisRegionFor('fr-CA')).toBe('ca');
    expect(crisisRegionFor('en_GB')).toBe('gb');
    expect(crisisRegionFor('en-Latn-AU')).toBe('au');
    expect(crisisRegionFor('en-NG')).toBe('other');
    expect(crisisRegionFor('en')).toBe('other');
  });

  it('has wording in every language for every way of reaching a service, and it passes the scans', () => {
    for (const locale of liveLocales) {
      for (const [how, text] of Object.entries(crisisWording[locale])) {
        expect(text, `${locale} ${how}`).not.toBe('');
        expect(findBannedWord(text, locale), `${locale} ${how}`).toBeUndefined();
        expect(findCompanionPhrase(text, locale), `${locale} ${how}`).toBeUndefined();
      }
    }
    for (const contacts of Object.values(crisisContacts)) {
      expect(contacts.length).toBeGreaterThan(0);
      for (const c of contacts) {
        for (const locale of liveLocales) {
          const text = crisisWording[locale][c.how];
          expect(text.includes('{number}')).toBe(c.phone !== null);
        }
      }
    }
  });
});

describe('crisis phrases in other languages', () => {
  it.each([
    ['fr', 'Je veux mourir'],
    ['fr', 'je n’en peux plus, je voudrais mourir'],
    ['es', 'Quiero morir'],
    ['it', 'Voglio morire'],
    ['pt', 'Eu quero morrer'],
    ['sw', 'Nataka kufa'],
    ['ha', 'Ina son mutuwa'],
    ['yo', 'Mo fẹ́ kú'],
    ['ig', 'Ana m achọ ime ka m nwụọ'],
    ['pcm', 'I wan die'],
  ] as const)('%s: %s', (locale, text) => {
    expect(soundsLikeCrisis(text, locale)).toBe(true);
  });

  it('matches whether or not accents and tone marks were typed', () => {
    expect(soundsLikeCrisis('Mo fe ku', 'yo')).toBe(true);
    expect(soundsLikeCrisis('Mo fẹ́ kú', 'yo')).toBe(true);
    expect(soundsLikeCrisis('Je veux mourir', 'fr')).toBe(true);
    expect(soundsLikeCrisis('Quiero morir', 'es')).toBe(true);
  });

  it('does not flag ordinary hard feelings in another language', () => {
    expect(soundsLikeCrisis('Je suis fatiguée de mes cheveux', 'fr')).toBe(false);
    expect(soundsLikeCrisis('Estoy cansada de cómo me veo hoy', 'es')).toBe(false);
  });
});
