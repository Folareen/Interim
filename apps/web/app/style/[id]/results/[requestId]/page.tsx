import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { secondaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getStyleRequest } from '@/lib/server-api';
import { OptionImage } from '../../../../cards/[id]/option-image';
import { SaveButton } from './save-button';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('style'))('resultsTitle') };
}

export default async function StyleResults({ params }: { params: Promise<{ id: string; requestId: string }> }) {
  const { id, requestId } = await params;
  if (!(await getMe())) redirect('/signin');
  const request = await getStyleRequest(requestId);
  if (!request || request.profileId !== id) notFound();
  const t = await getTranslations('style');
  return (
    <Shell profileId={id} kind="style" active="style" wide>
      <PageHeading title={t('resultsTitle')} intro={t('resultsIntro')} />
      <p className="mt-3 max-w-xl text-[0.9rem] text-muted">{t('limits')}</p>
      <ul className="mt-8 grid gap-8 pb-8 lg:grid-cols-2">
        {request.items.map((item, index) => (
          <li key={item.referenceId} className="workspace-card space-y-4 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3">
              <figure>
                <img
                  src={item.referenceUrl}
                  alt={t('referenceAlt', { n: index + 1 })}
                  className="aspect-[3/4] w-full rounded-card border border-border object-cover"
                />
                <figcaption className="mt-2 text-[0.9rem] text-muted">{t('referenceCaption')}</figcaption>
              </figure>
              <figure>
                <img
                  src={request.currentUrl}
                  alt={t('currentAlt')}
                  className="aspect-[3/4] w-full rounded-card border border-border object-cover"
                />
                <figcaption className="mt-2 text-[0.9rem] text-muted">{t('currentTitle')}</figcaption>
              </figure>
            </div>
            {item.preview ? (
              <>
                <OptionImage
                  previewUrl={item.preview.url}
                  photoUrl={request.currentUrl}
                  label={t('previewLabel')}
                  previewAlt={t('previewAlt')}
                  photoLabel={t('currentAlt')}
                />
                <SaveButton previewId={item.preview.id} initiallySaved={item.preview.saved} />
              </>
            ) : (
              <p className="rounded-xl border border-border bg-surface px-4 py-3">{t('noPreview')}</p>
            )}
          </li>
        ))}
      </ul>
      <Link href={`/style/${id}`} className={`${secondaryClass} mb-8 sm:w-fit`}>
        {t('tryOthers')}
      </Link>
    </Shell>
  );
}
