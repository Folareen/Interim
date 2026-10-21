import {
  type ConsentRequest,
  type CreateProfileInput,
  type LinkToken,
  type LoginInput,
  type Me,
  type Preferences,
  type Profile,
  type RegisterInput,
  type ResetPasswordInput,
  type EmailLinkRequest,
  meSchema,
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

/** Creates an account and emails a link to confirm it. The answer is the same for an address that already has one. */
export async function register(input: RegisterInput): Promise<void> {
  await send('/auth/register', 'POST', input);
}

/** Signs in with email and password. */
export async function login(input: LoginInput): Promise<Me> {
  return meSchema.parse(await (await send('/auth/login', 'POST', input)).json());
}

/** Emails a sign-in link. The answer is the same whether or not the address has an account. */
export async function requestMagicLink(input: EmailLinkRequest): Promise<void> {
  await send('/auth/magic', 'POST', input);
}

/** Signs in with the token from an emailed link. */
export async function signInWithLink(input: LinkToken): Promise<Me> {
  return meSchema.parse(await (await send('/auth/magic/use', 'POST', input)).json());
}

/** Confirms an email address with the token from the link sent at sign up, and signs in. */
export async function confirmEmail(input: LinkToken): Promise<Me> {
  return meSchema.parse(await (await send('/auth/verify-email', 'POST', input)).json());
}

/** Emails a password reset link. The answer is the same whether or not the address has an account. */
export async function requestPasswordReset(input: EmailLinkRequest): Promise<void> {
  await send('/auth/password/forgot', 'POST', input);
}

/** Sets a new password from an emailed link, and signs in. */
export async function resetPassword(input: ResetPasswordInput): Promise<Me> {
  return meSchema.parse(await (await send('/auth/password/reset', 'POST', input)).json());
}

/** Signs this browser out. */
export async function logout(): Promise<void> {
  await send('/auth/logout', 'POST');
}

/** Moves the profiles made on this device into the signed in account. */
export async function claimProfiles(): Promise<void> {
  await send('/auth/claim', 'POST');
}

/** Deletes the account and everything in it. The password is needed when the account has one. */
export async function deleteAccount(password?: string): Promise<void> {
  await send('/auth/account', 'DELETE', { password });
}
