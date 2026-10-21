import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { primaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';

export default async function NotFound() {
  const t = await getTranslations('common');
  return (
    <Shell>
      <PageHeading title={t('notFoundTitle')} intro={t('notFoundBody')} />
      <div className="mt-8">
        <Link href="/" className={primaryClass}>
          {t('startAgain')}
        </Link>
      </div>
    </Shell>
  );
}
