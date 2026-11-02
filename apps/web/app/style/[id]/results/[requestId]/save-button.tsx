'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ApiError, setStylePreviewSaved } from '@/lib/api';

/** Saves a preview to the person's saved looks, or takes it off again. */
export function SaveButton({ previewId, initiallySaved }: { previewId: string; initiallySaved: boolean }) {
  const t = useTranslations('style');
  const common = useTranslations('common');
  const [saved, setSaved] = useState(initiallySaved);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    setWorking(true);
    setError(undefined);
    try {
      await setStylePreviewSaved(previewId, !saved);
      setSaved(!saved);
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" aria-pressed={saved} onClick={() => void toggle()} disabled={working}>
        {t(saved ? 'unsave' : 'save')}
      </Button>
      {error && <Notice>{error}</Notice>}
    </div>
  );
}
