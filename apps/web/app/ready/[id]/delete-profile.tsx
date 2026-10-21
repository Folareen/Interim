'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ApiError, deleteProfile } from '@/lib/api';

type Text = {
  deleteTitle: string;
  deleteBody: string;
  deleteAction: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleting: string;
};

/** Deletes the profile after one more tap, because it cannot be undone. */
export function DeleteProfile({
  profileId,
  text,
  errors,
}: {
  profileId: string;
  text: Text;
  errors: { network: string; generic: string };
}) {
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
      setError(cause instanceof ApiError && cause.status === 'network' ? errors.network : errors.generic);
      setWorking(false);
    }
  }

  return (
    <section className="mt-auto border-t border-border pt-8 pb-10">
      <h2 className="text-[1.25rem]">{text.deleteTitle}</h2>
      <p className="mt-2 text-[0.95rem] text-muted">{text.deleteBody}</p>
      {error && (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      )}
      <div className="mt-5 space-y-3">
        {confirming ? (
          <>
            <Button variant="danger" onClick={remove} disabled={working}>
              {working ? text.deleting : text.deleteConfirm}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={working}>
              {text.deleteCancel}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {text.deleteAction}
          </Button>
        )}
      </div>
    </section>
  );
}
