import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { primaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getProfile, getStyleSaved } from '@/lib/server-api';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('style'))('savedTitle') };
}

export default async function SavedStyle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile || profile.kind !== 'style') notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const [saved, t] = await Promise.all([getStyleSaved(id), getTranslations('style')]);
  if (!saved) notFound();
  return (
    <Shell profileId={id} kind="style" active="saved" wide>
      <PageHeading title={t('savedTitle')} intro={t('savedIntro')} />
      {saved.previews.length === 0 ? (
        <div className="mt-8 space-y-4">
          <p className="text-muted">{t('savedEmpty')}</p>
          <Link href={`/style/${id}`} className={`${primaryClass} sm:w-fit`}>
            {t('tryOthers')}
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 pb-8 sm:gap-4 xl:grid-cols-3">
          {saved.previews.map((preview) => (
            <li key={preview.id} className="workspace-card overflow-hidden">
              <Link href={`/style/${id}/results/${preview.requestId}`} className="block">
                <img src={preview.url} alt={t('previewAlt')} className="aspect-[3/4] w-full object-cover" />
              </Link>
              <p className="p-3 text-[0.9rem] text-muted">{t('previewLabel')}</p>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
