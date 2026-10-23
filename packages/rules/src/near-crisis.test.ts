import { describe, expect, it } from 'vitest';
import { crisisCheck } from './near-crisis';

describe('crisisCheck', () => {
  it('keeps an exact phrase as a match', () => {
    expect(crisisCheck('Some days I want to die', 'en')).toBe('match');
    expect(crisisCheck('quiero morir', 'es')).toBe('match');
  });

  it('flags looser signs without calling them a match', () => {
    for (const text of [
      'I wish I could just disappear',
      'what is the point of any of this',
      'I feel like a burden to everyone',
      'I feel hopeless about my hair',
      'I could die of embarrassment at work',
    ]) {
      expect(crisisCheck(text, 'en'), text).toBe('near');
    }
  });

  it('flags a likely misspelling of a crisis word', () => {
    expect(crisisCheck('I keep thinking about sucide', 'en')).toBe('near');
    expect(crisisCheck('thinking of suicdie', 'en')).toBe('near');
  });

  it('flags signs in other languages and in a mix of them', () => {
    expect(crisisCheck('No tengo esperanza, sin esperanza', 'es')).toBe('near');
    expect(crisisCheck('Nimechoka kuishi, kifo kinakuja', 'sw')).toBe('near');
    expect(crisisCheck('Je me sens comme un fardeau', 'fr')).toBe('near');
    expect(crisisCheck('I dey feel say I go die', 'pcm')).toBe('near');
    expect(crisisCheck('Je suis fatiguée, I feel hopeless', 'fr')).toBe('near');
  });

  it('leaves ordinary words alone', () => {
    for (const text of [
      'I started a new diet and my hair is thinner',
      'My hair looks different today and I am okay with it',
      'The mate and the matematicas book',
      'I took a harmless photo',
    ]) {
      expect(crisisCheck(text, 'en'), text).toBe('none');
    }
    expect(crisisCheck('Hoy me siento mejor con mi pelo', 'es')).toBe('none');
  });
});
