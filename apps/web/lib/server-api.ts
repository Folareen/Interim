import {
  type AuthConfig,
  type Me,
  type Preferences,
  type Profile,
  authConfigSchema,
  meSchema,
  preferencesSchema,
  profileListSchema,
  profileSchema,
} from '@interim/types';
import { cookies } from 'next/headers';

// Server side reads go straight to the API and pass the person's cookie along, because the
// `/api` forwarding only exists for the browser.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

/** The person's profile, or undefined when it does not exist or is not theirs. */
export async function getProfile(id: string): Promise<Profile | undefined> {
  const cookie = (await cookies()).toString();
  const response = await fetch(`${apiOrigin}/profiles/${encodeURIComponent(id)}`, {
    headers: { cookie },
    cache: 'no-store',
  });
  if (response.status === 404 || response.status === 400 || response.status === 401) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return profileSchema.parse(await response.json());
}

/** Name of the session cookie the API sets. Its presence only says it is worth asking who the person is. */
const SESSION_COOKIE = 'interim_session';

/** The signed in account, or undefined when signed out. Skips the call when there is no session cookie. */
export async function getMe(): Promise<Me | undefined> {
  const jar = await cookies();
  if (!jar.has(SESSION_COOKIE)) return undefined;
  const response = await fetch(`${apiOrigin}/auth/me`, { headers: { cookie: jar.toString() }, cache: 'no-store' });
  if (response.status === 401) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return meSchema.parse(await response.json());
}

/** The profiles of the signed in account. */
export async function getProfiles(): Promise<Profile[]> {
  const response = await fetch(`${apiOrigin}/profiles`, { headers: { cookie: (await cookies()).toString() }, cache: 'no-store' });
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return profileListSchema.parse(await response.json());
}

/** Which sign-in methods this deployment offers. */
export async function getAuthConfig(): Promise<AuthConfig> {
  const response = await fetch(`${apiOrigin}/auth/config`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return authConfigSchema.parse(await response.json());
}

/** The profile's companion settings, or undefined when the profile is not the person's. */
export async function getPreferences(id: string): Promise<Preferences | undefined> {
  const response = await fetch(`${apiOrigin}/profiles/${encodeURIComponent(id)}/preferences`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if (response.status === 404 || response.status === 400 || response.status === 401) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return preferencesSchema.parse(await response.json());
}
