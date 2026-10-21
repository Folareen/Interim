'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ApiError, deleteProfile } from '@/lib/api';

/** Deletes the profile after one more tap, because it cannot be undone. */
export function DeleteProfile({ profileId }: { profileId: string }) {
  const t = useTranslations('ready');
  const common = useTranslations('common');
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function remove() {
    setWorking(true);
    setError(undefined);
    try {
      await deleteProfile(profileId);
      router.push('/');
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
      setWorking(false);
    }
  }

  return (
    <section className="mt-auto border-t border-border pt-8 pb-10">
      <h2 className="text-[1.25rem]">{t('deleteTitle')}</h2>
      <p className="mt-2 text-[0.95rem] text-muted">{t('deleteBody')}</p>
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      <p role="status" className="sr-only">
        {working ? t('deleting') : ''}
      </p>
      <div className="mt-5 space-y-3">
        {confirming ? (
          <>
            <Button variant="danger" onClick={remove} disabled={working}>
              {working ? t('deleting') : t('deleteConfirm')}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={working}>
              {t('deleteCancel')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {t('deleteAction')}
          </Button>
        )}
      </div>
    </section>
  );
}
