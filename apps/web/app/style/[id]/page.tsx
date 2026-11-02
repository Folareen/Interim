import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getProfile, getStylePhotos } from '@/lib/server-api';
import { StyleWorkspace } from './style-workspace';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('style'))('title') };
}

export default async function Style({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile || profile.kind !== 'style') notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const [list, t] = await Promise.all([getStylePhotos(id), getTranslations('style')]);
  if (!list) notFound();
  return (
    <Shell profileId={id} kind="style" active="style" wide>
      <PageHeading title={t('title')} intro={t('intro')} />
      <StyleWorkspace profileId={id} initial={list.photos} />
    </Shell>
  );
}
