'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ApiError, approveCard } from '@/lib/api';

/** Approves the card with one tap. Once approved it says when, and the button goes. */
export function ApproveCard({ cardId, approvedAt }: { cardId: string; approvedAt: string | null }) {
  const t = useTranslations('card');
  const common = useTranslations('common');
  const format = useFormatter();
  const [done, setDone] = useState(approvedAt);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  if (done) {
    return <p role="status">{t('approved', { date: format.dateTime(new Date(done), { dateStyle: 'medium' }) })}</p>;
  }
  async function approve() {
    setWorking(true);
    setError(undefined);
    try {
      await approveCard(cardId);
      setDone(new Date().toISOString());
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
      setWorking(false);
    }
  }
  return (
    <div className="space-y-3">
      {error && <Notice>{error}</Notice>}
      <p role="status" className="sr-only">
        {working ? t('approving') : ''}
      </p>
      <Button onClick={approve} disabled={working}>
        {working ? t('approving') : t('approveAction')}
      </Button>
    </div>
  );
}
