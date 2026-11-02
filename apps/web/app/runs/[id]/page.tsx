import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { getMe, getRun } from '@/lib/server-api';
import { RunProgress } from './run-progress';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('run'))('title') };
}

export default async function Run({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const run = await getRun(id);
  if (!run) notFound();
  if (run.cardId) redirect(`/cards/${run.cardId}`);
  if (run.styleRequestId && run.status === 'done')
    redirect(`/style/${run.profileId}/results/${run.styleRequestId}`);
  return (
    <Shell profileId={run.profileId} kind={run.styleRequestId ? 'style' : 'situation'} active={run.styleRequestId ? 'style' : 'today'}>
      <RunProgress initial={run} />
    </Shell>
  );
}
