'use server';

import { liveLocaleSchema } from '@interim/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LOCALE_COOKIE } from '@/lib/prefs';

/** Remembers the language the person chose and moves on to the situation picker. */
export async function chooseLanguage(formData: FormData) {
  const chosen = liveLocaleSchema.safeParse(formData.get('locale'));
  if (!chosen.success) redirect('/language');
  (await cookies()).set(LOCALE_COOKIE, chosen.data, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  redirect('/situation');
}
