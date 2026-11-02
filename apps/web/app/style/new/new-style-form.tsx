'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { ApiError, createProfile } from '@/lib/api';

/** Starts a style profile: only the adult confirmation, since there is nothing else to choose yet. */
export function NewStyleForm() {
  const setup = useTranslations('setup');
  const common = useTranslations('common');
  const router = useRouter();
  const [adult, setAdult] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  // A retry after a failed redirect must not start a second profile.
  const created = useRef<string | undefined>(undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      created.current ??= (await createProfile({ kind: 'style', ageConfirmed: true })).id;
      router.push(`/consent/${created.current}`);
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-5 pb-8">
        <ChoiceRow kind="checkbox" name="adult" label={setup('ageLabel')} description={setup('ageHelp')} checked={adult} onChange={(event) => setAdult(event.target.checked)} />
        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        <Button type="submit" disabled={!adult || working}>
          {common('continue')}
        </Button>
      </Actions>
    </form>
  );
}
