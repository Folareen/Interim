import { isDraftLocale } from '@interim/types';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LanguageLink } from './language-link';
import { ThemeToggle } from './theme-toggle';

/** How many steps the setup has, so the progress line can show where the person is. */
export const TOTAL_STEPS = 4;

/**
 * The frame every screen sits in: a single column that is comfortable on a phone, a header with a
 * way back and the theme switch, and an optional progress line for the setup steps.
 */
export async function Shell({ step, backHref, children }: { step?: number; backHref?: string; children: ReactNode }) {
  const [t, locale] = await Promise.all([getTranslations('common'), getLocale()]);
  const stepText = step === undefined ? '' : t('stepOf', { current: step, total: TOTAL_STEPS });
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-[env(safe-area-inset-top)] md:py-8">
      <header className="flex h-16 items-center justify-between">
        {backHref ? (
          <Link href={backHref} className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors hover:text-text">
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            {t('back')}
          </Link>
        ) : (
          <Link href="/" className="font-serif text-[1.35rem] font-medium tracking-tight">
            {t('appName')}
          </Link>
        )}
        <div className="flex items-center">
          <LanguageLink />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col">
        {isDraftLocale(locale) && (
          <p className="mb-6 border-l-2 border-outline pl-4 text-[0.9rem] text-muted">{t('draftNote')}</p>
        )}
        {step !== undefined && (
          <div className="pb-6">
            <p className="text-[0.9rem] text-muted">{stepText}</p>
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={TOTAL_STEPS}
              aria-valuenow={step}
              aria-label={stepText}
              className="mt-2 h-1 rounded-full bg-border"
            >
              <div className="h-1 rounded-full bg-accent" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
