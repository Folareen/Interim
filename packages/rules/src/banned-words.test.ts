import { describe, expect, it } from 'vitest';
import { findBannedWord } from './banned-words';

describe('findBannedWord', () => {
  it('flags banned words', () => {
    expect(findBannedWord('A new treatment plan')).toBe('treatment');
    expect(findBannedWord('Helps hair regrow')).toBe('regrow');
  });

  it('passes clean copy', () => {
    expect(findBannedWord('Your stage card is ready')).toBeUndefined();
  });
});
