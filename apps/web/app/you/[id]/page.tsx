import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { secondaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getProfile } from '@/lib/server-api';
import { SignOut } from '../../account/account-actions';
import { DeleteProfile } from '../../ready/[id]/delete-profile';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('workspace'))('you') };
}

export default async function You({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getMe())) redirect('/signin');
  const profile = await getProfile(id);
  if (!profile) notFound();
  const [t, ready, settings, account, setup, consent] = await Promise.all([
    getTranslations('workspace'),
    getTranslations('ready'),
    getTranslations('settings'),
    getTranslations('account'),
    getTranslations('setup'),
    getTranslations('consent'),
  ]);
  return (
    <Shell profileId={id} active="you" wide>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <PageHeading title={t('you')} intro={t('youIntro')} />
        <div className="w-full sm:w-60 sm:shrink-0">
          <SignOut />
        </div>
      </div>
      <div className="mt-8 grid items-start gap-6 xl:grid-cols-2">
        <section className="workspace-card space-y-5 p-6">
          <h2 className="text-[1.5rem]">{settings('title')}</h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-[0.95rem] text-muted">{ready('toneLabel')}</dt>
              <dd>{setup(`tones.${profile.tone}.label`)}</dd>
            </div>
            <div>
              <dt className="text-[0.95rem] text-muted">{ready('photosLabel')}</dt>
              <dd>{consent(`retention.${profile.retention}.label`)}</dd>
            </div>
          </dl>
          <Link href={`/settings/${id}`} className={secondaryClass}>
            {ready('editAction')}
          </Link>
          <Link
            href={`/account?profile=${id}`}
            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4"
          >
            {account('title')}
          </Link>
        </section>
        <section className="workspace-card space-y-4 p-6">
          <h2 className="text-[1.5rem]">{t('dataTitle')}</h2>
          <p className="text-[0.95rem] text-muted">{ready('exportBody')}</p>
          <a href={`/api/profiles/${id}/export.zip`} download className={secondaryClass}>
            {ready('exportAction')}
          </a>
          <Link
            href={`/ledger/${id}`}
            className="inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4"
          >
            {ready('ledgerAction')}
          </Link>
          <div className="border-t border-border pt-2">
            <DeleteProfile profileId={id} />
          </div>
        </section>
      </div>
    </Shell>
  );
}
