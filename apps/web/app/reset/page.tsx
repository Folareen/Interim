import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { primaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { ResetForm } from './reset-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('resetTitle') };
}

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [t, { token }] = await Promise.all([getTranslations('auth'), searchParams]);
  return (
    <Shell>
      <PageHeading title={t('resetTitle')} intro={t('resetIntro')} />
      {token ? (
        <ResetForm token={token} />
      ) : (
        <div className="mt-8">
          <Link href="/forgot" className={primaryClass}>
            {t('askNewLink')}
          </Link>
        </div>
      )}
    </Shell>
  );
}
