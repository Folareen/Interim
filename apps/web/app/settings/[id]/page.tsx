import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getPreferences, getProfile } from '@/lib/server-api';
import { NotificationsSection } from './notifications-section';
import { SettingsForm } from './settings-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('settings'))('title') };
}

export default async function Settings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const [preferences, profile] = await Promise.all([getPreferences(id), getProfile(id)]);
  if (!preferences || !profile) notFound();
  const t = await getTranslations('settings');
  return (
    <Shell profileId={id} kind={profile.kind} active="you" backHref={`/you/${id}`}>
      <PageHeading title={t('title')} />
      <NotificationsSection profileId={id} hasWordsSet={preferences.wordsSet !== null} />
      <SettingsForm profileId={id} preferences={preferences} />
    </Shell>
  );
}
