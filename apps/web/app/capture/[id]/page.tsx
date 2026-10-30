import { capturePlan } from '@interim/rules';
import { templates } from '@interim/templates';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getProfile } from '@/lib/server-api';
import { CaptureWizard } from './capture-wizard';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('capture'))('title') };
}

export default async function Capture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);

  // The same rule the server applies, so the screen never asks for a photo the server would refuse.
  const plan = capturePlan({
    isBaseline: !profile.hasBaseline,
    usesFit: templates[profile.templateKey].usesFit,
    bodyPhotos: profile.bodyPhotos,
  });
  const [t, locale] = await Promise.all([getTranslations('capture'), getLocale()]);
  return (
    <Shell
      profileId={id}
      backHref={
        templates[profile.templateKey].usesFit && profile.bodyPhotos
          ? `/update/${id}`
          : `/ready/${id}`
      }
    >
      <PageHeading title={t('title')} intro={t('intro')} />
      <CaptureWizard profileId={id} plan={plan} locale={locale} />
    </Shell>
  );
}
