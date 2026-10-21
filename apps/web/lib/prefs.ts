import { type LiveLocale } from '@interim/types';
import { cookies, headers } from 'next/headers';
import { isLiveLocale, negotiateLocale } from './locale';
import { THEME_COOKIE } from './theme';

export const LOCALE_COOKIE = 'interim_locale';

/**
 * The person's language: the one they chose, else the browser's, else English. Nothing is written
 * until they choose, so a first visit leaves no cookie behind.
 */
export async function getUserLocale(): Promise<LiveLocale> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLiveLocale(stored)) return stored;
  return negotiateLocale((await headers()).get('accept-language')) ?? 'en';
}

/** The theme the person picked, or undefined to follow their device. */
export async function getTheme(): Promise<'light' | 'dark' | undefined> {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  return stored === 'light' || stored === 'dark' ? stored : undefined;
}
