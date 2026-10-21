import { messages } from '@interim/templates';
import type { LiveLocale } from '@interim/types';
import type { MailMessage } from '../mail/mail.service';

/** The emails Interim sends. */
export type EmailKind = 'verify' | 'magic' | 'reset' | 'exists';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Builds an email in the person's language from the fixed copy. The link is the only dynamic part. */
export function buildEmail(kind: EmailKind, locale: LiveLocale, to: string, link: string): MailMessage {
  const copy = messages[locale].email;
  const { subject, intro, action } = copy[kind];
  return {
    to,
    subject,
    text: `${intro}\n\n${action}: ${link}\n\n${copy.ignore}`,
    html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p><p>${escapeHtml(copy.ignore)}</p>`,
  };
}
