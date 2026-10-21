'use client';

import type { LiveLocale, TemplateKey, Tone } from '@interim/types';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { ApiError, createProfile, getPreferences, savePreferences } from '@/lib/api';

type Text = {
  toneTitle: string;
  tones: Record<Tone, { label: string; description: string }>;
  hairTitle: string;
  headCoveringLabel: string;
  headCoveringHelp: string;
  ageTitle: string;
  ageLabel: string;
  ageHelp: string;
  submit: string;
  submitting: string;
};

const toneOrder: Tone[] = ['practical', 'warm', 'light'];

/** Asks how Interim should talk and whether to show hair, then starts the profile. */
export function SetupForm({
  situation,
  locale,
  text,
  errors,
}: {
  situation: TemplateKey;
  locale: LiveLocale;
  text: Text;
  errors: { network: string; generic: string };
}) {
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
      setError(cause instanceof ApiError && cause.status === 'network' ? errors.network : errors.generic);
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-9 pb-8">
        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.15rem] font-semibold">{text.toneTitle}</legend>
          {toneOrder.map((key) => (
            <ChoiceRow
              key={key}
              kind="radio"
              name="tone"
              value={key}
              label={text.tones[key].label}
              description={text.tones[key].description}
              checked={tone === key}
              onChange={() => setTone(key)}
            />
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.15rem] font-semibold">{text.hairTitle}</legend>
          <ChoiceRow
            kind="checkbox"
            name="headCovering"
            label={text.headCoveringLabel}
            description={text.headCoveringHelp}
            checked={headCovering}
            onChange={(event) => setHeadCovering(event.target.checked)}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.15rem] font-semibold">{text.ageTitle}</legend>
          <ChoiceRow
            kind="checkbox"
            name="adult"
            label={text.ageLabel}
            description={text.ageHelp}
            checked={adult}
            onChange={(event) => setAdult(event.target.checked)}
          />
        </fieldset>

        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        <Button type="submit" disabled={!adult || working}>
          {working ? text.submitting : text.submit}
        </Button>
      </Actions>
    </form>
  );
}
