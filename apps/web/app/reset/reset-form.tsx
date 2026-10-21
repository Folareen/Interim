'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { resetPassword } from '@/lib/api';
import { authErrorKey } from '@/lib/auth-error';
import { useAuthError } from '@/lib/use-auth-error';

/** Chooses a new password with the token from the emailed link. */
export function ResetForm({ token }: { token: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const describe = useAuthError();
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      await resetPassword({ token, password });
      router.push('/');
      router.refresh();
    } catch (cause) {
      setExpired(authErrorKey(cause) === 'linkInvalid');
      setError(describe(cause));
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-6 pb-8">
        <Field
          label={t('newPasswordLabel')}
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
        {expired && (
          <p>
            <Link href="/forgot" className="font-semibold text-accent underline underline-offset-4">
              {t('askNewLink')}
            </Link>
          </p>
        )}
      </div>
      <Actions>
        <p role="status" className="sr-only">
          {working ? t('resetWorking') : ''}
        </p>
        <Button type="submit" disabled={working}>
          {working ? t('resetWorking') : t('resetSubmit')}
        </Button>
      </Actions>
    </form>
  );
}
