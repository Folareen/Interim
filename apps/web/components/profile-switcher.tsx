import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getProfiles } from '@/lib/server-api';

/** Keeps multiple situations within reach without sending the person through account settings. */
export async function ProfileSwitcher({ profileId }: { profileId: string }) {
  const [profiles, t, labels] = await Promise.all([
    getProfiles(),
    getTranslations('workspace'),
    getTranslations('templateLabels'),
  ]);
  const current = profiles.find((profile) => profile.id === profileId);
  if (!current) return null;
  if (profiles.length === 1)
    return <p className="text-[0.95rem] text-muted">{labels(current.templateKey)}</p>;
  return (
    <details className="relative max-w-full">
      <summary className="min-h-11 cursor-pointer py-2 text-[0.95rem] text-muted">
        {labels(current.templateKey)} · {t('switchSituation')}
      </summary>
      <ul className="absolute top-full left-0 z-20 w-full min-w-56 max-w-80 rounded-card border border-outline bg-surface p-2">
        {profiles.map((profile) => (
          <li key={profile.id}>
            <Link
              href={profile.consentCurrent ? `/ready/${profile.id}` : `/consent/${profile.id}`}
              aria-current={profile.id === profileId ? 'true' : undefined}
              className="block min-h-11 rounded-lg px-3 py-2 hover:bg-tint"
            >
              {labels(profile.templateKey)}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
