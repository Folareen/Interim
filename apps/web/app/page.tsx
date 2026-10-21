import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Actions } from '@/components/actions';
import { primaryClass, secondaryClass } from '@/components/button';
import { Shell } from '@/components/shell';
import { StageDots } from '@/components/stage-dots';
import { getMe, getProfiles } from '@/lib/server-api';

export default async function Home() {
  // Someone signed in goes back to where they left off, so the welcome only greets people who are new or signed out.
  if (await getMe()) {
    const profiles = await getProfiles();
    const [only] = profiles;
    if (profiles.length === 0) redirect('/situation');
    if (profiles.length === 1 && only) redirect(only.consentCurrent ? `/ready/${only.id}` : `/consent/${only.id}`);
    redirect('/account');
  }
  const t = await getTranslations('welcome');
  return (
    <Shell>
      <div className="pt-8">
        <StageDots />
      </div>
      <h1 className="mt-8 text-[2.25rem] leading-[1.12]">{t('title')}</h1>
      <p className="mt-6 text-[1.1rem] leading-relaxed">{t('intro')}</p>
      <p className="mt-4 text-muted">{t('reassurance')}</p>
      <p className="mt-auto pt-10 pb-6 text-[0.9rem] text-muted">{t('footnote')}</p>
      <Actions>
        <Link href="/signup" className={primaryClass}>
          {t('start')}
        </Link>
        <Link href="/signin" className={secondaryClass}>
          {t('haveAccount')}
        </Link>
      </Actions>
    </Shell>
  );
}
