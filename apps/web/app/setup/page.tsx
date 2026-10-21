import { templateKeySchema } from '@interim/types';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { SetupForm } from './setup-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('setup'))('title') };
}

export default async function Setup({ searchParams }: { searchParams: Promise<{ situation?: string }> }) {
  const situation = templateKeySchema.safeParse((await searchParams).situation);
  if (!situation.success) redirect('/situation');
  const [t, labels] = await Promise.all([getTranslations('setup'), getTranslations('templateLabels')]);
  return (
    <Shell step={3} backHref="/situation">
      <PageHeading title={t('title')} intro={t('intro')} />
      <p className="mt-6 rounded-xl bg-tint px-4 py-3 font-semibold">{labels(situation.data)}</p>
      <SetupForm situation={situation.data} />
    </Shell>
  );
}
