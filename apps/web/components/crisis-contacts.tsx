'use client';

import { type CrisisRegion, crisisContacts, crisisRegionFor, crisisWording } from '@interim/rules';
import { liveLocaleSchema } from '@interim/types';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from './button';

const regions: CrisisRegion[] = ['us', 'ca', 'gb', 'ie', 'au', 'other'];
const regionCode: Record<Exclude<CrisisRegion, 'other'>, string> = { us: 'US', ca: 'CA', gb: 'GB', ie: 'IE', au: 'AU' };

/**
 * Crisis contacts for the person's region, which comes from the browser and can be changed here
 * (docs/product/spec.md section 13). Plain data from `packages/rules`, never model text.
 */
export function CrisisContacts({ onClose }: { onClose?: () => void }) {
  const t = useTranslations('reflect');
  const locale = liveLocaleSchema.parse(useLocale());
  const [region, setRegion] = useState<CrisisRegion>('other');

  // Read after mount, because the server cannot know the browser's region.
  useEffect(() => setRegion(crisisRegionFor(navigator.language)), []);

  const names = new Intl.DisplayNames([locale], { type: 'region' });
  const regionName = (key: CrisisRegion) => (key === 'other' ? t('regionOther') : (names.of(regionCode[key]) ?? regionCode[key]));

  return (
    <section aria-labelledby="contacts-title" className="rounded-card border border-accent bg-surface px-4 py-4">
      <h2 id="contacts-title" className="text-[1.25rem]">
        {t('contactsTitle')}
      </h2>
      <p className="mt-2 text-[0.95rem]">{t('contactsIntro')}</p>
      <ul className="mt-4 space-y-3">
        {crisisContacts[region].map((contact) => (
          <li key={contact.name} className="border-l-2 border-accent pl-4">
            <p className="font-semibold">{contact.name}</p>
            <p className="text-[0.95rem]">
              {contact.phone ? (
                <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="text-accent underline underline-offset-4">
                  {crisisWording[locale][contact.how].replace('{number}', contact.phone)}
                </a>
              ) : (
                crisisWording[locale][contact.how]
              )}
            </p>
            <a href={contact.url} target="_blank" rel="noopener noreferrer" className="text-[0.95rem] text-accent underline underline-offset-4">
              {contact.url.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </li>
        ))}
      </ul>
      <label className="mt-4 block text-[0.9rem] text-muted">
        {t('regionLabel')}
        <select
          value={region}
          onChange={(event) => setRegion(regions.find((key) => key === event.target.value) ?? 'other')}
          className="mt-1 block h-12 w-full rounded-xl border border-outline bg-surface px-3 text-base text-text"
        >
          {regions.map((key) => (
            <option key={key} value={key}>
              {regionName(key)}
            </option>
          ))}
        </select>
      </label>
      {onClose && (
        <div className="mt-4">
          <Button variant="secondary" onClick={onClose}>
            {t('contactsClose')}
          </Button>
        </div>
      )}
    </section>
  );
}
