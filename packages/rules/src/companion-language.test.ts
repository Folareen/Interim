import { describe, expect, it } from 'vitest';
import { findCompanionPhrase } from './companion-language';

describe('findCompanionPhrase', () => {
  it('flags forced positivity', () => {
    expect(findCompanionPhrase('Stay positive, it will pass')).toBe('Stay positive');
    expect(findCompanionPhrase('You’ve got this!')).toBe('You’ve got this');
    expect(findCompanionPhrase('Look on the bright side')).toBe('bright side');
    expect(findCompanionPhrase('Everything happens for a reason.')).toBe('Everything happens for a reason');
  });

  it('flags battle and journey framing and loss comparisons', () => {
    expect(findCompanionPhrase('Keep fighting')).toBe('fighting');
    expect(findCompanionPhrase('a true warrior')).toBe('warrior');
    expect(findCompanionPhrase('You will beat it')).toBe('beat');
    expect(findCompanionPhrase('on this journey')).toBe('journey');
    expect(findCompanionPhrase('Back to your old self soon')).toBe('old self');
  });

  it('passes gentle, practical copy', () => {
    expect(findCompanionPhrase('Shorter than last month, and that is a normal part of this stage.')).toBeUndefined();
    expect(findCompanionPhrase('The soft collar you saved frames your face well.')).toBeUndefined();
    expect(findCompanionPhrase('An upbeat colour for the heartbeat of the party')).toBeUndefined();
  });
});
