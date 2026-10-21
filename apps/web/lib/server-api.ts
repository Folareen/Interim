import { type Profile, profileSchema } from '@interim/types';
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
