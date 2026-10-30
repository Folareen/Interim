import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { templates } from '@interim/templates';
import { CardAssistant } from '@/components/card-assistant';
import { secondaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { cardHasClothes, StageCardBody } from '@/components/stage-card-body';
import { getAssistantAvailable, getCard, getMe, getShares } from '@/lib/server-api';
import { ApproveCard } from './approve-card';
import { ShareCard } from './share-card';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('card'))('title') };
}

export default async function Card({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const [view, shares, available, locale] = await Promise.all([
    getCard(id),
    getShares(id),
    getAssistantAvailable(),
    getLocale(),
  ]);
  if (!view) notFound();
  const { card } = view;
  const [t, ready, reflect, share, workspace] = await Promise.all([
    getTranslations('card'),
    getTranslations('ready'),
    getTranslations('reflect'),
    getTranslations('share'),
    getTranslations('workspace'),
  ]);
  const reportedALot = card.changes.some(
    (change) => change.value.kind === 'reported_change' && change.value.changed === 'lot',
  );
  return (
    <Shell profileId={view.profileId} active="looks" backHref={`/looks/${view.profileId}`} wide>
      <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0">
          <StageCardBody
            view={view}
            afterHold={
              templates[card.templateKey].usesFit &&
              !cardHasClothes(card) && (
                <section className="mt-6 space-y-3">
                  <p>{t('clothesEmpty')}</p>
                  <Link href={`/update/${view.profileId}`} className={secondaryClass}>
                    {ready('clothesAction')}
                  </Link>
                </section>
              )
            }
            afterWhatToSay={
              reportedALot && (
                <section className="mt-6 space-y-3">
                  <p>{reflect('offerBody')}</p>
                  <Link href={`/reflect/${view.profileId}`} className={secondaryClass}>
                    {reflect('offerAction')}
                  </Link>
                </section>
              )
            }
          />
        </div>
        <aside className="space-y-6 xl:sticky xl:top-8">
          <div className="workspace-card space-y-4 p-5">
            <ApproveCard cardId={view.id} approvedAt={view.approvedAt} />
            <Link
              href={`/ready/${view.profileId}`}
              className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-accent"
            >
              {workspace('today')}
            </Link>
          </div>
          <CardAssistant view={view} locale={locale} available={available} />
          <details id="share-card" className="workspace-card p-5">
            <summary className="min-h-11 cursor-pointer font-serif text-[1.4rem]">
              {share('title')}
            </summary>
            <ShareCard cardId={view.id} links={shares} />
          </details>
        </aside>
      </div>
    </Shell>
  );
}
