import { createHmac, randomBytes } from 'node:crypto';

/** A new unguessable token, for a cookie or an emailed link. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The keyed hash a database stores in place of a token, so a leaked row cannot be replayed. */
export function hashToken(secret: string, token: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
