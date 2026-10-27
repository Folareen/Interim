import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { primaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { isStageKey } from '@/lib/labels';
import { getDemo } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('demo'))('title') };
}

/** The public demo: simulated people whose cards were recorded from real runs. Read only, so it can never spend units. */
export default async function Demo() {
  const [people, t, labels, stages, format] = await Promise.all([
    getDemo(),
    getTranslations('demo'),
    getTranslations('templateLabels'),
    getTranslations('stages'),
    getFormatter(),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <Shell backHref="/">
      <h1 className="text-[2rem] leading-[1.15]">{t('title')}</h1>
      <p className="mt-4 text-[1.05rem] leading-relaxed">{t('intro')}</p>

      {people.map((person) => (
        <section key={person.id} className="mt-10">
          <h2 className="text-[1.25rem]">{labels(person.templateKey)}</h2>
          <p className="mt-1 text-[0.95rem] text-muted">
            {t('simulated')}. {t('recordedOn', { date: date(person.recordedOn) })}
          </p>
          <h3 className="mt-4 text-[0.95rem] text-muted">{t('checkInsTitle')}</h3>
          <ol className="mt-2 space-y-3">
            {person.cards.map((card) => (
              <li key={card.id}>
                <Link
                  href={`/demo/cards/${card.id}`}
                  className="block rounded-card border border-border bg-surface px-4 py-3 font-semibold transition-colors hover:border-accent"
                >
                  {t('checkInLine', { stage: isStageKey(card.stageKey) ? stages(card.stageKey) : '', date: date(card.takenAt) })}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <div className="mt-10 pb-6">
        <Link href="/signup" className={primaryClass}>
          {t('startAction')}
        </Link>
      </div>
    </Shell>
  );
}
