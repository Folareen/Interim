'use client';

import type { GarmentItem } from '@interim/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { ApiError, removeGarment, saveGarment } from '@/lib/api';
import { isGarmentKey } from '@/lib/labels';

/** The catalog, each piece with a button that saves or removes it. Saved pieces are shown on the person's photo at each check in. */
export function GarmentList({
  profileId,
  items,
  nextHref,
}: {
  profileId: string;
  items: GarmentItem[];
  nextHref?: string;
}) {
  const t = useTranslations('clothes');
  const workspace = useTranslations('workspace');
  const router = useRouter();
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
      setError(
        common(
          cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError',
        ),
      );
    } finally {
      setWorking(undefined);
    }
  }

  return (
    <div className="mt-8 flex flex-1 flex-col gap-5">
      {error && <Notice>{error}</Notice>}
      <p role="status" className="text-[0.95rem] text-muted">
        {workspace('selectedCount', { count: saved.size })}
      </p>
      <ul className="mb-6 grid grid-cols-2 items-stretch gap-3 sm:gap-4 xl:grid-cols-3">
        {items.map((item) => {
          if (!isGarmentKey(item.sku)) return null;
          const name = names(item.sku);
          const isSaved = saved.has(item.sku);
          return (
            <li
              key={item.sku}
              data-selected={isSaved}
              className="workspace-card flex min-w-0 flex-col overflow-hidden"
            >
              <img
                src={item.imageUrl}
                alt=""
                className="aspect-[4/3] w-full border-b border-border object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-3 sm:p-4">
                <div>
                  <p className="text-[0.95rem] font-semibold">{name}</p>
                </div>
                <Button
                  variant="secondary"
                  className="min-w-0 px-2! text-[0.9rem]!"
                  aria-pressed={isSaved}
                  onClick={() => void toggle(item.sku)}
                  disabled={working !== undefined}
                >
                  {t(isSaved ? 'removeAction' : 'saveAction', { item: name })}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {nextHref && (
        <Actions>
          <Button onClick={() => router.push(nextHref)} disabled={working !== undefined}>
            {workspace('continuePhotos')}
          </Button>
          <p className="text-[0.9rem] text-muted">{workspace('clothesOptional')}</p>
        </Actions>
      )}
    </div>
  );
}
