'use client';

import { soundsLikeCrisis } from '@interim/rules';
import { liveLocaleSchema } from '@interim/types';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/button';
import { CrisisContacts } from '@/components/crisis-contacts';
import { Notice } from '@/components/notice';
import { ApiError, deleteReflection, dismissContacts, saveReflection } from '@/lib/api';

interface Item {
  id: string;
  text: string;
  createdAt: string;
}

/**
 * The one free text field in the app. The device runs the exact crisis check before it sends
 * anything, so the contacts show at once; the server checks again and decides what is kept.
 */
export function ReflectForm({ profileId, initial, contactsShowing }: { profileId: string; initial: Item[]; contactsShowing: boolean }) {
  const t = useTranslations('reflect');
  const common = useTranslations('common');
  const format = useFormatter();
  const locale = liveLocaleSchema.parse(useLocale());
  const [text, setText] = useState('');
  const [items, setItems] = useState(initial);
  const [flagged, setFlagged] = useState(contactsShowing);
  const [asked, setAsked] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError(undefined);
    if (soundsLikeCrisis(body, locale)) setFlagged(true);
    setWorking(true);
    try {
      const saved = await saveReflection(profileId, body);
      setItems((current) => [{ id: saved.reflection.id, text: saved.reflection.text, createdAt: saved.reflection.createdAt.toISOString() }, ...current]);
      setText('');
      if (saved.contacts) setFlagged(true);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 429
          ? t('tooMany')
          : common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'),
      );
    } finally {
      setWorking(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteReflection(profileId, id);
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
    }
  }

  function closeContacts() {
    setAsked(false);
    if (flagged) {
      setFlagged(false);
      void dismissContacts(profileId).catch(() => undefined);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-8">
        <label htmlFor="reflection" className="block text-[1.15rem] font-semibold">
          {t('prompt')}
        </label>
        <textarea
          id="reflection"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={4000}
          rows={6}
          className="mt-3 w-full rounded-xl border border-outline bg-surface px-4 py-3 text-base text-text"
        />
        {error && (
          <div className="mt-4">
            <Notice>{error}</Notice>
          </div>
        )}
        <p role="status" className="sr-only">
          {working ? t('saving') : ''}
        </p>
        <div className="mt-4">
          <Button type="submit" disabled={working || text.trim() === ''}>
            {working ? t('saving') : t('save')}
          </Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {(flagged || asked) && <CrisisContacts onClose={closeContacts} />}
        {!flagged && !asked && (
          <button type="button" onClick={() => setAsked(true)} className="text-[0.95rem] text-accent underline underline-offset-4">
            {t('contactsLink')}
          </button>
        )}
      </div>

      <section className="mt-10 mb-12">
        <h2 className="text-[1.25rem]">{t('previousTitle')}</h2>
        {items.length === 0 && <p className="mt-3 text-muted">{t('empty')}</p>}
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-card border border-border bg-surface px-4 py-3">
              <p className="text-[0.9rem] text-muted">{format.dateTime(new Date(item.createdAt), { dateStyle: 'medium' })}</p>
              <p className="mt-1 whitespace-pre-wrap">{item.text}</p>
              <button type="button" onClick={() => void remove(item.id)} className="mt-2 text-[0.95rem] text-danger underline underline-offset-4">
                {t('deleteAction')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
