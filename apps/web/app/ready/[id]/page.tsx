import { localeNames } from '@interim/templates';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { primaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import {
  getCard,
  getCards,
  getLatestRun,
  getMe,
  getPreferences,
  getProfile,
  getReflections,
} from '@/lib/server-api';
import { FlaggedContacts } from '../../reflect/[id]/flagged-contacts';
import { TodaysWords } from './todays-words';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('workspace'))('today') };
}

export default async function Ready({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const [cards, { run }, reflections, preferences, t, cardText, reflect, format, locale] =
    await Promise.all([
      getCards(id),
      getLatestRun(id),
      getReflections(id),
      getPreferences(id),
      getTranslations('workspace'),
      getTranslations('card'),
      getTranslations('reflect'),
      getFormatter(),
      getLocale(),
    ]);
  const latest = cards[0] ? await getCard(cards[0].id) : undefined;
  const preview = latest?.card.options.find((option) => latest.renderUrls[option.renderId]);
  const inProgress = run?.status === 'queued' || run?.status === 'running';
  const next = inProgress ? `/runs/${run.id}` : `/update/${id}`;
  let action = t('firstAction');
  if (profile.hasBaseline) action = t('updatePhotos');
  if (inProgress) action = t('continueAction');
  return (
    <Shell profileId={id} wide>
      <div className="mb-6 max-w-2xl">
        <h1>{t(profile.hasBaseline ? 'todayTitle' : 'firstTitle')}</h1>
        {!profile.hasBaseline && <p className="mt-2 max-w-lg text-muted">{t('firstIntro')}</p>}
      </div>
      {reflections?.contacts && (
        <div className="mb-5">
          <FlaggedContacts profileId={id} />
        </div>
      )}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="rounded-card bg-tint p-4 sm:p-5 xl:col-start-2 xl:row-start-1">
          {inProgress && (
            <p role="status" className="mb-4 text-[0.95rem]">
              {t('processingTitle')}
            </p>
          )}
          <Link href={next} className={`${primaryClass} gap-3`}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="size-5 shrink-0"
            >
              <path d="M4 7h4l2-3h4l2 3h4v13H4z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {action}
          </Link>
        </section>
        <section className="workspace-card min-w-0 overflow-hidden xl:col-start-1 xl:row-start-1 xl:row-span-3">
          {latest ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 p-4 sm:px-5">
                <h2 className="text-base">{t('latestTitle')}</h2>
                <p className="text-[0.9rem] text-muted">
                  {format.dateTime(new Date(latest.card.takenAt), { dateStyle: 'medium' })}
                </p>
              </div>
              {preview ? (
                <Link href={`/cards/${latest.id}`} aria-label={t('openCard')}>
                  <img
                    src={latest.renderUrls[preview.renderId]}
                    alt={cardText('previewAlt')}
                    className="aspect-[4/3] max-h-[26rem] w-full border-y border-border object-cover object-top"
                  />
                </Link>
              ) : (
                <p className="bg-tint px-5 py-12 text-muted">{cardText('imageGone')}</p>
              )}
              <div className="px-4 pt-4 pb-2 sm:px-5">
                <p lang={latest.card.locale} className="font-serif text-[1.1rem] leading-relaxed">
                  {latest.card.companionNote.text}
                </p>
                {latest.card.locale !== locale && (
                  <p className="mt-2 text-[0.9rem] text-muted">
                    {t('savedLanguage', { language: localeNames[latest.card.locale] })}
                  </p>
                )}
                <Link
                  href={`/cards/${latest.id}`}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 text-[0.95rem] font-semibold text-accent"
                >
                  {t('openCard')} <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </>
          ) : (
            <div className="px-6 py-10 text-center sm:py-16">
              <svg
                aria-hidden="true"
                viewBox="0 0 160 140"
                fill="none"
                className="mx-auto mb-5 h-32 w-40 text-outline"
              >
                <rect x="20" y="8" width="120" height="124" rx="35" className="fill-tint" />
                <circle cx="80" cy="52" r="22" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M40 115c0-26 16-40 40-40s40 14 40 40"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
              <h2 className="text-[1.1rem]">{t('emptyTitle')}</h2>
            </div>
          )}
        </section>
        <Link
          href={`/reflect/${id}`}
          className="workspace-card flex min-h-16 items-center justify-between gap-3 px-5 py-3 text-[0.95rem] font-semibold text-accent xl:col-start-2"
        >
          {reflect('readyAction')}
          <span aria-hidden="true">↗</span>
        </Link>
        {preferences?.wordsSet && (
          <div className="xl:col-start-2">
            <TodaysWords profileId={id} />
          </div>
        )}
      </div>
    </Shell>
  );
}
