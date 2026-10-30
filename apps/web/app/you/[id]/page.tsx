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
      <div className="flex items-start justify-between gap-4">
        <PageHeading title={t('you')} />
        <SignOut compact />
      </div>
      <div className="mt-6 grid items-start gap-5 xl:grid-cols-2">
        <section className="workspace-card overflow-hidden">
          <h2 className="px-5 pt-5 text-[1.1rem]">{settings('title')}</h2>
          <dl className="px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-4">
              <dt className="text-[0.95rem] text-muted">{ready('toneLabel')}</dt>
              <dd className="text-[0.95rem] font-medium">{setup(`tones.${profile.tone}.label`)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-4">
              <dt className="text-[0.95rem] text-muted">{ready('photosLabel')}</dt>
              <dd className="text-[0.95rem] font-medium">
                {consent(`retention.${profile.retention}.label`)}
              </dd>
            </div>
          </dl>
          <Link
            href={`/settings/${id}`}
            className="flex min-h-14 items-center justify-between gap-4 px-5 py-3 text-[0.95rem] font-semibold text-accent hover:bg-tint"
          >
            {ready('editAction')}
            <span aria-hidden="true">›</span>
          </Link>
          <Link
            href={`/account?profile=${id}`}
            className="flex min-h-14 items-center justify-between gap-4 px-5 py-3 text-[0.95rem] font-semibold text-accent hover:bg-tint"
          >
            {account('title')}
            <span aria-hidden="true">›</span>
          </Link>
        </section>
        <details className="workspace-card p-5">
          <summary className="min-h-11 cursor-pointer">{t('dataTitle')}</summary>
          <div className="space-y-4 pt-4">
            <p className="text-[0.95rem] text-muted">{ready('exportBody')}</p>
            <a href={`/api/profiles/${id}/export.zip`} download className={secondaryClass}>
              {ready('exportAction')}
            </a>
            <Link
              href={`/ledger/${id}`}
              className="inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-accent underline underline-offset-4"
            >
              {ready('ledgerAction')}
            </Link>
            <div className="border-t border-border pt-4">
              <DeleteProfile profileId={id} />
            </div>
          </div>
        </details>
      </div>
    </Shell>
  );
}
