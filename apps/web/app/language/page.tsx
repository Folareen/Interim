import { liveLocales } from '@interim/types';
import { localeNames } from '@interim/templates';
import type { Metadata } from 'next';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getCopy, getLocale } from '@/lib/prefs';
import { chooseLanguage } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getCopy()).ui.language.title };
}

export default async function Language() {
  const [{ ui }, current] = await Promise.all([getCopy(), getLocale()]);
  return (
    <Shell step={1} backHref="/">
      <form action={chooseLanguage} className="flex flex-1 flex-col">
        <PageHeading title={ui.language.title} intro={ui.language.intro} />
        <fieldset className="mt-8 space-y-3">
          <legend className="sr-only">{ui.language.title}</legend>
          {liveLocales.map((code) => (
            <ChoiceRow key={code} kind="radio" name="locale" value={code} label={localeNames[code]} lang={code} defaultChecked={code === current} />
          ))}
        </fieldset>
        <p className="mt-6 pb-8 text-[0.95rem] text-muted">{ui.language.moreComing}</p>
        <Actions>
          <Button type="submit">{ui.language.submit}</Button>
        </Actions>
      </form>
    </Shell>
  );
}
