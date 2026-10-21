'use client';

import { useTranslations } from 'next-intl';
import { authErrorKey } from './auth-error';

/** Turns a failed call into the sentence to show, in the person's language. */
export function useAuthError(): (cause: unknown) => string {
  const t = useTranslations('auth');
  const common = useTranslations('common');
  return (cause) => {
    const key = authErrorKey(cause);
    if (key === 'network') return common('networkError');
    if (key === 'generic') return common('genericError');
    return t(key);
  };
}
