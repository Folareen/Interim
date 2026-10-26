'use client';

import type { WordsView } from '@interim/types';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { getWords } from '@/lib/api';

/** Local date as YYYY-MM-DD, so the passage turns over at the person's midnight and not the server's. */
function localDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today's passage. The page only renders it while words for today is on. */
export function TodaysWords({ profileId }: { profileId: string }) {
  const t = useTranslations('words');
  const locale = useLocale();
  const [view, setView] = useState<WordsView>();

  useEffect(() => {
    // Quietly shows nothing on failure: the passage is an extra, not part of the check in.
    getWords(profileId, localDate()).then(setView, () => undefined);
  }, [profileId]);

  const words = view?.words;
  if (!words) return null;
  return (
    <section aria-labelledby="words-title" className="mt-8">
      <h2 id="words-title" className="text-[1.25rem]">
        {t('title')}
      </h2>
      <figure className="mt-3 rounded-card border border-border bg-surface p-5">
        <blockquote lang={words.locale} className="whitespace-pre-line text-[1.1rem] leading-relaxed">
          {words.text}
        </blockquote>
        <figcaption className="mt-3 text-[0.9rem] text-muted">
          {words.source}
          {words.translation && ` · ${words.translation}`}
        </figcaption>
      </figure>
      {words.locale !== locale && <p className="mt-2 text-[0.9rem] text-muted">{t('englishNote')}</p>}
    </section>
  );
}
