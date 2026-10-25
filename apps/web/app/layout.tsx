import type { Metadata, Viewport } from 'next';
import { Newsreader, Source_Sans_3 } from 'next/font/google';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { getTheme } from '@/lib/prefs';
import './globals.css';

// Both families cover the extended Latin and Vietnamese letters that Yoruba, Igbo and Hausa need.
// next/font reads its options at build time, so they are written out rather than shared.
const sans = Source_Sans_3({ subsets: ['latin', 'latin-ext', 'vietnamese'], variable: '--font-source-sans', display: 'swap' });
const serif = Newsreader({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-newsreader',
  display: 'swap',
  axes: ['opsz'],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common');
  return { title: { default: t('appName'), template: `%s · ${t('appName')}` }, description: t('tagline') };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f1f5f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0d161b' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, theme, t, { common, setup, consent, ready, auth, account, settings, capture, photoProblems, run, trace, tools, card, reflect, clothes, garments, share }] =
    await Promise.all([
      getLocale(),
      getTheme(),
      getTranslations('common'),
      getMessages(),
    ]);
  return (
    <html lang={locale} data-theme={theme} className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only rounded-lg bg-accent px-4 py-3 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-10"
        >
          {t('skipToContent')}
        </a>
        {/* Only the screens with client islands get their text sent to the browser. */}
        <NextIntlClientProvider locale={locale} messages={{ common, setup, consent, ready, auth, account, settings, capture, photoProblems, run, trace, tools, card, reflect, clothes, garments, share }}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
