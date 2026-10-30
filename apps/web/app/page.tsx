import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { primaryClass, secondaryClass } from '@/components/button';
import { LandingIllustration } from '@/components/landing-illustration';
import { Shell } from '@/components/shell';
import { getMe, getProfiles } from '@/lib/server-api';

const groups = [
  {
    key: 'care',
    label: 'groupIllness',
    situations: [
      'hair_loss_ahead',
      'hair_patches',
      'face_fullness',
      'after_surgery',
      'skin_colour',
    ],
  },
  {
    key: 'everyday',
    label: 'groupOther',
    situations: [
      'weight_change',
      'midlife_change',
      'after_a_baby',
      'going_grey',
      'textured_growth',
      'beard_growth',
    ],
  },
] as const;

export default async function Home() {
  if (await getMe()) {
    const profiles = await getProfiles();
    const current = profiles.find((profile) => profile.consentCurrent) ?? profiles[0];
    if (!current) redirect('/situation');
    redirect(current.consentCurrent ? `/ready/${current.id}` : `/consent/${current.id}`);
  }
  const [welcome, t, demo, workspace, situation, labels, common] = await Promise.all([
    getTranslations('welcome'),
    getTranslations('landing'),
    getTranslations('demo'),
    getTranslations('workspace'),
    getTranslations('situation'),
    getTranslations('templateLabels'),
    getTranslations('common'),
  ]);
  return (
    <Shell wide>
      <div className="landing">
        <section className="grid items-center gap-10 pt-5 pb-10 sm:gap-12 sm:pt-10 sm:pb-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-16">
          <div className="max-w-xl">
            <p className="landing-kicker">{t('eyebrow')}</p>
            <h1 className="mt-4 text-[2.65rem] leading-[1.04] sm:text-[3.5rem] xl:text-[4.2rem]">
              {welcome('title')}
            </h1>
            <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-muted">{t('intro')}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={`${primaryClass} sm:w-auto`}>
                {welcome('start')}
                <span aria-hidden="true" className="ml-3">
                  ↗
                </span>
              </Link>
              <Link href="/demo" className={`${secondaryClass} sm:w-auto`}>
                {welcome('demoLink')}
              </Link>
            </div>
            <Link
              href="/signin"
              className="mt-3 inline-flex min-h-11 items-center text-[0.9rem] font-medium text-accent underline underline-offset-4"
            >
              {welcome('haveAccount')}
            </Link>
          </div>
          <figure className="relative mx-auto w-full max-w-lg rounded-[2rem] bg-tint px-5 pt-6 pb-5 sm:px-7 sm:pt-8">
            <div className="grid grid-cols-[1fr_0.85fr] items-start gap-4">
              <figure>
                <img
                  src="/demo/look-before.jpg"
                  alt={demo('simulated')}
                  width={640}
                  height={853}
                  className="aspect-[3/4] w-full rounded-[5rem_5rem_1rem_1rem] object-cover"
                />
                <figcaption className="mt-3 text-[0.9rem] text-muted">
                  {workspace('photoReference')}
                </figcaption>
              </figure>
              <figure className="pt-14 sm:pt-20">
                <img
                  src="/demo/look-preview.jpg"
                  alt={demo('simulated')}
                  width={640}
                  height={853}
                  className="aspect-[3/4] w-full rounded-[1rem_1rem_4rem_4rem] object-cover"
                />
                <figcaption className="mt-3 text-[0.9rem] text-muted">
                  {workspace('anotherMoment')}
                </figcaption>
              </figure>
            </div>
            <figcaption className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-outline pt-4 text-[0.9rem] text-muted">
              <span>{demo('simulated')}</span>
              <Link
                href="/demo"
                className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent underline underline-offset-4"
              >
                {welcome('demoLink')}
                <span aria-hidden="true">↗</span>
              </Link>
            </figcaption>
          </figure>
        </section>

        <nav
          aria-label={t('onThisPage')}
          className="flex flex-wrap gap-x-6 border-y border-border py-2 text-[0.9rem] font-medium text-accent"
        >
          <a
            href="#situations"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {t('peopleLink')}
          </a>
          <a
            href="#how-it-works"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {t('howLink')}
          </a>
          <a
            href="#different"
            className="inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {t('differenceLink')}
          </a>
        </nav>

        <section className="landing-section grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
          <div className="max-w-2xl">
            <p className="landing-kicker">{t('problemLabel')}</p>
            <h2 className="mt-4 text-[2rem] leading-[1.12] sm:text-[2.75rem]">
              {t('problemTitle')}
            </h2>
            <p className="mt-5 max-w-xl text-muted">{t('problemBody')}</p>
          </div>
          <div className="rounded-[2rem] bg-surface p-5 sm:p-8">
            <LandingIllustration kind="record" />
            <p className="mt-4 max-w-sm font-serif text-[1.35rem] leading-snug">
              {t('problemNote')}
            </p>
          </div>
        </section>

        <section id="situations" className="landing-section border-t border-border">
          <div className="max-w-2xl">
            <p className="landing-kicker">{t('peopleLink')}</p>
            <h2 className="mt-4 text-[2rem] leading-[1.12] sm:text-[2.75rem]">
              {t('peopleTitle')}
            </h2>
            <p className="mt-4 text-muted">{t('peopleBody')}</p>
          </div>
          <div className="mt-9 grid gap-6 lg:grid-cols-2 lg:items-start">
            {groups.map(({ key, label, situations }) => (
              <article
                key={key}
                className={`overflow-hidden rounded-[1.5rem] border border-border ${key === 'care' ? 'bg-tint' : 'bg-surface lg:mt-16'}`}
              >
                <div className="mx-auto max-w-sm px-5 pt-5">
                  <LandingIllustration kind={key} />
                </div>
                <div className="px-5 pt-3 pb-6 sm:px-7 sm:pb-7">
                  <h3 className="max-w-sm text-[1.25rem] leading-snug">{situation(label)}</h3>
                  <p className="mt-3 text-[0.95rem] text-muted">{t(`${key}Body`)}</p>
                  <ul className="mt-5 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                    {situations.map((key) => (
                      <li
                        key={key}
                        className="border-b border-border py-2 text-[0.9rem] font-medium"
                      >
                        {labels(key)}
                      </li>
                    ))}
                  </ul>
                  <details className="mt-5 border-t border-border pt-3">
                    <summary className="min-h-11 cursor-pointer text-[0.9rem] font-semibold text-accent">
                      {t('exploreCases')}
                    </summary>
                    <dl className="mt-3 space-y-5">
                      {situations.map((key) => (
                        <div key={key}>
                          <dt className="text-[0.95rem] font-semibold">{labels(key)}</dt>
                          <dd className="mt-1 text-[0.95rem] text-muted">
                            {situation(`blurbs.${key}`)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="landing-section border-t border-border">
          <p className="landing-kicker">{t('howLink')}</p>
          <h2 className="mt-4 max-w-2xl text-[2rem] leading-[1.12] sm:text-[2.75rem]">
            {t('howTitle')}
          </h2>
          <ol className="mt-9 grid gap-7 lg:grid-cols-3 lg:gap-10">
            {(['choose', 'photos', 'return'] as const).map((key, index) => (
              <li key={key} className="border-t border-outline pt-5">
                <span
                  aria-hidden="true"
                  className="font-serif text-[2.5rem] leading-none text-accent"
                >
                  0{index + 1}
                </span>
                <h3 className="mt-5 text-[1.15rem]">{t(`${key}Title`)}</h3>
                <p className="mt-3 text-[0.95rem] text-muted">{t(`${key}Body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="different" className="landing-section border-t border-border">
          <div className="grid gap-9 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            <div className="max-w-xl">
              <p className="landing-kicker">{t('differenceLink')}</p>
              <h2 className="mt-4 text-[2rem] leading-[1.12] sm:text-[2.75rem]">
                {t('differentTitle')}
              </h2>
              <p className="mt-5 text-muted">{t('differentBody')}</p>
            </div>
            <dl className="divide-y divide-border rounded-[1.5rem] border border-border bg-surface px-5 sm:px-7">
              {(['timeline', 'grounded', 'relevant', 'limits'] as const).map((key) => (
                <div key={key} className="py-5">
                  <dt className="text-[1.05rem] font-semibold">{t(`${key}Title`)}</dt>
                  <dd className="mt-2 text-[0.95rem] text-muted">{t(`${key}Body`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="landing-section grid gap-7 border-t border-border lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <h2 className="text-[2rem] leading-[1.12] sm:text-[2.75rem]">{t('questionsTitle')}</h2>
          <div className="divide-y divide-border">
            {(['typing', 'privacy', 'medical'] as const).map((key) => (
              <details key={key} className="py-4">
                <summary className="min-h-11 cursor-pointer text-base font-semibold">
                  {t(`${key}Question`)}
                </summary>
                <p className="mt-3 max-w-xl text-[0.95rem] text-muted">
                  {key === 'medical' ? welcome('footnote') : t(`${key}Answer`)}
                </p>
                {key === 'privacy' && (
                  <Link
                    href="/privacy"
                    className="mt-2 inline-flex min-h-11 items-center text-[0.95rem] font-semibold text-accent underline underline-offset-4"
                  >
                    {common('privacy')}
                  </Link>
                )}
              </details>
            ))}
          </div>
        </section>

        <section className="mb-5 rounded-[2rem] bg-tint px-5 py-9 sm:px-10 sm:py-12 lg:flex lg:items-center lg:justify-between lg:gap-12">
          <div className="max-w-xl">
            <h2 className="text-[2rem] leading-[1.12] sm:text-[2.5rem]">{t('closingTitle')}</h2>
            <p className="mt-3 text-[0.95rem] text-muted">{t('closingBody')}</p>
          </div>
          <Link href="/signup" className={`${primaryClass} mt-6 sm:w-fit lg:mt-0 lg:shrink-0`}>
            {welcome('start')}
            <span aria-hidden="true" className="ml-3">
              ↗
            </span>
          </Link>
        </section>
        <p className="max-w-2xl py-5 text-[0.9rem] text-muted">{welcome('footnote')}</p>
      </div>
    </Shell>
  );
}
