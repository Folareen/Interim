import { ApiError } from './api';

/** The key in the `auth` messages for what went wrong, so every form answers the same way. */
export function authErrorKey(cause: unknown): 'invalid' | 'unverified' | 'tooMany' | 'leaked' | 'linkInvalid' | 'network' | 'generic' {
  if (!(cause instanceof ApiError)) return 'generic';
  if (cause.status === 'network') return 'network';
  if (cause.status === 401) return 'invalid';
  if (cause.status === 403) return 'unverified';
  if (cause.status === 429) return 'tooMany';
  if (cause.status === 422) return 'leaked';
  if (cause.status === 400) return 'linkInvalid';
  return 'generic';
}
