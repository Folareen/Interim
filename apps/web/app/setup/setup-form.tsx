'use client';

import type { TemplateKey, Tone } from '@interim/types';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { ApiError, createProfile, getPreferences, savePreferences } from '@/lib/api';

const toneOrder: Tone[] = ['practical', 'warm', 'light'];

/** Asks how Interim should talk and whether to show hair, then starts the profile. */
export function SetupForm({ situation }: { situation: TemplateKey }) {
  const t = useTranslations('setup');
  const common = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [tone, setTone] = useState<Tone>('warm');
  const [headCovering, setHeadCovering] = useState(false);
  const [adult, setAdult] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  // If saving the settings fails after the profile exists, a retry must not start a second one.
  const created = useRef<string | undefined>(undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      created.current ??= (await createProfile({ templateKey: situation, ageConfirmed: true })).id;
      const current = await getPreferences(created.current);
      await savePreferences(created.current, { ...current, locale, tone, headCovering });
      router.push(`/consent/${created.current}`);
    } catch (cause) {
      setError(
        common(
          cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError',
        ),
      );
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-9 pb-8">
        <details className="rounded-card border border-border bg-surface p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">{t('toneTitle')}</summary>
          <fieldset className="mt-3 space-y-3">
            <legend className="sr-only">{t('toneTitle')}</legend>
            {toneOrder.map((key) => (
              <ChoiceRow
                key={key}
                kind="radio"
                name="tone"
                value={key}
                label={t(`tones.${key}.label`)}
                description={t(`tones.${key}.description`)}
                checked={tone === key}
                onChange={() => setTone(key)}
              />
            ))}
          </fieldset>
        </details>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.15rem] font-semibold">{t('hairTitle')}</legend>
          <ChoiceRow
            kind="checkbox"
            name="headCovering"
            label={t('headCoveringLabel')}
            description={t('headCoveringHelp')}
            checked={headCovering}
            onChange={(event) => setHeadCovering(event.target.checked)}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.15rem] font-semibold">{t('ageTitle')}</legend>
          <ChoiceRow
            kind="checkbox"
            name="adult"
            required
            label={t('ageLabel')}
            description={t('ageHelp')}
            checked={adult}
            onChange={(event) => setAdult(event.target.checked)}
          />
        </fieldset>

        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        {/* Read out when the button turns to "working", since nothing else on the screen changes. */}
        <p role="status" className="sr-only">
          {working ? t('submitting') : ''}
        </p>
        <Button type="submit" disabled={!adult || working}>
          {working ? t('submitting') : t('submit')}
        </Button>
      </Actions>
    </form>
  );
}
