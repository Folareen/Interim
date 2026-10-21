import {
  type ConsentRequest,
  type CreateProfileInput,
  type Preferences,
  type Profile,
  preferencesSchema,
  profileSchema,
} from '@interim/types';

/** A failed call to the API. `status` is `'network'` when no response arrived at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Everything goes through `/api/*`, which the web server forwards to the API, so the owner cookie
// is set on this origin. Responses are parsed here, at the boundary.
async function send(path: string, method: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', 'Could not reach the API');
  }
  if (!response.ok) throw new ApiError(response.status, `The API answered ${response.status}`);
  return response;
}

/** Starts a profile. The API sets the owner cookie on the first one. */
export async function createProfile(input: CreateProfileInput): Promise<Profile> {
  return profileSchema.parse(await (await send('/profiles', 'POST', input)).json());
}

/** The profile's companion settings. */
export async function getPreferences(id: string): Promise<Preferences> {
  return preferencesSchema.parse(await (await send(`/profiles/${id}/preferences`, 'GET')).json());
}

/** Replaces the profile's companion settings. */
export async function savePreferences(id: string, preferences: Preferences): Promise<void> {
  await send(`/profiles/${id}/preferences`, 'PUT', preferences);
}

/** Records the person's consent. */
export async function grantConsent(id: string, consent: ConsentRequest): Promise<void> {
  await send(`/profiles/${id}/consent`, 'POST', consent);
}

/** Deletes the profile and everything under it. */
export async function deleteProfile(id: string): Promise<void> {
  await send(`/profiles/${id}`, 'DELETE');
}
