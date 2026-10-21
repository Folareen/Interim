import type { Metadata } from 'next';
import { Actions } from '@/components/actions';
import { Button } from '@/components/button';
import { ChoiceRow } from '@/components/choice-row';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getCopy } from '@/lib/prefs';
import { situationGroups } from '@/lib/situations';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getCopy()).ui.situation.title };
}

export default async function Situation() {
  const { ui, templateLabels } = await getCopy();
  const groups = [
    { title: ui.situation.groupIllness, keys: situationGroups.illness },
    { title: ui.situation.groupOther, keys: situationGroups.other },
  ];
  return (
    <Shell step={2} backHref="/language">
      {/* A plain GET form: the choice travels in the address, so no state is kept between screens. */}
      <form action="/setup" method="get" className="flex flex-1 flex-col">
        <PageHeading title={ui.situation.title} intro={ui.situation.intro} />
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
                  label={templateLabels[key]}
                  description={ui.situation.blurbs[key]}
                />
              ))}
            </fieldset>
          ))}
        </div>
        <Actions>
          <Button type="submit">{ui.situation.submit}</Button>
        </Actions>
      </form>
    </Shell>
  );
}
