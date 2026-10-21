'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A way to change language from any screen. It carries the current address, so the person lands
 * back where they were instead of at the start of the setup.
 */
export function LanguageLink() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const search = useSearchParams().toString();
  if (pathname === '/language') return null;
  const here = search ? `${pathname}?${search}` : pathname;
  return (
    <Link
      href={`/language?next=${encodeURIComponent(here)}`}
      aria-label={t('language')}
      className="grid size-11 place-items-center rounded-lg text-muted transition-colors hover:text-text"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
      </svg>
    </Link>
  );
}
