import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { primaryClass, secondaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getCards, getMe, getProfile, getReflections } from '@/lib/server-api';
import { FlaggedContacts } from '../../reflect/[id]/flagged-contacts';
import { DeleteProfile } from './delete-profile';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('ready'))('title') };
}

export default async function Ready({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const [cards, reflections, t, labels, setup, consent, reflect] = await Promise.all([
    getCards(id),
    getReflections(id),
    getTranslations('ready'),
    getTranslations('templateLabels'),
    getTranslations('setup'),
    getTranslations('consent'),
    getTranslations('reflect'),
  ]);
  const summary = [
    [t('situationLabel'), labels(profile.templateKey)],
    [t('toneLabel'), setup(`tones.${profile.tone}.label`)],
    [t('photosLabel'), consent(`retention.${profile.retention}.label`)],
  ];
  return (
    <Shell>
      <PageHeading title={t('title')} intro={t('intro')} />
      {reflections?.contacts && (
        <div className="mt-8">
          <FlaggedContacts profileId={id} />
        </div>
      )}
      <section className="mt-8">
        <h2 className="text-[1.25rem]">{t('summaryTitle')}</h2>
        <dl className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
          {summary.map(([term, value]) => (
            <div key={term} className="px-4 py-3">
              <dt className="text-[0.9rem] text-muted">{term}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="mt-8">{t('next')}</p>
      <div className="mt-6 mb-12 space-y-3">
        <Link href={`/capture/${id}`} className={primaryClass}>
          {t('startAction')}
        </Link>
        {cards[0] && (
          <Link href={`/cards/${cards[0].id}`} className={secondaryClass}>
            {t('cardAction')}
          </Link>
        )}
        <Link href={`/reflect/${id}`} className={secondaryClass}>
          {reflect('readyAction')}
        </Link>
        <Link href={`/settings/${id}`} className={secondaryClass}>
          {t('editAction')}
        </Link>
      </div>
      <DeleteProfile profileId={id} />
    </Shell>
  );
}
