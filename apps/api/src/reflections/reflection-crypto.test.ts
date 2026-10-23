import { describe, expect, it } from 'vitest';
import { decryptText, encryptText } from './reflection-crypto';

const key = 'a'.repeat(64);

describe('reflection encryption', () => {
  it('round trips text in any script and never stores it readable', () => {
    for (const text of ['I felt calmer today', 'Mo ti ní ìrètí lónìí 🌿', '日本語']) {
      const stored = encryptText(text, key);
      expect(stored).not.toContain(text);
      expect(decryptText(stored, key)).toBe(text);
    }
  });

  it('uses a fresh nonce each time', () => {
    expect(encryptText('same', key)).not.toBe(encryptText('same', key));
  });

  it('refuses a wrong key or changed text', () => {
    const stored = encryptText('private', key);
    expect(() => decryptText(stored, 'b'.repeat(64))).toThrow();
    const [v, iv, tag, body] = stored.split('.');
    expect(() => decryptText([v, iv, tag, `${body}A`].join('.'), key)).toThrow();
    expect(() => decryptText('nonsense', key)).toThrow('Unreadable reflection');
  });
});
