'use client';

import { useTranslations } from 'next-intl';
import { THEME_COOKIE } from '@/lib/theme';

const light = '#f1f5f6';
const dark = '#0d161b';

const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 24 24',
  className: 'size-6',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const buttonClass = '-mr-2 grid size-11 place-items-center rounded-lg text-muted transition-colors hover:text-text';

/**
 * Switches between the light and dark theme and remembers the choice in a cookie, so the server
 * can render the right theme from the first paint. Until it is used, the device's setting applies.
 * Two buttons sit here and CSS shows the one that switches to the other theme, so each carries a
 * label that names what it does without waiting for script to learn the current theme.
 */
export function ThemeToggle() {
  const t = useTranslations('common');

  function toggle() {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = (root.dataset.theme ?? (systemDark ? 'dark' : 'light')) === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', next === 'dark' ? dark : light);
      meta.removeAttribute('media');
    }
  }

  return (
    <>
      <span className="icon-to-dark">
        <button type="button" onClick={toggle} aria-label={t('themeToDark')} className={buttonClass}>
          <svg {...iconProps}>
            <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
          </svg>
        </button>
      </span>
      <span className="icon-to-light">
        <button type="button" onClick={toggle} aria-label={t('themeToLight')} className={buttonClass}>
          <svg {...iconProps}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
          </svg>
        </button>
      </span>
    </>
  );
}
