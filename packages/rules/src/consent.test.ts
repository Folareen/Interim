import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, hasCurrentConsent } from './consent';

describe('hasCurrentConsent', () => {
  it('is false until the person has consented', () => {
    expect(hasCurrentConsent({ consentedAt: null, consentVersion: CONSENT_VERSION })).toBe(false);
  });

  it('is true for the current version', () => {
    expect(hasCurrentConsent({ consentedAt: new Date(), consentVersion: CONSENT_VERSION })).toBe(true);
  });

  it('is false for consent given to an older text', () => {
    expect(hasCurrentConsent({ consentedAt: new Date(), consentVersion: '0' })).toBe(false);
  });
});
