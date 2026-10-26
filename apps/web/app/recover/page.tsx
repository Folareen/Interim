import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { RecoverForm } from './recover-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('recoverTitle') };
}

export default async function Recover() {
  const t = await getTranslations('auth');
  return (
    <Shell backHref="/signin">
      <PageHeading title={t('recoverTitle')} intro={t('recoverIntro')} />
      <RecoverForm />
    </Shell>
  );
}
