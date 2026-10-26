import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { primaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { ConfirmLink } from './confirm-link';

const titles = {
  verify: 'confirmVerifyTitle',
  magic: 'confirmMagicTitle',
  change: 'confirmChangeTitle',
  recover: 'confirmRecoverTitle',
} as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('auth'))('confirmMagicTitle') };
}

export default async function Confirm({ searchParams }: { searchParams: Promise<{ kind?: string; token?: string }> }) {
  const [t, { kind, token }] = await Promise.all([getTranslations('auth'), searchParams]);
  if ((kind !== 'verify' && kind !== 'magic' && kind !== 'change' && kind !== 'recover') || !token) {
    return (
      <Shell>
        <PageHeading title={t('linkInvalid')} />
        <div className="mt-8">
          <Link href="/magic" className={primaryClass}>
            {t('askNewLink')}
          </Link>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <PageHeading title={t(titles[kind])} intro={t('confirmBody')} />
      <ConfirmLink kind={kind} token={token} />
    </Shell>
  );
}
