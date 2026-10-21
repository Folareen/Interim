import { messages } from '@interim/templates';
import { getRequestConfig } from 'next-intl/server';
import { getUserLocale } from '@/lib/prefs';

// The language lives in a cookie rather than the address, so every link and the single column of
// screens stay the same in every language.
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return { locale, messages: messages[locale] };
});
