import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmailLinkForm } from '@/components/email-link-form';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('forgotTitle') };
}

export default async function Forgot() {
  const t = await getTranslations('auth');
  return (
    <Shell backHref="/signin">
      <PageHeading title={t('forgotTitle')} intro={t('forgotIntro')} />
      <EmailLinkForm kind="reset" />
    </Shell>
  );
}
