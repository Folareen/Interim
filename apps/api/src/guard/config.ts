/** Secrets and cookie settings for owner and session cookies. */
export interface OwnerConfig {
  /** Keys the token hashes. */
  secret: string;
  secureCookie: boolean;
}
export const OWNER_CONFIG = Symbol('OWNER_CONFIG');
