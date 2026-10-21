import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { getCopy } from '@/lib/prefs';
import { getProfile } from '@/lib/server-api';
import { DeleteProfile } from './delete-profile';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getCopy()).ui.ready.title };
}

export default async function Ready({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile(id);
  if (!profile) notFound();
  if (!profile.consentCurrent) redirect(`/consent/${id}`);
  const { ui, templateLabels } = await getCopy();
  const summary = [
    [ui.ready.situationLabel, templateLabels[profile.templateKey]],
    [ui.ready.toneLabel, ui.setup.tones[profile.tone].label],
    [ui.ready.photosLabel, ui.consent.retention[profile.retention].label],
  ];
  return (
    <Shell>
      <PageHeading title={ui.ready.title} intro={ui.ready.intro} />
      <section className="mt-8">
        <h2 className="text-[1.25rem]">{ui.ready.summaryTitle}</h2>
        <dl className="mt-3 divide-y divide-border rounded-card border border-border bg-surface">
          {summary.map(([term, value]) => (
            <div key={term} className="px-4 py-3">
              <dt className="text-[0.9rem] text-muted">{term}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="mt-8 mb-12">{ui.ready.next}</p>
      <DeleteProfile
        profileId={id}
        text={ui.ready}
        errors={{ network: ui.common.networkError, generic: ui.common.genericError }}
      />
    </Shell>
  );
}
