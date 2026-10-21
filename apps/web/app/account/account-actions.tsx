'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { ApiError, claimProfiles, deleteAccount, logout } from '@/lib/api';

/** Brings the profiles made on this device into the account. */
export function ClaimProfiles() {
  const t = useTranslations('account');
  const common = useTranslations('common');
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function claim() {
    setWorking(true);
    setError(undefined);
    try {
      await claimProfiles();
      router.refresh();
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
      setWorking(false);
    }
  }

  return (
    <section className="mt-8 rounded-card border border-accent bg-tint p-4">
      <h2 className="text-[1.25rem]">{t('claimTitle')}</h2>
      <p className="mt-2">{t('claimBody')}</p>
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      <p role="status" className="sr-only">
        {working ? t('claiming') : ''}
      </p>
      <div className="mt-4">
        <Button onClick={claim} disabled={working}>
          {working ? t('claiming') : t('claimAction')}
        </Button>
      </div>
    </section>
  );
}

/** Signs this browser out. */
export function SignOut() {
  const t = useTranslations('account');
  const common = useTranslations('common');
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setWorking(true);
    setError(undefined);
    try {
      await logout();
      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Notice>{error}</Notice>}
      <p role="status" className="sr-only">
        {working ? t('signingOut') : ''}
      </p>
      <Button variant="secondary" onClick={signOut} disabled={working}>
        {working ? t('signingOut') : t('signOut')}
      </Button>
    </div>
  );
}

/** Deletes the account and everything in it after one more tap, asking for the password when there is one. */
export function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations('account');
  const common = useTranslations('common');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function remove(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      await deleteAccount(hasPassword ? password : undefined);
      router.push('/');
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) setError(t('deleteWrongPassword'));
      else setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
      setWorking(false);
    }
  }

  return (
    <section className="mt-auto border-t border-border pt-8 pb-10">
      <h2 className="text-[1.25rem]">{t('deleteTitle')}</h2>
      <p className="mt-2 text-[0.95rem] text-muted">{t('deleteBody')}</p>
      <p role="status" className="sr-only">
        {working ? t('deleting') : ''}
      </p>
      {confirming ? (
        <form onSubmit={remove} className="mt-5 space-y-4">
          {hasPassword && (
            <Field
              label={t('deletePasswordLabel')}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          {error && <Notice>{error}</Notice>}
          <Button type="submit" variant="danger" disabled={working}>
            {working ? t('deleting') : t('deleteConfirm')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={working}>
            {t('deleteCancel')}
          </Button>
        </form>
      ) : (
        <div className="mt-5">
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {t('deleteAction')}
          </Button>
        </div>
      )}
    </section>
  );
}
