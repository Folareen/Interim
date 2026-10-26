import { randomBytes } from 'node:crypto';

// No 0, 1, 8 or 9, so a code read off paper cannot be mistaken between O and 0 or I and 1.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** One recovery code as stored and compared: 16 letters and digits, 80 bits. */
export function newRecoveryCode(): string {
  // 256 is a multiple of 32, so taking the low five bits of each byte is uniform.
  return Array.from(randomBytes(16), (byte) => ALPHABET[byte % 32]).join('');
}

/** The form shown to the person: `ABCD-EFGH-IJKL-MNOP`. */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{4}/g)?.join('-') ?? code;
}
