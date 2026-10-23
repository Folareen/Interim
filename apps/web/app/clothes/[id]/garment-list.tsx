'use client';

import type { GarmentItem } from '@interim/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ApiError, removeGarment, saveGarment } from '@/lib/api';
import { isGarmentKey } from '@/lib/labels';

/** The catalog, each piece with a button that saves or removes it. Saved pieces are shown on the person's photo at each check in. */
export function GarmentList({ profileId, items }: { profileId: string; items: GarmentItem[] }) {
  const t = useTranslations('clothes');
  const names = useTranslations('garments');
  const common = useTranslations('common');
  const [saved, setSaved] = useState(new Set(items.filter((i) => i.saved).map((i) => i.sku)));
  const [working, setWorking] = useState<string>();
  const [error, setError] = useState<string>();

  async function toggle(sku: string) {
    const wasSaved = saved.has(sku);
    setWorking(sku);
    setError(undefined);
    try {
      await (wasSaved ? removeGarment(profileId, sku) : saveGarment(profileId, sku));
      setSaved((current) => {
        const next = new Set(current);
        if (wasSaved) next.delete(sku);
        else next.add(sku);
        return next;
      });
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
    } finally {
      setWorking(undefined);
    }
  }

  return (
    <div className="mt-8 mb-12 space-y-4">
      {error && <Notice>{error}</Notice>}
      <ul className="space-y-4">
        {items.map((item) => {
          if (!isGarmentKey(item.sku)) return null;
          const name = names(item.sku);
          const isSaved = saved.has(item.sku);
          return (
            <li key={item.sku} className="flex gap-4 rounded-card border border-border bg-surface p-4">
              <img src={item.imageUrl} alt="" className="h-28 w-20 shrink-0 rounded-lg border border-border object-cover" />
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                <div>
                  <p className="font-semibold">{name}</p>
                  {isSaved && <p className="text-[0.9rem] text-muted">{t('saved')}</p>}
                </div>
                <Button variant={isSaved ? 'secondary' : 'primary'} onClick={() => void toggle(item.sku)} disabled={working === item.sku}>
                  {t(isSaved ? 'removeAction' : 'saveAction', { item: name })}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
