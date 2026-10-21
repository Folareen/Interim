import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { safeNext } from '@/lib/locale';
import { getAuthConfig, getMe } from '@/lib/server-api';
import { SignInForm } from './sign-in-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('signInTitle') };
}

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next, '/account');
  if (await getMe()) redirect(target);
  const [t, config] = await Promise.all([getTranslations('auth'), getAuthConfig()]);
  return (
    <Shell backHref="/">
      <PageHeading title={t('signInTitle')} intro={t('signInIntro')} />
      <SignInForm google={config.google} next={target} googleFailed={error === 'google'} />
    </Shell>
  );
}
