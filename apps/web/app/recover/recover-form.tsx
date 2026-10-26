'use client';

import { liveLocaleSchema } from '@interim/types';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { CheckEmail } from '@/components/check-email';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { recoverAccount } from '@/lib/api';
import { useAuthError } from '@/lib/use-auth-error';

/** Takes the old email, a recovery code and a new email, then says to look in the new inbox. */
export function RecoverForm() {
  const t = useTranslations('auth');
  const locale = liveLocaleSchema.parse(useLocale());
  const describe = useAuthError();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [sentTo, setSentTo] = useState<string>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      await recoverAccount({ email, code, newEmail, locale });
      setSentTo(newEmail);
    } catch (cause) {
      setError(describe(cause));
    }
    setWorking(false);
  }

  if (sentTo) return <CheckEmail title={t('checkTitle')} message={t('checkRecover', { email: sentTo })} spam={t('checkSpam')} />;

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-6 pb-8">
        <Field label={t('recoverEmailLabel')} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label={t('recoverCodeLabel')}
          help={t('recoverCodeHelp')}
          type="text"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Field
          label={t('recoverNewEmailLabel')}
          type="email"
          name="newEmail"
          autoComplete="off"
          required
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        <p role="status" className="sr-only">
          {working ? t('recoverWorking') : ''}
        </p>
        <Button type="submit" disabled={working}>
          {working ? t('recoverWorking') : t('recoverSubmit')}
        </Button>
      </Actions>
    </form>
  );
}
