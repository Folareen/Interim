'use client';

import type { Retention } from '@interim/types';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { ApiError, grantConsent } from '@/lib/api';

type Text = {
  keepTitle: string;
  keepBody: string;
  helpersTitle: string;
  helperYoucam: string;
  helperGoogle: string;
  retentionTitle: string;
  retention: Record<Retention, { label: string; description: string }>;
  confirmTitle: string;
  confirmStore: string;
  confirmYoucam: string;
  confirmGoogle: string;
  confirmOwn: string;
  noRecovery: string;
  deleteAnytime: string;
  incomplete: string;
  submit: string;
  submitting: string;
  outdated: string;
};

const retentionOrder: Retention[] = ['standard', 'extended'];
const confirmations = ['store', 'youcam', 'google', 'own'] as const;
type Confirmation = (typeof confirmations)[number];

/**
 * The consent screen: what is kept, who helps, how long photos stay, and four separate
 * confirmations. Nothing is preselected, and the button stays off until every choice is made.
 */
export function ConsentForm({
  profileId,
  version,
  text,
  errors,
}: {
  profileId: string;
  version: string;
  text: Text;
  errors: { network: string; generic: string };
}) {
  const router = useRouter();
  const [retention, setRetention] = useState<Retention>();
  const [confirmed, setConfirmed] = useState<Record<Confirmation, boolean>>({ store: false, youcam: false, google: false, own: false });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  const label: Record<Confirmation, string> = {
    store: text.confirmStore,
    youcam: text.confirmYoucam,
    google: text.confirmGoogle,
    own: text.confirmOwn,
  };
  const complete = retention !== undefined && confirmations.every((key) => confirmed[key]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!retention) return;
    setWorking(true);
    setError(undefined);
    try {
      await grantConsent(profileId, {
        action: 'grant',
        version,
        retention,
        acceptStorage: true,
        acceptYoucam: true,
        acceptGemini: true,
        acceptOwnPhotosOnly: true,
      });
      router.push(`/ready/${profileId}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setError(text.outdated);
      else setError(cause instanceof ApiError && cause.status === 'network' ? errors.network : errors.generic);
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-9 pb-8">
        <section>
          <h2 className="text-[1.25rem]">{text.keepTitle}</h2>
          <p className="mt-2">{text.keepBody}</p>
        </section>

        <section>
          <h2 className="text-[1.25rem]">{text.helpersTitle}</h2>
          <ul className="mt-3 space-y-3">
            <li className="border-l-2 border-accent pl-4">{text.helperYoucam}</li>
            <li className="border-l-2 border-accent pl-4">{text.helperGoogle}</li>
          </ul>
        </section>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.25rem] font-medium font-serif">{text.retentionTitle}</legend>
          {retentionOrder.map((key) => (
            <ChoiceRow
              key={key}
              kind="radio"
              name="retention"
              value={key}
              label={text.retention[key].label}
              description={text.retention[key].description}
              checked={retention === key}
              onChange={() => setRetention(key)}
            />
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.25rem] font-medium font-serif">{text.confirmTitle}</legend>
          {confirmations.map((key) => (
            <ChoiceRow
              key={key}
              kind="checkbox"
              name={key}
              label={label[key]}
              checked={confirmed[key]}
              onChange={(event) => setConfirmed((current) => ({ ...current, [key]: event.target.checked }))}
            />
          ))}
        </fieldset>

        <div className="space-y-3 text-[0.95rem] text-muted">
          <p>{text.noRecovery}</p>
          <p>{text.deleteAnytime}</p>
        </div>

        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        {!complete && <p className="text-[0.9rem] text-muted">{text.incomplete}</p>}
        <Button type="submit" disabled={!complete || working}>
          {working ? text.submitting : text.submit}
        </Button>
      </Actions>
    </form>
  );
}
