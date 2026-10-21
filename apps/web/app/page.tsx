import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Actions } from '@/components/actions';
import { primaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { StageDots } from '@/components/stage-dots';

export default async function Welcome() {
  const t = await getTranslations('welcome');
  return (
    <Shell>
      <div className="pt-8">
        <StageDots />
      </div>
      <h1 className="mt-8 text-[2.25rem] leading-[1.12]">{t('title')}</h1>
      <p className="mt-6 text-[1.1rem] leading-relaxed">{t('intro')}</p>
      <p className="mt-4 text-muted">{t('reassurance')}</p>
      <p className="mt-auto pt-10 pb-6 text-[0.9rem] text-muted">{t('footnote')}</p>
      <Actions>
        <Link href="/language" className={primaryClass}>
          {t('start')}
        </Link>
      </Actions>
    </Shell>
  );
}
