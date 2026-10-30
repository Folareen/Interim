'use client';

import { liveLocaleSchema } from '@interim/types';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { ApiError, createRecoveryCodes, deleteAccount, logout, requestEmailChange } from '@/lib/api';
import { useAuthError } from '@/lib/use-auth-error';

/** Signs this browser out. */
export function SignOut({ compact = false }: { compact?: boolean }) {
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
      setError(
        common(
          cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError',
        ),
      );
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Notice>{error}</Notice>}
      <p role="status" className="sr-only">
        {working ? t('signingOut') : ''}
      </p>
      <Button
        variant="secondary"
        className={
          compact ? 'min-h-11! w-auto shrink-0 border-border px-4! py-2! text-[0.9rem]!' : undefined
        }
        onClick={signOut}
        disabled={working}
      >
        {working ? t('signingOut') : t('signOut')}
      </Button>
      {!compact && <p className="text-[0.9rem] text-muted">{t('signOutHint')}</p>}
    </div>
  );
}

/** Asks for a link at a new address. The email changes only when that link is opened, so a typo costs nothing. */
export function ChangeEmail({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations('account');
  const locale = liveLocaleSchema.parse(useLocale());
  const describe = useAuthError();
  const [open, setOpen] = useState(false);
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
      await requestEmailChange({ email, locale, password: hasPassword ? password : undefined });
      setSentTo(email);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 403 ? t('deleteWrongPassword') : describe(cause));
    }
    setWorking(false);
  }

  if (sentTo) {
    return (
      <p role="status" className="mt-3 text-[0.95rem]">
        {t('emailChangeSent', { email: sentTo })}
      </p>
    );
  }
  if (!open) {
    return (
      <div className="mt-3">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('emailChangeAction')}
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-4">
      <p className="text-[0.95rem] text-muted">{t('emailChangeIntro')}</p>
      <Field label={t('newEmailLabel')} type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
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
      <p role="status" className="sr-only">
        {working ? t('emailChangeWorking') : ''}
      </p>
      <Button type="submit" disabled={working}>
        {working ? t('emailChangeWorking') : t('emailChangeSubmit')}
      </Button>
      <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={working}>
        {t('cancel')}
      </Button>
    </form>
  );
}

/** Makes recovery codes and shows them once. A new set replaces the old, so the password is asked for when there is one. */
export function RecoveryCodes({ hasPassword, left }: { hasPassword: boolean; left: number }) {
  const t = useTranslations('account');
  const common = useTranslations('common');
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function make(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      setCodes((await createRecoveryCodes({ password: hasPassword ? password : undefined })).codes);
      setPassword('');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) setError(t('deleteWrongPassword'));
      else setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
    }
    setWorking(false);
  }

  if (codes) {
    return (
      <div className="mt-3 space-y-4">
        <h3 className="font-semibold">{t('recoveryShownTitle')}</h3>
        <p className="text-[0.95rem] text-muted">{t('recoveryShownBody')}</p>
        <ul className="grid grid-cols-1 gap-2 rounded-card border border-border bg-surface px-4 py-3 font-mono text-[1.05rem]">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Button
          onClick={() => {
            setCodes(undefined);
            setAsking(false);
            router.refresh();
          }}
        >
          {t('recoveryDone')}
        </Button>
      </div>
    );
  }

  const ask = !hasPassword || asking;
  const label = left > 0 ? t('recoveryReplace') : t('recoveryCreate');
  return (
    <form onSubmit={make} className="mt-3 space-y-4">
      {hasPassword && asking && (
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
      <p role="status" className="sr-only">
        {working ? t('recoveryWorking') : ''}
      </p>
      {ask ? (
        <Button type="submit" variant="secondary" disabled={working}>
          {working ? t('recoveryWorking') : label}
        </Button>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
          {label}
        </Button>
      )}
    </form>
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
