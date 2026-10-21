import { describe, expect, it } from 'vitest';
import { modelTextProblem } from './model-text';

const known = new Set(['abc-1', 'abc-2']);
const check = (text: string, locale: 'en' | 'fr' | 'yo' = 'en', max = 3) => modelTextProblem(text, locale, known, max);

describe('modelTextProblem', () => {
  it('accepts plain text and known placeholders', () => {
    expect(check('Your hair looks {m:abc-1} today. That is common at this stage. Try a soft part.')).toBeUndefined();
  });

  it('rejects a digit, in any script (acceptance 14)', () => {
    expect(check('You are at 3 now.')).toBe('digit');
    expect(check('Il y a 2 options.', 'fr')).toBe('digit');
    expect(check('Ọdún ٣ ni.', 'yo')).toBe('digit');
  });

  it('does not count the digits inside a placeholder id', () => {
    expect(check('Here is {m:abc-1}.')).toBeUndefined();
  });

  it('rejects a number word, with or without accents', () => {
    expect(check('That is about three weeks.')).toBe('number_word');
    expect(check('Il y a quatre options.', 'fr')).toBe('number_word');
    expect(check('Voici trois options.', 'fr')).toBe('number_word');
  });

  it('allows words that only contain a number word', () => {
    expect(check('A tender, tenable look.')).toBeUndefined();
  });

  it('rejects an unknown placeholder or stray braces', () => {
    expect(check('Here is {m:nope}.')).toBe('unknown_placeholder');
    expect(check('Here is {name}.')).toBe('unknown_placeholder');
  });

  it('rejects a banned word and a companion phrase', () => {
    expect(check('This treatment helps.')).toBe('banned_word');
    expect(check('Stay positive today.')).toBe('companion_phrase');
  });

  it('allows health, which is not banned', () => {
    expect(check('Ask a professional about health questions.')).toBeUndefined();
  });

  it('rejects empty text and more sentences than allowed', () => {
    expect(check('   ')).toBe('empty');
    expect(check('A. B. C. D.')).toBe('too_long');
    expect(check('A. B. C.')).toBeUndefined();
  });
});
