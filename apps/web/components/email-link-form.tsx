'use client';

import { liveLocaleSchema } from '@interim/types';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Actions } from './actions';
import { Button } from './button';
import { CheckEmail } from './check-email';
import { Field } from './field';
import { Notice } from './notice';
import { requestMagicLink, requestPasswordReset } from '@/lib/api';
import { useAuthError } from '@/lib/use-auth-error';

/** Asks for an email address and sends either a sign-in link or a password reset link to it. */
export function EmailLinkForm({ kind }: { kind: 'magic' | 'reset' }) {
  const t = useTranslations('auth');
  const locale = liveLocaleSchema.parse(useLocale());
  const describe = useAuthError();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      await (kind === 'magic' ? requestMagicLink : requestPasswordReset)({ email, locale });
      setSentTo(email);
    } catch (cause) {
      setError(describe(cause));
    }
    setWorking(false);
  }

  if (sentTo) {
    const message = kind === 'magic' ? t('checkMagic', { email: sentTo }) : t('checkReset', { email: sentTo });
    return <CheckEmail title={t('checkTitle')} message={message} spam={t('checkSpam')} />;
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-6 pb-8">
        <Field label={t('emailLabel')} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        <p role="status" className="sr-only">
          {working ? t('magicWorking') : ''}
        </p>
        <Button type="submit" disabled={working}>
          {working ? t('magicWorking') : t(kind === 'magic' ? 'magicSubmit' : 'forgotSubmit')}
        </Button>
      </Actions>
    </form>
  );
}
