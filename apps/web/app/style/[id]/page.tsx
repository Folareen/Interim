import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getPreferences, getProfile, getStylePhotos } from '@/lib/server-api';
import { TodaysWords } from '../../ready/[id]/todays-words';
import { StyleWorkspace } from './style-workspace';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('style'))('title') };
}

export default async function Style({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile || profile.kind !== 'style') notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const [list, preferences, t, workspace, reflect] = await Promise.all([
    getStylePhotos(id),
    getPreferences(id),
    getTranslations('style'),
    getTranslations('workspace'),
    getTranslations('reflect'),
  ]);
  if (!list) notFound();
  return (
    <Shell profileId={id} kind="style" active="style" wide>
      <PageHeading title={t('title')} intro={t('intro')} />
      <StyleWorkspace
        profileId={id}
        initial={list.photos}
        after={
          <section aria-labelledby="style-quiet" className="space-y-4">
            <h2 id="style-quiet" className="text-[1.25rem]">
              {workspace('quietTitle')}
            </h2>
            <Link
              data-tone="peach"
              href={`/reflect/${id}`}
              className="workspace-card flex min-h-16 items-center justify-between gap-3 px-5 py-3 text-[0.95rem] font-semibold text-accent"
            >
              {reflect('readyAction')}
              <span aria-hidden="true">›</span>
            </Link>
            {preferences?.wordsSet && <TodaysWords profileId={id} />}
          </section>
        }
      />
    </Shell>
  );
}
