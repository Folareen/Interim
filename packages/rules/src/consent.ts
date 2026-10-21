/** Version of the consent text on screen. Bump it when the wording or processors change. */
export const CONSENT_VERSION = '3';

/**
 * Whether a profile may be used. Consent given for an older text does not count, so a
 * bumped CONSENT_VERSION asks everyone again.
 */
export function hasCurrentConsent(profile: {
  consentedAt: Date | null;
  consentVersion: string;
}): boolean {
  return profile.consentedAt !== null && profile.consentVersion === CONSENT_VERSION;
}
