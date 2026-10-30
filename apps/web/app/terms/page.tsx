import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { supportEmail } from '@/lib/contact';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('serviceTerms'))('title') };
}

export default async function Terms() {
  const t = await getTranslations('serviceTerms');
  return (
    <Shell backHref="/">
      <PageHeading title={t('title')} intro={t('intro')} />
      <div className="space-y-8 py-8">
        {(['adults', 'photos', 'previews', 'account', 'availability'] as const).map((section) => (
          <section key={section}>
            <h2 className="text-[1.25rem]">{t(`${section}.title`)}</h2>
            <p className="mt-3">{t(`${section}.body`, { age: 18 })}</p>
          </section>
        ))}
        {supportEmail && (
          <p>
            {t('contact')}{' '}
            <a
              href={`mailto:${supportEmail}`}
              className="break-words text-accent underline underline-offset-4"
            >
              {supportEmail}
            </a>
          </p>
        )}
      </div>
    </Shell>
  );
}
