import { localeNames } from '@interim/templates';
import { liveLocales } from '@interim/types';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { safeNext } from '@/lib/locale';
import { chooseLanguage } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('language'))('title') };
}

export default async function Language({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [t, current, { next }] = await Promise.all([getTranslations('language'), getLocale(), searchParams]);
  // The person goes back to where they were.
  const returnTo = next === undefined ? undefined : safeNext(next, '/');
  return (
    <Shell backHref={returnTo ?? '/'}>
      <form action={chooseLanguage} className="flex flex-1 flex-col">
        {returnTo && <input type="hidden" name="next" value={returnTo} />}
        <PageHeading title={t('title')} intro={t('intro')} />
        <fieldset className="mt-8 space-y-3">
          <legend className="sr-only">{t('title')}</legend>
          {liveLocales.map((code) => (
            <ChoiceRow
              key={code}
              kind="radio"
              name="locale"
              value={code}
              label={localeNames[code]}
              labelLang={code}
              defaultChecked={code === current}
            />
          ))}
        </fieldset>
        <Actions>
          <Button type="submit">{t('submit')}</Button>
        </Actions>
      </form>
    </Shell>
  );
}
