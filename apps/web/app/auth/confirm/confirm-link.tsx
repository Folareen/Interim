'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { confirmEmail, signInWithLink } from '@/lib/api';
import { useAuthError } from '@/lib/use-auth-error';

/**
 * Finishes an emailed link when the person taps the button. The link is not used on page load, because
 * mail scanners open links and would spend them before the person does.
 */
export function ConfirmLink({ kind, token }: { kind: 'verify' | 'magic'; token: string }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const describe = useAuthError();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function finish() {
    setWorking(true);
    setError(undefined);
    try {
      await (kind === 'verify' ? confirmEmail : signInWithLink)({ token });
      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(describe(cause));
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-8 space-y-6 pb-8">
        {error && <Notice>{error}</Notice>}
        {error && (
          <p>
            <Link href="/magic" className="font-semibold text-accent underline underline-offset-4">
              {t('askNewLink')}
            </Link>
          </p>
        )}
      </div>
      <Actions>
        <p role="status" className="sr-only">
          {working ? t('confirmWorking') : ''}
        </p>
        <Button onClick={finish} disabled={working}>
          {working ? t('confirmWorking') : t('confirmAction')}
        </Button>
      </Actions>
    </div>
  );
}
