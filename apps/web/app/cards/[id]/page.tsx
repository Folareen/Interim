import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { secondaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { cardHasClothes, StageCardBody } from '@/components/stage-card-body';
import { getCard, getMe, getShares } from '@/lib/server-api';
import { templates } from '@interim/templates';
import { DeleteProfile } from '../../ready/[id]/delete-profile';
import { ApproveCard } from './approve-card';
import { ShareCard } from './share-card';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('card'))('title') };
}

export default async function Card({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const [view, shares] = await Promise.all([getCard(id), getShares(id)]);
  if (!view) notFound();
  const { card } = view;

  const [t, ready, reflect] = await Promise.all([getTranslations('card'), getTranslations('ready'), getTranslations('reflect')]);
  // Offered, never pushed, after a check in where the person reports a lot of change (overview, Reflection).
  const reportedALot = card.changes.some((c) => c.value.kind === 'reported_change' && c.value.changed === 'lot');

  return (
    <Shell backHref={`/ready/${view.profileId}`}>
      <StageCardBody
        view={view}
        afterHold={
          templates[card.templateKey].usesFit &&
          !cardHasClothes(card) && (
            <section className="mt-8 space-y-3">
              <p>{t('clothesEmpty')}</p>
              <Link href={`/clothes/${view.profileId}`} className={secondaryClass}>
                {ready('clothesAction')}
              </Link>
            </section>
          )
        }
        afterWhatToSay={
          reportedALot && (
            <section className="mt-8 space-y-3">
              <p>{reflect('offerBody')}</p>
              <Link href={`/reflect/${view.profileId}`} className={secondaryClass}>
                {reflect('offerAction')}
              </Link>
            </section>
          )
        }
      />

      <div className="mt-10">
        <ShareCard cardId={view.id} links={shares} />
      </div>

      <div className="mt-10 space-y-3">
        <ApproveCard cardId={view.id} approvedAt={view.approvedAt} />
        <Link href={`/settings/${view.profileId}`} className={secondaryClass}>
          {t('toneAction')}
        </Link>
        <Link href={`/ready/${view.profileId}`} className={secondaryClass}>
          {t('backAction')}
        </Link>
      </div>
      <div className="mt-10">
        <DeleteProfile profileId={view.profileId} />
      </div>
    </Shell>
  );
}
