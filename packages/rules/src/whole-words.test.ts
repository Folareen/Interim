import { describe, expect, it } from 'vitest';
import { wholeWords } from './whole-words';

describe('wholeWords', () => {
  it('matches whole words in any case', () => {
    expect(wholeWords(['heal']).exec('It will HEAL')?.[0]).toBe('HEAL');
    expect(wholeWords(['heal']).test('health')).toBe(false);
  });

  it('treats letters with tone marks and dots as part of the word', () => {
    // \b would wrongly match "ba" inside "bàbá" because à is not an ASCII letter.
    expect(wholeWords(['ba']).test('bàbá')).toBe(false);
    expect(wholeWords(['ọmọ']).test('Ọmọ mi')).toBe(true);
    expect(wholeWords(['ọmọ']).test('ọmọge')).toBe(false);
  });
});
