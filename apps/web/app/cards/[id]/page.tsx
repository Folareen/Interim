import { measuredValueText } from '@interim/templates';
import { liveLocaleSchema } from '@interim/types';
import type { Metadata } from 'next';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { secondaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { isStageKey, isToolKey } from '@/lib/labels';
import { getCard, getMe } from '@/lib/server-api';
import { DeleteProfile } from '../../ready/[id]/delete-profile';
import { ApproveCard } from './approve-card';
import { OptionImage } from './option-image';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('card'))('title') };
}

const changeTools = ['hair_density', 'hair_length', 'hair_type', 'face_shape', 'skin_tone', 'self_report'] as const;
type ChangeTool = (typeof changeTools)[number];
const isChangeTool = (tool: string): tool is ChangeTool => (changeTools as readonly string[]).includes(tool);

export default async function Card({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const view = await getCard(id);
  if (!view) notFound();
  const { card } = view;

  const [t, trace, tools, stages, labels, locale, format] = await Promise.all([
    getTranslations('card'),
    getTranslations('trace'),
    getTranslations('tools'),
    getTranslations('stages'),
    getTranslations('templateLabels'),
    getLocale(),
    getFormatter(),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  // The person's current language, not the one the card was made in, so the screen reads in one language.
  const valueText = (value: Parameters<typeof measuredValueText>[0]) => measuredValueText(value, liveLocaleSchema.parse(locale));
  const stage = isStageKey(card.stageKey) ? stages(card.stageKey) : '';

  return (
    <Shell backHref={`/ready/${view.profileId}`}>
      <h1 className="text-[2rem] leading-[1.15]">{t('title')}</h1>
      <p className="mt-2 text-muted">{date(card.takenAt)}</p>

      <section className="mt-8 border-l-2 border-accent pl-4">
        <p className="text-[1.15rem]">{card.companionNote.text}</p>
      </section>

      <dl className="mt-8 divide-y divide-border rounded-card border border-border bg-surface">
        <div className="px-4 py-3">
          <dt className="text-[0.9rem] text-muted">{t('situationLabel')}</dt>
          <dd className="font-semibold">{labels(card.templateKey)}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[0.9rem] text-muted">{t('stageLabel')}</dt>
          <dd className="font-semibold">{stage}</dd>
        </div>
      </dl>

      {card.changes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('changesTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {card.changes.filter((c) => isChangeTool(c.tool)).map((change) => (
              <li key={`${change.tool}-${change.measurementId ?? 'reported'}`} className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="font-semibold">{t(`changeLine.${change.tool as ChangeTool}`, { value: valueText(change.value) })}</p>
                <p className="text-[0.9rem] text-muted">
                  {change.tool === 'self_report'
                    ? t('reportedOn', { date: date(change.measuredAt) })
                    : t(change.current ? 'measuredOn' : 'lastMeasuredOn', { date: date(change.measuredAt) })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[1.25rem]">{t('optionsTitle')}</h2>
        <p className="mt-2 text-[0.95rem] text-muted">{t('optionsIntro')}</p>
        {card.options.length === 0 && <p className="mt-4">{t('noOptions')}</p>}
        <ul className="mt-4 space-y-8">
          {card.options.map((option) => {
            const url = view.renderUrls[option.renderId];
            return (
              <li key={option.renderId}>
                {url ? (
                  <OptionImage previewUrl={url} photoUrl={view.photoUrl} label={t(option.label === 'preview' ? 'preview' : 'earlierLook')} />
                ) : (
                  <p className="rounded-card border border-border bg-surface px-4 py-6 text-muted">{t('imageGone')}</p>
                )}
                <p className="mt-3 font-semibold">{t(`optionReasons.${option.strategy}`)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      {card.whatToSay.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('whatToSayTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {card.whatToSay.map((line) => (
              <li key={line} className="border-l-2 border-accent pl-4">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="mt-8 rounded-card border border-border bg-surface px-4 py-3">
        <summary className="cursor-pointer font-semibold">{t('traceTitle')}</summary>
        <ol className="mt-3 space-y-2 text-[0.95rem]">
          {card.trace.map((line) => (
            <li key={line.seq}>{trace(line.reason, { tool: line.tool && isToolKey(line.tool) ? tools(line.tool) : '' })}</li>
          ))}
        </ol>
      </details>

      {card.sensitive && (
        <section className="mt-8 space-y-2 text-[0.95rem] text-muted">
          <p>{t('professionalLine')}</p>
          <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
            {t('talkLink')}
          </a>
        </section>
      )}

      <div className="mt-10 space-y-3">
        <ApproveCard cardId={view.id} approvedAt={view.approvedAt} />
        <Link href={`/settings/${view.profileId}`} className={secondaryClass}>
          {t('toneAction')}
        </Link>
        <Link href={`/ready/${view.profileId}`} className={secondaryClass}>
          {t('backAction')}
        </Link>
      </div>
      <div className="mt-10">
        <DeleteProfile profileId={view.profileId} />
      </div>
    </Shell>
  );
}
