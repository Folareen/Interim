import { describe, expect, it } from 'vitest';
import { findBannedWord } from './banned-words';

describe('findBannedWord', () => {
  it('flags banned words', () => {
    expect(findBannedWord('A new treatment plan')).toBe('treatment');
    expect(findBannedWord('Helps hair regrow')).toBe('regrow');
    expect(findBannedWord('Hair is regrowing')).toBe('regrowing');
    expect(findBannedWord('It will Heal')).toBe('Heal');
  });

  it('passes clean copy', () => {
    expect(findBannedWord('Your stage card is ready')).toBeUndefined();
    expect(findBannedWord('Ask a professional about health questions')).toBeUndefined();
    expect(findBannedWord('Keep your account secure')).toBeUndefined();
    expect(findBannedWord('stage: growing_in')).toBeUndefined();
  });
});
