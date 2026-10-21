import { CONSENT_VERSION } from '@interim/rules';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getProfile } from '@/lib/server-api';
import { ConsentForm } from './consent-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('consent'))('title') };
}

export default async function Consent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (profile.consentCurrent) redirect(`/ready/${id}`);
  const t = await getTranslations('consent');
  return (
    <Shell step={4}>
      <PageHeading title={t('title')} intro={t('intro')} />
      <ConsentForm profileId={id} version={CONSENT_VERSION} />
    </Shell>
  );
}
