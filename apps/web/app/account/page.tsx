import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { primaryClass } from '@/components/button';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe, getProfiles } from '@/lib/server-api';
import { ChangeEmail, DeleteAccount, RecoveryCodes, SignOut } from './account-actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('account'))('title') };
}

export default async function Account() {
  const me = await getMe();
  if (!me) redirect('/signin?next=/account');
  const [t, labels, profiles] = await Promise.all([getTranslations('account'), getTranslations('templateLabels'), getProfiles()]);
  return (
    <Shell>
      <PageHeading title={t('title')} />
      <dl className="mt-6 rounded-card border border-border bg-surface px-4 py-3">
        <dt className="text-[0.9rem] text-muted">{t('emailLabel')}</dt>
        <dd className="break-all font-semibold">{me.email}</dd>
      </dl>
      <ChangeEmail hasPassword={me.hasPassword} />

      <section className="mt-8">
        <h2 className="text-[1.25rem]">{t('profilesTitle')}</h2>
        {profiles.length === 0 ? (
          <p className="mt-3 text-muted">{t('noProfiles')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <Link
                  href={profile.consentCurrent ? `/ready/${profile.id}` : `/consent/${profile.id}`}
                  className="flex min-h-14 items-center justify-between gap-4 px-4 py-3"
                >
                  <span className="font-semibold">{labels(profile.templateKey)}</span>
                  <span className="text-accent">{t('open')}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Link href="/language" className={primaryClass}>
            {t('startNew')}
          </Link>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[1.25rem]">{t('passwordTitle')}</h2>
        <p className="mt-2 text-muted">{me.hasPassword ? t('passwordSet') : t('passwordNone')}</p>
        <p className="mt-3">
          <Link href="/forgot" className="font-semibold text-accent underline underline-offset-4">
            {t('passwordAction')}
          </Link>
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[1.25rem]">{t('recoveryTitle')}</h2>
        <p className="mt-2 text-muted">{t('recoveryBody')}</p>
        <p className="mt-2 font-semibold">{t('recoveryLeft', { count: me.recoveryCodes })}</p>
        <RecoveryCodes hasPassword={me.hasPassword} left={me.recoveryCodes} />
      </section>

      <div className="mt-8">
        <SignOut />
      </div>
      <DeleteAccount hasPassword={me.hasPassword} />
    </Shell>
  );
}
