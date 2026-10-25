import {
  type AuthConfig,
  type CardSummary,
  type CardView,
  type GarmentItem,
  type Me,
  type Preferences,
  type Profile,
  type ReflectionsView,
  type RunView,
  type ShareList,
  type SharedCard,
  authConfigSchema,
  cardSummaryListSchema,
  cardViewSchema,
  garmentListSchema,
  meSchema,
  preferencesSchema,
  profileListSchema,
  profileSchema,
  reflectionsViewSchema,
  runViewSchema,
  shareListSchema,
  sharedCardSchema,
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

/** A run, or undefined when it does not exist or is not the person's. */
export async function getRun(id: string): Promise<RunView | undefined> {
  const response = await fetch(`${apiOrigin}/runs/${encodeURIComponent(id)}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if (response.status === 404 || response.status === 400 || response.status === 401) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return runViewSchema.parse(await response.json());
}

/** A Stage Card with links to its images, or undefined when it is not the person's. */
export async function getCard(id: string): Promise<CardView | undefined> {
  const response = await fetch(`${apiOrigin}/cards/${encodeURIComponent(id)}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if (response.status === 404 || response.status === 400 || response.status === 401) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return cardViewSchema.parse(await response.json());
}

/** The profile's cards, newest first. */
export async function getCards(profileId: string): Promise<CardSummary[]> {
  const response = await fetch(`${apiOrigin}/profiles/${encodeURIComponent(profileId)}/cards`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return cardSummaryListSchema.parse(await response.json());
}

/** The profile's saved reflections and whether the contacts card is showing. Undefined when the profile is not theirs. */
export async function getReflections(profileId: string): Promise<ReflectionsView | undefined> {
  const response = await fetch(`${apiOrigin}/profiles/${encodeURIComponent(profileId)}/reflections`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if (response.status === 404 || response.status === 400 || response.status === 401 || response.status === 403) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return reflectionsViewSchema.parse(await response.json());
}

/** The sample catalog with the pieces the profile saved marked, or undefined when the profile is not the person's or does not use clothes. */
export async function getGarments(profileId: string): Promise<GarmentItem[] | undefined> {
  const response = await fetch(`${apiOrigin}/profiles/${encodeURIComponent(profileId)}/garments`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if ([400, 401, 403, 404, 409].includes(response.status)) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return garmentListSchema.parse(await response.json());
}

/** The links of a card that still work, or an empty list when the card is not the person's. */
export async function getShares(cardId: string): Promise<ShareList> {
  const response = await fetch(`${apiOrigin}/cards/${encodeURIComponent(cardId)}/shares`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if ([400, 401, 404].includes(response.status)) return [];
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return shareListSchema.parse(await response.json());
}

/** What a share link shows, or undefined when the link is unknown, expired or revoked. Sends no cookie: the link is the only credential. */
export async function getSharedCard(token: string): Promise<SharedCard | undefined> {
  const response = await fetch(`${apiOrigin}/shared/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (response.status === 404 || response.status === 400) return undefined;
  if (!response.ok) throw new Error(`The API answered ${response.status}`);
  return sharedCardSchema.parse(await response.json());
}
