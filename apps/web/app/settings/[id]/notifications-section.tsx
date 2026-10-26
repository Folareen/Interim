'use client';

import { type NotificationSettings, pushSubscriptionSchema } from '@interim/types';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { ChoiceRow } from '@/components/choice-row';
import { Field } from '@/components/field';
import { Notice } from '@/components/notice';
import { ApiError, getNotifications, getPushKey, saveNotifications } from '@/lib/api';
import { type PushSupport, currentSubscription, deviceTimeZone, permissionBlocked, pushSupport, subscribe } from '@/lib/push';

const DEFAULT_TIME = '08:00';
const off: NotificationSettings = { wordsAt: null, checkIn: false, showPassage: false };

/**
 * Switches for the two notification kinds on this device. Each change is saved at once, because
 * turning a notification on has to happen in the same tap that asks the browser for permission.
 */
export function NotificationsSection({ profileId, hasWordsSet }: { profileId: string; hasWordsSet: boolean }) {
  const t = useTranslations('notifications');
  const common = useTranslations('common');
  const [support, setSupport] = useState<PushSupport>();
  const [publicKey, setPublicKey] = useState<string | null>();
  const [settings, setSettings] = useState<NotificationSettings>(off);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const saving = useRef(false);

  useEffect(() => {
    const found = pushSupport();
    setSupport(found);
    if (found !== 'ok') return;
    (async () => {
      try {
        const { publicKey: key } = await getPushKey();
        setPublicKey(key);
        const subscription = await currentSubscription();
        if (!key || !subscription) return;
        const saved = await getNotifications(profileId, subscription.endpoint);
        setSettings(saved);
        if (saved.wordsAt) setTime(saved.wordsAt);
      } catch {
        // The switches stay off; turning one on shows the error if the problem persists.
      }
    })();
  }, [profileId]);

  async function apply(next: NotificationSettings) {
    if (!publicKey || saving.current) return;
    saving.current = true;
    setWorking(true);
    setError(undefined);
    try {
      const anyOn = next.wordsAt !== null || next.checkIn;
      const subscription = anyOn ? await subscribe(publicKey) : await currentSubscription();
      if (!subscription) {
        setError(permissionBlocked() ? t('blocked') : common('genericError'));
        return;
      }
      const saved = await saveNotifications(profileId, { ...next, subscription: pushSubscriptionSchema.parse(subscription.toJSON()), timeZone: deviceTimeZone() });
      setSettings(saved);
      // With nothing left on, the browser forgets the device too, so the push service stops holding it.
      if (!anyOn) await subscription.unsubscribe();
    } catch (cause) {
      setError(common(cause instanceof ApiError && cause.status === 'network' ? 'networkError' : 'genericError'));
    } finally {
      saving.current = false;
      setWorking(false);
    }
  }

  if (!support) return null;

  let body;
  if (support === 'install') body = <p className="text-[0.95rem]">{t('iosInstall')}</p>;
  else if (support === 'unsupported') body = <p className="text-[0.95rem]">{t('unsupported')}</p>;
  else if (publicKey === null) body = <p className="text-[0.95rem]">{t('notSetUp')}</p>;
  else {
    const wordsOn = settings.wordsAt !== null;
    body = (
      <div className="space-y-3">
        <ChoiceRow
          kind="checkbox"
          name="notifyWords"
          label={t('words.label')}
          description={hasWordsSet ? t('words.description') : t('needWords')}
          checked={wordsOn}
          disabled={working || !hasWordsSet}
          onChange={(event) => apply({ ...settings, wordsAt: event.target.checked ? time : null, showPassage: event.target.checked && settings.showPassage })}
        />
        {wordsOn && (
          <>
            <Field
              type="time"
              label={t('words.time')}
              value={time}
              disabled={working}
              onChange={(event) => setTime(event.target.value)}
              // Saved when the person leaves the field, not on each digit typed.
              onBlur={() => time && time !== settings.wordsAt && apply({ ...settings, wordsAt: time })}
            />
            <ChoiceRow
              kind="checkbox"
              name="notifyPassage"
              label={t('showPassage.label')}
              description={t('showPassage.description')}
              checked={settings.showPassage}
              disabled={working}
              onChange={(event) => apply({ ...settings, showPassage: event.target.checked })}
            />
          </>
        )}
        <ChoiceRow
          kind="checkbox"
          name="notifyCheckIn"
          label={t('checkIn.label')}
          description={t('checkIn.description')}
          checked={settings.checkIn}
          disabled={working}
          onChange={(event) => apply({ ...settings, checkIn: event.target.checked })}
        />
        {error && <Notice>{error}</Notice>}
      </div>
    );
  }

  return (
    <section aria-labelledby="notifications-title" className="mt-8">
      <h2 id="notifications-title" className="text-[1.15rem] font-semibold">
        {t('title')}
      </h2>
      <p className="mb-3 mt-1 text-[0.95rem] text-muted">{t('intro')}</p>
      {body}
    </section>
  );
}
