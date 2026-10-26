'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button, secondaryClass } from '@/components/button';
import { CheckEmail } from '@/components/check-email';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { liveLocaleSchema } from '@interim/types';
import { register } from '@/lib/api';
import { useAuthError } from '@/lib/use-auth-error';

/** Creates an account with email and password, then says to look for the confirmation email. */
export function SignUpForm({ google }: { google: boolean }) {
  const t = useTranslations('auth');
  const locale = liveLocaleSchema.parse(useLocale());
  const describe = useAuthError();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      await register({ email, password, locale });
      setSentTo(email);
    } catch (cause) {
      setError(describe(cause));
    }
    setWorking(false);
  }

  if (sentTo) return <CheckEmail title={t('checkTitle')} message={t('checkVerify', { email: sentTo })} spam={t('checkSpam')} />;

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-6 pb-8">
        <Field label={t('emailLabel')} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label={t('passwordLabel')}
          help={t('passwordHelp')}
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Notice>{error}</Notice>}
        <p className="text-[0.9rem] text-muted">{t('privacy')}</p>
        <p className="text-[0.9rem] text-muted">{t('signUpRecoveryNote')}</p>

        <div className="space-y-3 border-t border-border pt-6">
          <p className="text-center text-muted">{t('or')}</p>
          <Link href="/magic" className={secondaryClass}>
            {t('emailMeLink')}
          </Link>
          {google && (
            <a href="/api/auth/google/start" className={secondaryClass}>
              {t('google')}
            </a>
          )}
        </div>

        <p className="text-center text-muted">
          {t('haveAccount')}{' '}
          <Link href="/signin" className="font-semibold text-accent underline underline-offset-4">
            {t('signInInstead')}
          </Link>
        </p>
      </div>
      <Actions>
        <p role="status" className="sr-only">
          {working ? t('signUpWorking') : ''}
        </p>
        <Button type="submit" disabled={working}>
          {working ? t('signUpWorking') : t('signUpSubmit')}
        </Button>
      </Actions>
    </form>
  );
}
