import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { primaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { isStageKey } from '@/lib/labels';
import { styleDemo } from '@/lib/style-demo';
import { getDemo } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('demo'))('title') };
}

/** The public demo: simulated people whose cards were recorded from real runs. Read only, so it can never spend units. */
export default async function Demo() {
  const [people, t, style, labels, stages, format] = await Promise.all([
    getDemo(),
    getTranslations('demo'),
    getTranslations('style'),
    getTranslations('templateLabels'),
    getTranslations('stages'),
    getFormatter(),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });

  return (
    <Shell backHref="/">
      <h1 className="text-[2rem] leading-[1.15]">{t('title')}</h1>
      <p className="mt-4 text-[1.05rem] leading-relaxed">{t('intro')}</p>

      <section className="mt-10" aria-labelledby="demo-style">
        <h2 id="demo-style" className="text-[1.25rem]">
          {t('styleTitle')}
        </h2>
        <p className="mt-1 text-[0.95rem] text-muted">{t('styleIntro')}</p>
        <p className="mt-2 text-[0.9rem] text-muted">{style('limits')}</p>
        <ul className="mt-4 space-y-5">
          {styleDemo.map((item) => (
            <li key={item.id} className="workspace-card p-3 sm:p-4">
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {(
                  [
                    [`/demo/style/${item.reference}.jpg`, style('referenceCaption')],
                    [`/demo/style/${item.current}.jpg`, style('currentTitle')],
                    [`/demo/style/${item.id}.jpg`, style('previewLabel')],
                  ] as const
                ).map(([src, caption]) => (
                  <figure key={src}>
                    {/* The caption names the picture, so the image itself adds nothing for a screen reader. */}
                    <img src={src} alt="" width={480} height={640} loading="lazy" className="aspect-[3/4] w-full rounded-xl border border-border object-cover" />
                    <figcaption className="mt-1 text-[0.9rem] text-muted">{caption}</figcaption>
                  </figure>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

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
