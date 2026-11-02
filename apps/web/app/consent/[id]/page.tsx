import { CONSENT_VERSION } from '@interim/rules';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { profileHref } from '@/lib/profile-href';
import { getMe, getProfile } from '@/lib/server-api';
import { ConsentForm } from './consent-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('consent'))('title') };
}

export default async function Consent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (profile.consentCurrent) redirect(profileHref(profile));
  const t = await getTranslations('consent');
  return (
    <Shell step={profile.kind === 'style' ? undefined : 3}>
      <PageHeading title={t('title')} intro={t('intro')} />
      <ConsentForm profileId={id} version={CONSENT_VERSION} kind={profile.kind} />
    </Shell>
  );
}
