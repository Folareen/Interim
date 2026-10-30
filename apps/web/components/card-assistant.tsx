'use client';

import { crisisCheck } from '@interim/rules';
import { measuredValueText } from '@interim/templates';
import {
  type AssistantReply,
  type AssistantTopic,
  type CardView,
  type LiveLocale,
  assistantTopicSchema,
  liveLocales,
} from '@interim/types';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, askAboutCard } from '@/lib/api';
import { isGarmentKey } from '@/lib/labels';
import { Button } from './button';
import { CrisisContacts } from './crisis-contacts';
import { Notice } from './notice';

/** Optional read-only help beside a result. Topic buttons work without English, a model, or a network call. */
export function CardAssistant({
  view,
  locale,
  available,
}: {
  view: CardView;
  locale: LiveLocale;
  available: boolean;
}) {
  const t = useTranslations('assistant');
  const card = useTranslations('card');
  const capture = useTranslations('capture');
  const setup = useTranslations('setup');
  const share = useTranslations('share');
  const garments = useTranslations('garments');
  const common = useTranslations('common');
  const [reply, setReply] = useState<AssistantReply>();
  const [message, setMessage] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const support = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reply?.kind === 'support') support.current?.focus();
  }, [reply?.kind]);
  const labels: Record<AssistantTopic, string> = {
    changes: card('changesTitle'),
    previews: card('optionsTitle'),
    sizes: card('shoppingTitle'),
    photos: capture('title'),
    tone: setup('toneTitle'),
    sharing: share('title'),
  };
  const answers: Record<AssistantTopic, string> = {
    changes: t('changesHelp'),
    previews: card('optionsIntro'),
    sizes: card('shoppingIntro'),
    photos: capture('intro'),
    tone: setup(`tones.${view.card.companionNote.tone}.description`),
    sharing: share('note'),
  };
  const links: Record<AssistantTopic, string> = {
    changes: '#card-changes',
    previews: '#card-previews',
    sizes: '#card-shopping',
    photos: `/update/${view.profileId}`,
    tone: `/settings/${view.profileId}`,
    sharing: '#share-card',
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (liveLocales.some((language) => crisisCheck(message, language) !== 'none')) {
      setReply({ kind: 'support' });
      return;
    }
    if (!accepted || !message.trim() || !available || working) return;
    setWorking(true);
    try {
      setReply(
        await askAboutCard(view.id, { message: message.trim(), locale, acceptGoogle: true }),
      );
      setMessage('');
      setAccepted(false);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 429 ? t('limit') : common('genericError'),
      );
    } finally {
      setWorking(false);
    }
  }

  if (reply?.kind === 'support')
    return (
      <div ref={support} tabIndex={-1}>
        <CrisisContacts onClose={() => setReply(undefined)} />
      </div>
    );

  return (
    <details className="workspace-card p-5 sm:p-6">
      <summary className="min-h-11 cursor-pointer font-serif text-[1.4rem]">{t('title')}</summary>
      <p className="mt-3 text-[0.95rem] text-muted">{t(available ? 'intro' : 'unavailable')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {assistantTopicSchema.options.map((topic) => (
          <button
            type="button"
            key={topic}
            aria-pressed={reply?.kind === 'topic' && reply.topic === topic}
            onClick={() => {
              setReply({ kind: 'topic', topic });
              setError(undefined);
            }}
            className="min-h-11 rounded-xl border border-outline bg-surface px-3 py-2 text-[0.95rem] transition-colors hover:bg-tint aria-pressed:bg-tint aria-pressed:font-semibold"
          >
            {labels[topic]}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-5">
        {reply?.kind === 'topic' && (
          <div className="space-y-3 border-l-2 border-accent pl-4">
            <h3 className="font-sans font-semibold">{labels[reply.topic]}</h3>
            <p>{answers[reply.topic]}</p>
            {reply.topic === 'changes' && (
              <ul className="space-y-2">
                {view.card.changes.map((change, index) => (
                  <li key={index}>{measuredValueText(change.value, locale)}</li>
                ))}
              </ul>
            )}
            {reply.topic === 'sizes' && (
              <ul className="space-y-2">
                {view.card.shoppingList.map((piece) =>
                  isGarmentKey(piece.sku) ? (
                    <li key={piece.sku}>
                      {card('shoppingLine', { item: garments(piece.sku), size: piece.size })}
                    </li>
                  ) : null,
                )}
              </ul>
            )}
            <Link
              href={links[reply.topic]}
              onClick={() => {
                const target = document.getElementById(links[reply.topic].slice(1));
                if (target instanceof HTMLDetailsElement) target.open = true;
              }}
              className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4"
            >
              {t('open', { topic: labels[reply.topic] })}
            </Link>
          </div>
        )}
        {(reply?.kind === 'clarify' || reply?.kind === 'unavailable') && <p>{t(reply.kind)}</p>}
      </div>
      {available ? (
        <form onSubmit={submit} className="mt-6 space-y-4 border-t border-border pt-5">
          <label className="block font-semibold" htmlFor="card-question">
            {t('ask')}
          </label>
          <textarea
            id="card-question"
            value={message}
            maxLength={1000}
            rows={3}
            required
            placeholder={t('placeholder')}
            onChange={(event) => {
              setMessage(event.target.value);
              setAccepted(false);
            }}
            className="w-full rounded-xl border border-outline bg-bg px-4 py-3"
          />
          <p className="text-[0.9rem] text-muted">{t('privacy')}</p>
          <label className="flex min-h-11 items-start gap-3 text-[0.95rem]">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-1.5 size-5 shrink-0 accent-accent"
              required
            />
            {t('consent')}
          </label>
          <Button type="submit" disabled={!accepted || !message.trim() || working}>
            {working ? t('working') : t('send')}
          </Button>
        </form>
      ) : null}
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      <p role="status" className="sr-only">
        {working ? t('working') : ''}
      </p>
    </details>
  );
}
