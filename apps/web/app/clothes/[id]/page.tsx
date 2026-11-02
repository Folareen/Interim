import { templates } from '@interim/templates';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { isGarmentKey } from '@/lib/labels';
import { getGarments, getMe, getProfile } from '@/lib/server-api';
import { GarmentList } from './garment-list';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('clothes'))('title') };
}

export default async function Clothes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile || profile.kind !== 'situation') notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  if (!templates[profile.templateKey].usesFit) notFound();
  const [items, t] = await Promise.all([getGarments(id), getTranslations('clothes')]);
  if (!items) notFound();
  return (
    <Shell profileId={id} backHref={`/ready/${id}`} wide>
      <PageHeading title={t('title')} intro={t('intro')} />
      <GarmentList profileId={id} items={items.filter((item) => isGarmentKey(item.sku))} />
    </Shell>
  );
}
