import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getProfile } from '@/lib/server-api';
import { DeleteProfile } from './delete-profile';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('ready'))('title') };
}

export default async function Ready({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const [t, labels, setup, consent] = await Promise.all([
    getTranslations('ready'),
    getTranslations('templateLabels'),
    getTranslations('setup'),
    getTranslations('consent'),
  ]);
  const summary = [
    [t('situationLabel'), labels(profile.templateKey)],
    [t('toneLabel'), setup(`tones.${profile.tone}.label`)],
    [t('photosLabel'), consent(`retention.${profile.retention}.label`)],
  ];
  return (
    <Shell>
      <PageHeading title={t('title')} intro={t('intro')} />
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
      <p className="mt-8 mb-12">{t('next')}</p>
      <DeleteProfile profileId={id} />
    </Shell>
  );
}
