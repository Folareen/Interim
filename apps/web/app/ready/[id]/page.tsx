import { localeNames } from '@interim/templates';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { primaryClass, secondaryClass } from '@/components/button';
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
      <div className="mb-8 max-w-2xl">
        <p className="mb-3 text-[0.9rem] font-semibold tracking-wide text-accent">{t('today')}</p>
        <h1 className="text-[2.25rem] leading-[1.12] sm:text-[2.75rem]">
          {t(profile.hasBaseline ? 'todayTitle' : 'firstTitle')}
        </h1>
        <p className="mt-4 max-w-xl text-[1.05rem] text-muted">
          {t(profile.hasBaseline ? 'todayIntro' : 'firstIntro')}
        </p>
      </div>
      {reflections?.contacts && (
        <div className="mb-7">
          <FlaggedContacts profileId={id} />
        </div>
      )}
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <section className="rounded-card bg-tint p-5 sm:p-6 xl:col-start-2 xl:row-start-1">
          <p className="mb-3 text-[0.9rem] font-semibold text-accent">{t('nextStep')}</p>
          <h2 className="text-[1.55rem] leading-snug">
            {t(inProgress ? 'processingTitle' : 'updateTitle')}
          </h2>
          <p className="mt-3 text-[0.95rem] text-muted">
            {t(inProgress ? 'processingBody' : 'updateBody')}
          </p>
          <Link href={next} className={`${primaryClass} mt-6`}>
            {action}
          </Link>
        </section>
        <section className="workspace-card min-w-0 overflow-hidden xl:col-start-1 xl:row-start-1 xl:row-span-3">
          {latest ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 p-5 sm:p-6">
                <h2 className="text-[1.4rem]">{t('latestTitle')}</h2>
                <p className="text-[0.9rem] text-muted">
                  {format.dateTime(new Date(latest.card.takenAt), { dateStyle: 'medium' })}
                </p>
              </div>
              {preview ? (
                <Link href={`/cards/${latest.id}`} aria-label={t('openCard')}>
                  <img
                    src={latest.renderUrls[preview.renderId]}
                    alt={cardText('previewAlt')}
                    className="aspect-[4/3] w-full border-y border-border object-cover object-top sm:aspect-[5/4]"
                  />
                </Link>
              ) : (
                <p className="bg-tint px-6 py-12 text-muted">{cardText('imageGone')}</p>
              )}
              <div className="space-y-5 p-5 sm:p-6">
                <p lang={latest.card.locale} className="font-serif text-[1.25rem] leading-relaxed">
                  {latest.card.companionNote.text}
                </p>
                {latest.card.locale !== locale && (
                  <p className="text-[0.9rem] text-muted">
                    {t('savedLanguage', { language: localeNames[latest.card.locale] })}
                  </p>
                )}
                <Link href={`/cards/${latest.id}`} className={secondaryClass}>
                  {t('openCard')}{' '}
                  <span aria-hidden="true" className="ml-3">
                    ↗
                  </span>
                </Link>
              </div>
            </>
          ) : (
            <div className="px-6 py-10 sm:px-10 sm:py-16">
              <svg
                aria-hidden="true"
                viewBox="0 0 200 180"
                fill="none"
                className="mx-auto mb-8 h-40 w-full max-w-56 text-outline"
              >
                <rect x="36" y="10" width="128" height="160" rx="52" className="fill-tint" />
                <circle cx="100" cy="69" r="25" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M54 143c2-34 19-49 46-49s44 15 46 49"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path d="M28 40H15v18m157 82h13v-18" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <h2 className="text-[1.6rem]">{t('emptyTitle')}</h2>
              <p className="mt-3 text-muted">{t('emptyBody')}</p>
            </div>
          )}
        </section>

        <section className="workspace-card p-5 sm:p-6 xl:col-start-2">
          <h2 className="text-[1.3rem]">{t('quietTitle')}</h2>
          <p className="mt-3 text-[0.95rem] text-muted">{reflect('offerBody')}</p>
          <Link
            href={`/reflect/${id}`}
            className="mt-3 inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4"
          >
            {reflect('readyAction')}
          </Link>
        </section>
        {preferences?.wordsSet && (
          <div className="xl:col-start-2">
            <TodaysWords profileId={id} />
          </div>
        )}
      </div>
    </Shell>
  );
}
