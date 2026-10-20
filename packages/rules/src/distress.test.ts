import { describe, expect, it } from 'vitest';
import { findBannedWord } from './banned-words';
import { findCompanionPhrase } from './companion-language';
import { crisisContacts, crisisRegionFor, soundsLikeCrisis } from './distress';

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

  it('has contacts for every region in clean copy', () => {
    for (const contacts of Object.values(crisisContacts)) {
      expect(contacts.length).toBeGreaterThan(0);
      for (const c of contacts) {
        expect(findBannedWord(`${c.name} ${c.how.en}`, 'en')).toBeUndefined();
        expect(findCompanionPhrase(`${c.name} ${c.how.en}`, 'en')).toBeUndefined();
      }
    }
  });
});
