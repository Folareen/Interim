import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { primaryClass, secondaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { StageDots } from '@/components/stage-dots';
import { getMe, getProfiles } from '@/lib/server-api';

export default async function Home() {
  // Someone signed in goes back to where they left off, so the welcome only greets people who are new or signed out.
  if (await getMe()) {
    const profiles = await getProfiles();
    const current = profiles.find((profile) => profile.consentCurrent) ?? profiles[0];
    if (!current) redirect('/situation');
    redirect(current.consentCurrent ? `/ready/${current.id}` : `/consent/${current.id}`);
  }
  const [t, demo, workspace] = await Promise.all([
    getTranslations('welcome'),
    getTranslations('demo'),
    getTranslations('workspace'),
  ]);
  return (
    <Shell wide>
      <div className="grid items-center gap-10 py-6 sm:py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-16">
        <div className="max-w-xl">
          <StageDots />
          <h1 className="mt-7 text-[2.5rem] leading-[1.08] sm:text-[3.25rem] xl:text-[3.75rem]">
            {t('title')}
          </h1>
          <p className="mt-6 text-[1.1rem] text-muted">{t('intro')}</p>
          <p className="mt-4 text-[0.95rem] text-muted">{t('reassurance')}</p>
          <div className="mt-8 grid max-w-sm gap-3">
            <Link href="/signup" className={primaryClass}>
              {t('start')}{' '}
              <span aria-hidden="true" className="ml-3">
                →
              </span>
            </Link>
            <Link href="/demo" className={secondaryClass}>
              {t('demoLink')}
            </Link>
          </div>
          <Link
            href="/signin"
            className="mt-4 inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-accent underline underline-offset-4"
          >
            {t('haveAccount')}
          </Link>
        </div>
        <div className="rounded-[2rem] bg-tint p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <p className="font-serif text-[1.4rem]">{workspace('aLookAtInterim')}</p>
            <span className="text-[0.9rem] text-muted">{demo('simulated')}</span>
          </div>
          <div className="grid grid-cols-2 items-start gap-4">
            <figure className="pt-7">
              <img
                src="/demo/look-before.jpg"
                alt={demo('simulated')}
                className="aspect-[3/4] w-full rounded-[4rem_4rem_0.875rem_0.875rem] object-cover"
              />
              <figcaption className="mt-3 text-[0.9rem] text-muted">
                {workspace('photoReference')}
              </figcaption>
            </figure>
            <figure>
              <img
                src="/demo/look-preview.jpg"
                alt={demo('simulated')}
                className="aspect-[3/4] w-full rounded-[0.875rem_0.875rem_4rem_4rem] object-cover"
              />
              <figcaption className="mt-3 text-[0.9rem] text-muted">
                {workspace('anotherMoment')}
              </figcaption>
            </figure>
          </div>
          <p className="mt-6 border-t border-outline pt-5 font-serif text-[1.35rem] leading-relaxed">
            {workspace('sidebarNote')}
          </p>
        </div>
      </div>
      <p className="max-w-2xl border-t border-border pt-6 text-[0.95rem] text-muted">
        {t('footnote')}
      </p>
    </Shell>
  );
}
