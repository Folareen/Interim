import { copy } from '@interim/templates';
import { liveLocaleSchema, type LiveLocale } from '@interim/types';
import { cookies } from 'next/headers';
import { THEME_COOKIE } from './theme';

export const LOCALE_COOKIE = 'interim_locale';

/** The person's language from their cookie, or English before they have chosen. */
export async function getLocale(): Promise<LiveLocale> {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const parsed = liveLocaleSchema.safeParse(stored);
  return parsed.success ? parsed.data : 'en';
}

/** The theme the person picked, or undefined to follow their device. */
export async function getTheme(): Promise<'light' | 'dark' | undefined> {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  return stored === 'light' || stored === 'dark' ? stored : undefined;
}

/** The fixed copy for the person's language. */
export async function getCopy() {
  return copy[await getLocale()];
}
