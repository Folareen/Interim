import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getProfile, getReflections } from '@/lib/server-api';
import { ReflectForm } from './reflect-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('reflect'))('title') };
}

export default async function Reflect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const [view, t] = await Promise.all([getReflections(id), getTranslations('reflect')]);
  if (!view) notFound();
  return (
    <Shell profileId={id} backHref={`/ready/${id}`}>
      <PageHeading title={t('title')} intro={t('intro')} />
      <ReflectForm
        profileId={id}
        contactsShowing={view.contacts}
        initial={view.reflections.map((r) => ({
          id: r.id,
          text: r.text,
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </Shell>
  );
}
