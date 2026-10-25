'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ApiError, createShare, revokeShare } from '@/lib/api';

interface Link {
  id: string;
  expiresAt: string;
  /** Only a link made on this screen has one: the API keeps no token to show again. */
  url?: string;
}

/** Makes a link for a stylist, barber or friend, lists the ones that work, and stops any of them. */
export function ShareCard({ cardId, links: initial }: { cardId: string; links: Link[] }) {
  const t = useTranslations('share');
  const common = useTranslations('common');
  const format = useFormatter();
  const [links, setLinks] = useState(initial);
  const [working, setWorking] = useState<string | 'new'>();
  const [copied, setCopied] = useState<string>();
  const [error, setError] = useState<string>();

  const fail = (cause: unknown) => setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));

  async function make() {
    setWorking('new');
    setError(undefined);
    try {
      const made = await createShare(cardId);
      setLinks((current) => [...current, { id: made.id, expiresAt: made.expiresAt, url: `${window.location.origin}/s/${made.token}` }]);
    } catch (cause) {
      fail(cause);
    }
    setWorking(undefined);
  }

  async function stop(id: string) {
    setWorking(id);
    setError(undefined);
    try {
      await revokeShare(id);
      setLinks((current) => current.filter((l) => l.id !== id));
    } catch (cause) {
      fail(cause);
    }
    setWorking(undefined);
  }

  async function copy(link: Link) {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(link.id);
    } catch {
      // The link is in a field the person can select, so a refused clipboard costs nothing.
    }
  }

  let status = '';
  if (working === 'new') status = t('making');
  else if (copied) status = t('copied');

  return (
    <section className="space-y-3">
      <h2 className="text-[1.25rem]">{t('title')}</h2>
      <p className="text-[0.95rem] text-muted">{t('note')}</p>
      {error && <Notice>{error}</Notice>}
      <p role="status" className="sr-only">
        {status}
      </p>
      {links.length > 0 && (
        <ul className="space-y-3">
          {links.map((link) => (
            <li key={link.id} className="space-y-3 rounded-card border border-border bg-surface px-4 py-3">
              {link.url && (
                <label className="block">
                  <span className="text-[0.9rem] text-muted">{t('linkLabel')}</span>
                  <input
                    readOnly
                    value={link.url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="mt-1 h-12 w-full rounded-xl border border-outline bg-bg px-3 text-[0.95rem]"
                  />
                </label>
              )}
              <p className="text-[0.95rem] text-muted">{t('expires', { date: format.dateTime(new Date(link.expiresAt), { dateStyle: 'medium' }) })}</p>
              {link.url && (
                <Button variant="secondary" onClick={() => copy(link)}>
                  {copied === link.id ? t('copied') : t('copy')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => stop(link.id)} disabled={working === link.id}>
                {working === link.id ? t('stopping') : t('stop')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={make} disabled={working === 'new'}>
        {working === 'new' ? t('making') : t('action')}
      </Button>
    </section>
  );
}
