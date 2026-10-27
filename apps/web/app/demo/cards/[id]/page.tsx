import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { primaryClass, secondaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { StageCardBody } from '@/components/stage-card-body';
import { getDemoCard } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('card'))('title') };
}

/** One recorded card from the public demo. It carries no actions that change anything: no approve, share or delete. */
export default async function DemoCard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getDemoCard(id);
  if (!view) notFound();
  const [t, format] = await Promise.all([getTranslations('demo'), getFormatter()]);

  return (
    <Shell backHref="/demo">
      <p className="rounded-card border border-border bg-surface px-4 py-3 text-[0.95rem] text-muted">
        {t('cardBanner', { date: format.dateTime(new Date(view.card.takenAt), { dateStyle: 'medium' }) })}
      </p>
      <div className="mt-2">
        <StageCardBody view={view} />
      </div>
      <div className="mt-10 space-y-3 pb-6">
        <Link href="/demo" className={secondaryClass}>
          {t('backAction')}
        </Link>
        <Link href="/signup" className={primaryClass}>
          {t('startAction')}
        </Link>
      </div>
    </Shell>
  );
}
