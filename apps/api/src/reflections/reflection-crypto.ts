import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/** Encrypts text with AES-256-GCM. The result carries its own nonce and tag, so it is one string to store. */
export function encryptText(plain: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/**
 * Reverses `encryptText`.
 * @throws Error when the key is wrong or the stored text was changed.
 */
export function decryptText(stored: string, keyHex: string): string {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Unreadable reflection');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}
