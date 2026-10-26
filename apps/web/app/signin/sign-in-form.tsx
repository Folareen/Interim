'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button, secondaryClass } from '@/components/button';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { login } from '@/lib/api';
import { useAuthError } from '@/lib/use-auth-error';

/** Email and password, with the other ways in underneath. */
export function SignInForm({ google, next, googleFailed }: { google: boolean; next: string; googleFailed: boolean }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const describe = useAuthError();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      await login({ email, password });
      router.push(next);
      router.refresh();
    } catch (cause) {
      setError(describe(cause));
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-6 pb-8">
        {googleFailed && <Notice>{t('googleFailed')}</Notice>}
        <Field label={t('emailLabel')} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label={t('passwordLabel')}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Notice>{error}</Notice>}
        <p>
          <Link href="/forgot" className="font-semibold text-accent underline underline-offset-4">
            {t('forgot')}
          </Link>
        </p>
        <p>
          <Link href="/recover" className="font-semibold text-accent underline underline-offset-4">
            {t('lostInbox')}
          </Link>
        </p>

        <div className="space-y-3 border-t border-border pt-6">
          <p className="text-center text-muted">{t('or')}</p>
          <Link href="/magic" className={secondaryClass}>
            {t('emailMeLink')}
          </Link>
          {google && (
            // A full page visit: the browser leaves for Google and comes back to the API's callback.
            <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className={secondaryClass}>
              {t('google')}
            </a>
          )}
        </div>

        <p className="text-center text-muted">
          {t('noAccount')}{' '}
          <Link href="/signup" className="font-semibold text-accent underline underline-offset-4">
            {t('createAccount')}
          </Link>
        </p>
      </div>
      <Actions>
        <p role="status" className="sr-only">
          {working ? t('signInWorking') : ''}
        </p>
        <Button type="submit" disabled={working}>
          {working ? t('signInWorking') : t('signInSubmit')}
        </Button>
      </Actions>
    </form>
  );
}
