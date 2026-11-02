import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe } from '@/lib/server-api';
import { NewStyleForm } from './new-style-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('style'))('newTitle') };
}

export default async function NewStyle() {
  if (!(await getMe())) redirect('/signin?next=/style/new');
  const t = await getTranslations('style');
  return (
    <Shell backHref="/account">
      <PageHeading title={t('newTitle')} intro={t('newIntro')} />
      <NewStyleForm />
    </Shell>
  );
}
