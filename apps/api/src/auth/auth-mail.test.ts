import { liveLocales } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { type EmailKind, buildEmail } from './auth-mail';

const kinds: EmailKind[] = ['verify', 'magic', 'reset', 'exists'];

describe('buildEmail', () => {
  it.each(liveLocales)('builds every email in %s with the link in both bodies', (locale) => {
    for (const kind of kinds) {
      const mail = buildEmail(kind, locale, 'a@b.co', 'https://web.test/x?token=abc');
      expect(mail.to).toBe('a@b.co');
      expect(mail.subject.trim()).not.toBe('');
      expect(mail.text).toContain('https://web.test/x?token=abc');
      expect(mail.html).toContain('href="https://web.test/x?token=abc"');
    }
  });

  it('escapes the link in the HTML body', () => {
    const mail = buildEmail('magic', 'en', 'a@b.co', 'https://web.test/x?a=1&b="2"');
    expect(mail.html).toContain('a=1&amp;b=&quot;2&quot;');
    expect(mail.html).not.toContain('b="2"');
  });
});
