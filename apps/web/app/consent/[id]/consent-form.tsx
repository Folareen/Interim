'use client';

import type { Retention } from '@interim/types';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { Notice } from '@/components/notice';
import { ApiError, grantConsent } from '@/lib/api';

const retentionOrder: Retention[] = ['standard', 'extended'];
const confirmations = {
  situation: ['store', 'youcam', 'google', 'own'],
  // Style previews send nothing to Google, so there is no statement to accept for it.
  style: ['store', 'youcam', 'own'],
} as const;
type Confirmation = (typeof confirmations)[keyof typeof confirmations][number];

/**
 * The consent screen: what is kept, who helps, how long photos stay, the four statements read
 * together, and one agreement to all of them. The button stays off until it is ticked. The API still
 * records each acceptance, because each processor is named in its own statement.
 */
export function ConsentForm({ profileId, version, kind }: { profileId: string; version: string; kind: 'situation' | 'style' }) {
  const t = useTranslations('consent');
  const common = useTranslations('common');
  const router = useRouter();
  const [retention, setRetention] = useState<Retention>('extended');
  const [agreed, setAgreed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  const isStyle = kind === 'style';
  const label: Record<Confirmation, string> = {
    store: t('confirmStore'),
    youcam: t(isStyle ? 'confirmYoucamStyle' : 'confirmYoucam'),
    google: t('confirmGoogle'),
    own: t(isStyle ? 'confirmOwnStyle' : 'confirmOwn'),
  };
  const complete = retention !== undefined && agreed;

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
        acceptGemini: isStyle ? undefined : true,
        acceptOwnPhotosOnly: true,
      });
      router.push(kind === 'style' ? `/style/${profileId}` : `/ready/${profileId}`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) setError(t('outdated'));
      else setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
      setWorking(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="mt-8 space-y-9 pb-8">
        <section>
          <h2 className="text-[1.25rem]">{t('keepTitle')}</h2>
          <p className="mt-2">{t(isStyle ? 'styleKeepBody' : 'keepBody')}</p>
        </section>

        <section>
          <h2 className="text-[1.25rem]">{t('helpersTitle')}</h2>
          <ul className="mt-3 space-y-3">
            <li className="border-l-2 border-accent pl-4">{t(isStyle ? 'helperYoucamStyle' : 'helperYoucam')}</li>
            <li className="border-l-2 border-accent pl-4">{t(isStyle ? 'helperGoogleStyle' : 'helperGoogle')}</li>
          </ul>
        </section>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.25rem] font-medium font-serif">{t('retentionTitle')}</legend>
          {retentionOrder.map((key) => (
            <ChoiceRow
              key={key}
              kind="radio"
              name="retention"
              value={key}
              label={t(`retention.${key}.label`)}
              description={isStyle ? t(`retentionStyle.${key}`) : t(`retention.${key}.description`)}
              checked={retention === key}
              onChange={() => setRetention(key)}
            />
          ))}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-3 text-[1.25rem] font-medium font-serif">{t('confirmTitle')}</legend>
          <ul className="space-y-3 rounded-card border border-border bg-surface p-4">
            {confirmations[kind].map((key) => (
              <li key={key} className="border-l-2 border-accent pl-4">
                {label[key]}
              </li>
            ))}
          </ul>
          <ChoiceRow kind="checkbox" name="agree" label={t('confirmAll')} checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        </fieldset>

        <p className="text-[0.95rem] text-muted">{t('deleteAnytime')}</p>

        {error && <Notice>{error}</Notice>}
      </div>
      <Actions>
        {!complete && (
          <p id="consent-incomplete" className="text-[0.9rem] text-muted">
            {t('incomplete')}
          </p>
        )}
        <p role="status" className="sr-only">
          {working ? t('submitting') : ''}
        </p>
        <Button type="submit" disabled={!complete || working} aria-describedby={complete ? undefined : 'consent-incomplete'}>
          {working ? t('submitting') : t('submit')}
        </Button>
      </Actions>
    </form>
  );
}
