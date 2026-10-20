import { describe, expect, it } from 'vitest';
import { findBannedWord } from './banned-words';

describe('findBannedWord', () => {
  it('flags banned words', () => {
    expect(findBannedWord('A new treatment plan', 'en')).toBe('treatment');
    expect(findBannedWord('Helps hair regrow', 'en')).toBe('regrow');
    expect(findBannedWord('Hair is regrowing', 'en')).toBe('regrowing');
    expect(findBannedWord('It will Heal', 'en')).toBe('Heal');
  });

  it('passes clean copy', () => {
    expect(findBannedWord('Your stage card is ready', 'en')).toBeUndefined();
    expect(findBannedWord('Ask a professional about health questions', 'en')).toBeUndefined();
    expect(findBannedWord('Keep your account secure', 'en')).toBeUndefined();
    expect(findBannedWord('stage: growing_in', 'en')).toBeUndefined();
  });
});
