import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { primaryClass, secondaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { isStageKey } from '@/lib/labels';
import { getCard, getCards, getMe, getProfile } from '@/lib/server-api';

const pageSchema = z.coerce.number().int().min(1).max(10000).default(1);
const PAGE_SIZE = 6;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('workspace'))('looks') };
}

export default async function Looks({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const parsed = pageSchema.safeParse((await searchParams).page);
  if (!parsed.success) notFound();
  const page = parsed.data;
  const [cards, t, stages, cardText, format] = await Promise.all([
    getCards(id),
    getTranslations('workspace'),
    getTranslations('stages'),
    getTranslations('card'),
    getFormatter(),
  ]);
  const selected = cards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (page > 1 && selected.length === 0) notFound();
  const views = await Promise.all(selected.map((card) => getCard(card.id)));
  return (
    <Shell profileId={id} active="looks" wide>
      <PageHeading title={t('looks')} />
      {cards.length === 0 ? (
        <section className="workspace-card mt-8 p-6 sm:p-10">
          <h2 className="text-[1.5rem]">{t('emptyTitle')}</h2>
          <p className="mt-3 text-muted">{t('emptyBody')}</p>
          <Link href={`/update/${id}`} className={`${primaryClass} mt-6 max-w-sm`}>
            {t('firstAction')}
          </Link>
        </section>
      ) : (
        <ul className="mt-8 grid grid-cols-2 items-start gap-3 sm:gap-5 xl:grid-cols-3">
          {views.map((view) => {
            if (!view) return null;
            const preview = view.card.options.find((option) => view.renderUrls[option.renderId]);
            return (
              <li key={view.id} className="workspace-card overflow-hidden">
                <Link href={`/cards/${view.id}`} className="block hover:bg-tint">
                  {preview ? (
                    <img
                      src={view.renderUrls[preview.renderId]}
                      alt={cardText('previewAlt')}
                      className="aspect-[3/4] w-full border-b border-border object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[3/4] items-center justify-center bg-tint p-5 text-center text-muted">
                      {cardText('imageGone')}
                    </div>
                  )}
                  <div className="space-y-1 p-3 sm:p-4">
                    <p className="text-[0.9rem] text-muted">
                      {format.dateTime(new Date(view.card.takenAt), { dateStyle: 'medium' })}
                    </p>
                    <h2 className="text-[1rem]">
                      {isStageKey(view.card.stageKey) ? stages(view.card.stageKey) : t('openCard')}
                    </h2>
                    <p className="inline-flex min-h-11 items-center text-[0.9rem] font-semibold text-accent">
                      {t('openCard')} <span aria-hidden="true">↗</span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {(page > 1 || cards.length > page * PAGE_SIZE) && (
        <nav aria-label={t('pages')} className="mt-8 flex flex-wrap gap-3">
          {page > 1 && (
            <Link href={`/looks/${id}?page=${page - 1}`} className={`${secondaryClass} sm:w-auto`}>
              {t('newer')}
            </Link>
          )}
          {cards.length > page * PAGE_SIZE && (
            <Link href={`/looks/${id}?page=${page + 1}`} className={`${secondaryClass} sm:w-auto`}>
              {t('older')}
            </Link>
          )}
        </nav>
      )}
    </Shell>
  );
}
