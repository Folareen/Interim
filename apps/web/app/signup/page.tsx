import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getAuthConfig, getMe } from '@/lib/server-api';
import { SignUpForm } from './sign-up-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('signUpTitle') };
}

export default async function SignUp() {
  if (await getMe()) redirect('/account');
  const [t, config] = await Promise.all([getTranslations('auth'), getAuthConfig()]);
  return (
    <Shell backHref="/">
      <PageHeading title={t('signUpTitle')} intro={t('signUpIntro')} />
      <SignUpForm google={config.google} />
    </Shell>
  );
}
