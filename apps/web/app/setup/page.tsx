import { templateKeySchema } from '@interim/types';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getCopy, getLocale } from '@/lib/prefs';
import { SetupForm } from './setup-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getCopy()).ui.setup.title };
}

export default async function Setup({ searchParams }: { searchParams: Promise<{ situation?: string }> }) {
  const situation = templateKeySchema.safeParse((await searchParams).situation);
  if (!situation.success) redirect('/situation');
  const [{ ui, templateLabels }, locale] = await Promise.all([getCopy(), getLocale()]);
  return (
    <Shell step={3} backHref="/situation">
      <PageHeading title={ui.setup.title} intro={ui.setup.intro} />
      <p className="mt-6 rounded-xl bg-tint px-4 py-3 font-semibold">{templateLabels[situation.data]}</p>
      <SetupForm
        situation={situation.data}
        locale={locale}
        text={ui.setup}
        errors={{ network: ui.common.networkError, generic: ui.common.genericError }}
      />
    </Shell>
  );
}
