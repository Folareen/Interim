import { liveLocales } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { type EmailKind, buildEmail, buildEmailChangedNotice } from './auth-mail';

const kinds: EmailKind[] = ['verify', 'magic', 'reset', 'exists', 'changeEmail', 'recover'];

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

  it.each(liveLocales)('builds the notice to the old address in %s with no link', (locale) => {
    const mail = buildEmailChangedNotice(locale, 'old@b.co');
    expect(mail.to).toBe('old@b.co');
    expect(mail.subject.trim()).not.toBe('');
    expect(mail.text).not.toContain('http');
    expect(mail.html).not.toContain('href');
  });

  it('escapes the link in the HTML body', () => {
    const mail = buildEmail('magic', 'en', 'a@b.co', 'https://web.test/x?a=1&b="2"');
    expect(mail.html).toContain('a=1&amp;b=&quot;2&quot;');
    expect(mail.html).not.toContain('b="2"');
  });
});
