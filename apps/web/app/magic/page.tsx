import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmailLinkForm } from '@/components/email-link-form';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('magicTitle') };
}

export default async function Magic() {
  const t = await getTranslations('auth');
  return (
    <Shell backHref="/signin">
      <PageHeading title={t('magicTitle')} intro={t('magicIntro')} />
      <EmailLinkForm kind="magic" />
    </Shell>
  );
}
