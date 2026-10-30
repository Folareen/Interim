import { measureTools, renderTools } from '@interim/types';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { isToolKey } from '@/lib/labels';
import { getLedger, getMe } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('ledger'))('title') };
}

export default async function Ledger({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const view = await getLedger(id);
  if (!view) notFound();
  const [t, tools, format] = await Promise.all([
    getTranslations('ledger'),
    getTranslations('tools'),
    getFormatter(),
  ]);
  const totals = [
    [t('spent'), view.totals.settledUnits],
    [t('held'), view.totals.reservedUnits],
  ] as const;

  return (
    <Shell backHref={`/ready/${id}`}>
      <PageHeading title={t('title')} intro={t('intro')} />
      <dl className="mt-8 divide-y divide-border rounded-card border border-border bg-surface">
        {totals.map(([label, units]) => (
          <div key={label} className="px-4 py-3">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold">{t('units', { units: format.number(units) })}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[0.95rem] text-muted">{t('totalsHelp')}</p>
      <section className="mt-8 pb-8">
        <h2 className="text-[1.25rem]">{t('eventsTitle')}</h2>
        <p className="mt-2 text-[0.95rem] text-muted">{t('eventsHelp')}</p>
        {view.entries.length === 0 && <p className="mt-4">{t('empty')}</p>}
        <ol className="mt-4 space-y-3">
          {view.entries.map((entry) => {
            const measurement = measureTools.some((tool) => tool === entry.tool);
            const preview = renderTools.some((tool) => tool === entry.tool);
            let purpose = t('otherPurpose');
            if (measurement) purpose = t('measurePurpose');
            if (preview) purpose = t('previewPurpose');
            return (
              <li key={entry.id} className="rounded-card border border-border bg-surface px-4 py-3">
                <h3 className="font-sans font-semibold">
                  {isToolKey(entry.tool) ? tools(entry.tool) : t('otherTool')}
                </h3>
                <p className="text-[0.95rem]">{purpose}</p>
                <p className="mt-2 font-semibold">
                  {t(`events.${entry.kind}`, { units: format.number(entry.units) })}
                </p>
                <time dateTime={entry.createdAt} className="text-[0.9rem] text-muted">
                  {format.dateTime(new Date(entry.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </li>
            );
          })}
        </ol>
      </section>
    </Shell>
  );
}
