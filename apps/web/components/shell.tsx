import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getMe } from '@/lib/server-api';
import { LanguageLink } from './language-link';
import { ProfileSwitcher } from './profile-switcher';
import { ThemeToggle } from './theme-toggle';
import { WorkspaceNav, type WorkspaceSection } from './workspace-nav';

/** How many steps the setup has, so the progress line can show where the person is. */
export const TOTAL_STEPS = 3;

/** A responsive workspace, with focused forms and persistent task navigation when a profile is open. */
export async function Shell({
  step,
  backHref,
  children,
  profileId,
  active = 'today',
  wide = false,
}: {
  step?: number;
  backHref?: string;
  children: ReactNode;
  profileId?: string;
  active?: WorkspaceSection;
  wide?: boolean;
}) {
  const [t, me] = await Promise.all([getTranslations('common'), getMe()]);
  const navigation = me && profileId !== undefined;
  const stepText = step === undefined ? '' : t('stepOf', { current: step, total: TOTAL_STEPS });
  return (
    <div className={navigation ? 'workspace' : ''}>
      <div className="mx-auto flex min-h-dvh w-full max-w-[76rem] flex-col px-5 pt-[env(safe-area-inset-top)] sm:px-8 lg:px-10">
        <header
          className={`flex items-center justify-between gap-3 ${navigation ? 'min-h-16 py-2' : 'min-h-20 py-3'}`}
        >
          <Link href="/" className="shrink-0 font-serif text-[1.5rem] font-medium tracking-tight">
            {t('appName')}
            <span aria-hidden="true" className="ml-1 text-accent">
              .
            </span>
          </Link>
          {!me && (
            <p className="hidden max-w-sm text-[0.9rem] text-muted md:block">{t('tagline')}</p>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <LanguageLink />
            <ThemeToggle />
            {!navigation && (
              <Link
                href={me ? '/account' : '/signin'}
                className="hidden min-h-11 items-center rounded-lg px-2 text-[0.95rem] font-semibold text-accent sm:inline-flex"
              >
                {me ? t('account') : t('signIn')}
              </Link>
            )}
          </div>
        </header>
        <div
          className={
            navigation
              ? 'grid flex-1 gap-10 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10'
              : 'flex flex-1 flex-col'
          }
        >
          {navigation && (
            <aside className="hidden pr-5 pt-7 lg:block">
              <div className="sticky top-7">
                <WorkspaceNav profileId={profileId} active={active} />
              </div>
            </aside>
          )}
          <div
            className={`flex min-w-0 flex-1 flex-col ${wide ? 'w-full' : 'mx-auto w-full max-w-xl'}`}
          >
            <main
              id="main"
              tabIndex={-1}
              className="flex min-w-0 flex-1 flex-col pt-4 outline-none sm:pt-6 lg:pt-7"
            >
              {backHref && (
                <Link
                  href={backHref}
                  className="mb-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-lg pr-3 text-[0.95rem] text-muted hover:text-text"
                >
                  <span aria-hidden="true">←</span>
                  {t('back')}
                </Link>
              )}
              {navigation && (
                <div className="mb-4">
                  <ProfileSwitcher profileId={profileId} />
                </div>
              )}
              {step !== undefined && (
                <div className="pb-7">
                  <p className="text-[0.9rem] text-muted">{stepText}</p>
                  <div
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={TOTAL_STEPS}
                    aria-valuenow={step}
                    aria-label={stepText}
                    className="mt-3 h-1 rounded-full bg-border"
                  >
                    <div
                      className="h-1 rounded-full bg-accent"
                      style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                    />
                  </div>
                </div>
              )}
              {children}
            </main>
            <footer className="mt-8 py-5">
              <nav
                aria-label={t('information')}
                className="flex flex-wrap gap-x-6 text-[0.9rem] text-muted"
              >
                <Link href="/privacy" className="inline-flex min-h-11 items-center hover:underline">
                  {t('privacy')}
                </Link>
                <Link href="/terms" className="inline-flex min-h-11 items-center hover:underline">
                  {t('serviceTerms')}
                </Link>
              </nav>
            </footer>
          </div>
        </div>
      </div>
      {navigation && (
        <div className="mobile-navigation fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg rounded-[1.5rem] bg-surface p-1 lg:hidden">
          <div className="mx-auto max-w-lg">
            <WorkspaceNav profileId={profileId} active={active} mobile />
          </div>
        </div>
      )}
    </div>
  );
}
