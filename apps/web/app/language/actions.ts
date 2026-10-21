'use server';

import { liveLocaleSchema } from '@interim/types';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeNext } from '@/lib/locale';
import { LOCALE_COOKIE } from '@/lib/prefs';

/** Remembers the language the person chose, then returns them to where they were. */
export async function chooseLanguage(formData: FormData) {
  const chosen = liveLocaleSchema.safeParse(formData.get('locale'));
  if (!chosen.success) redirect('/language');
  (await cookies()).set(LOCALE_COOKIE, chosen.data, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  redirect(safeNext(formData.get('next'), '/'));
}
