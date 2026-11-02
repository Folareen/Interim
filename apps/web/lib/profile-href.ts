import type { Profile } from '@interim/types';

/** Where a profile opens: its consent step until the current text is accepted, then its own home. */
export function profileHref(profile: Pick<Profile, 'id' | 'kind' | 'consentCurrent'>): string {
  if (!profile.consentCurrent) return `/consent/${profile.id}`;
  return profile.kind === 'style' ? `/style/${profile.id}` : `/ready/${profile.id}`;
}
