import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getMe } from '@/lib/server-api';
import { situationGroups } from '@/lib/situations';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('situation'))('title') };
}

export default async function Situation() {
  if (!(await getMe())) redirect('/signup');
  const [t, labels] = await Promise.all([getTranslations('situation'), getTranslations('templateLabels')]);
  const groups = [
    { title: t('groupIllness'), keys: situationGroups.illness },
    { title: t('groupOther'), keys: situationGroups.other },
  ];
  return (
    <Shell step={1} backHref="/account">
      {/* A plain GET form: the choice travels in the address, so no state is kept between screens. */}
      <form action="/setup" method="get" className="flex flex-1 flex-col">
        <PageHeading title={t('title')} intro={t('intro')} />
        <div className="mt-8 space-y-8 pb-8">
          {groups.map((group) => (
            <fieldset key={group.title} className="space-y-3">
              <legend className="mb-3 font-semibold text-muted">{group.title}</legend>
              {group.keys.map((key) => (
                <ChoiceRow
                  key={key}
                  kind="radio"
                  name="situation"
                  value={key}
                  required
                  label={labels(key)}
                  description={t(`blurbs.${key}`)}
                />
              ))}
            </fieldset>
          ))}
        </div>
        <Actions>
          <Button type="submit">{t('submit')}</Button>
        </Actions>
      </form>
    </Shell>
  );
}
