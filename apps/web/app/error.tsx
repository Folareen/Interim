'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/button';
import { PageHeading } from '@/components/page-heading';

/** Shown when a screen cannot load, with a way to try again. */
export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-24">
      <PageHeading title={t('genericError')} />
      <div className="mt-8">
        <Button onClick={reset}>{t('tryAgain')}</Button>
      </div>
    </div>
  );
}
