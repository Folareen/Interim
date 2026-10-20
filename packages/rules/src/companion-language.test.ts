import { describe, expect, it } from 'vitest';
import { findCompanionPhrase } from './companion-language';

describe('findCompanionPhrase', () => {
  it('flags forced positivity', () => {
    expect(findCompanionPhrase('Stay positive, it will pass', 'en')).toBe('Stay positive');
    expect(findCompanionPhrase('You’ve got this!', 'en')).toBe('You’ve got this');
    expect(findCompanionPhrase('Look on the bright side', 'en')).toBe('bright side');
    expect(findCompanionPhrase('Everything happens for a reason.', 'en')).toBe('Everything happens for a reason');
  });

  it('flags battle and journey framing and loss comparisons', () => {
    expect(findCompanionPhrase('Keep fighting', 'en')).toBe('fighting');
    expect(findCompanionPhrase('a true warrior', 'en')).toBe('warrior');
    expect(findCompanionPhrase('You will beat it', 'en')).toBe('beat');
    expect(findCompanionPhrase('on this journey', 'en')).toBe('journey');
    expect(findCompanionPhrase('Back to your old self soon', 'en')).toBe('old self');
  });

  it('flags a smaller or larger body as the goal', () => {
    expect(findCompanionPhrase('A slimming cut for the party', 'en')).toBe('slimming');
    expect(findCompanionPhrase('Dark colours hide your middle', 'en')).toBe('hide your');
    expect(findCompanionPhrase('Skip the problem areas', 'en')).toBe('problem areas');
  });

  it('passes gentle, practical copy', () => {
    expect(findCompanionPhrase('Shorter than last month, and that is a normal part of this stage.', 'en')).toBeUndefined();
    expect(findCompanionPhrase('The soft collar you saved frames your face well.', 'en')).toBeUndefined();
    expect(findCompanionPhrase('An upbeat colour for the heartbeat of the party', 'en')).toBeUndefined();
  });
});
