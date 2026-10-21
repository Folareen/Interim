import { CONSENT_VERSION } from '@interim/rules';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getCopy } from '@/lib/prefs';
import { getProfile } from '@/lib/server-api';
import { ConsentForm } from './consent-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getCopy()).ui.consent.title };
}

export default async function Consent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (profile.consentCurrent) redirect(`/ready/${id}`);
  const { ui } = await getCopy();
  return (
    <Shell step={4}>
      <PageHeading title={ui.consent.title} intro={ui.consent.intro} />
      <ConsentForm
        profileId={id}
        version={CONSENT_VERSION}
        text={ui.consent}
        errors={{ network: ui.common.networkError, generic: ui.common.genericError }}
      />
    </Shell>
  );
}
