'use client';

import { type Preferences, type Tone, type WordsSet, wordsSetSchema } from '@interim/types';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { ApiError, savePreferences } from '@/lib/api';

const toneOrder: Tone[] = ['practical', 'warm', 'light'];
const wordsOrder = wordsSetSchema.options;

/** Lets the person change how Interim talks to them and whether it shows hair, after setup. */
export function SettingsForm({ profileId, preferences }: { profileId: string; preferences: Preferences }) {
  const t = useTranslations('settings');
  const setup = useTranslations('setup');
  const words = useTranslations('words');
  const common = useTranslations('common');
  const [tone, setTone] = useState<Tone>(preferences.tone);
  const [wordsSet, setWordsSet] = useState<WordsSet | null>(preferences.wordsSet);
  const [headCovering, setHeadCovering] = useState(preferences.headCovering);
  const [working, setWorking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();

  let status = '';
  if (working) status = t('saving');
  else if (saved) status = t('saved');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setSaved(false);
    setError(undefined);
    try {
      await savePreferences(profileId, { ...preferences, tone, wordsSet, headCovering });
      setSaved(true);
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
    }
    setWorking(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-9 pb-8">
        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.15rem] font-semibold">{setup('toneTitle')}</legend>
          {toneOrder.map((key) => (
            <ChoiceRow
              key={key}
              kind="radio"
              name="tone"
              value={key}
              label={setup(`tones.${key}.label`)}
              description={setup(`tones.${key}.description`)}
              checked={tone === key}
              onChange={() => setTone(key)}
            />
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.15rem] font-semibold">{setup('hairTitle')}</legend>
          <ChoiceRow
            kind="checkbox"
            name="headCovering"
            label={setup('headCoveringLabel')}
            description={setup('headCoveringHelp')}
            checked={headCovering}
            onChange={(event) => setHeadCovering(event.target.checked)}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-[1.15rem] font-semibold">{words('title')}</legend>
          <p className="mb-3 text-[0.95rem] text-muted">{words('help')}</p>
          <ChoiceRow kind="radio" name="wordsSet" value="" label={words('off.label')} description={words('off.description')} checked={wordsSet === null} onChange={() => setWordsSet(null)} />
          {wordsOrder.map((key) => (
            <ChoiceRow
              key={key}
              kind="radio"
              name="wordsSet"
              value={key}
              label={words(`sets.${key}.label`)}
              description={words(`sets.${key}.description`)}
              checked={wordsSet === key}
              onChange={() => setWordsSet(key)}
            />
          ))}
        </fieldset>

        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        <p role="status" className="text-[0.95rem] text-muted">
          {status}
        </p>
        <Button type="submit" disabled={working}>
          {working ? t('saving') : t('submit')}
        </Button>
      </Actions>
    </form>
  );
}
