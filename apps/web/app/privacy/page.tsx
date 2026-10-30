import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeading } from '@/components/page-heading';
import { Shell } from '@/components/shell';
import { supportEmail } from '@/lib/contact';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('privacy'))('title') };
}

export default async function Privacy() {
  const [t, consent] = await Promise.all([getTranslations('privacy'), getTranslations('consent')]);
  return (
    <Shell backHref="/">
      <PageHeading title={t('title')} intro={t('intro')} />
      <div className="space-y-8 py-8">
        {(['data', 'processors', 'retention', 'choices', 'cookies'] as const).map((section) => (
          <section key={section}>
            <h2 className="text-[1.25rem]">{t(`${section}.title`)}</h2>
            {section === 'data' && <p className="mt-3">{consent('keepBody')}</p>}
            {section === 'processors' && (
              <>
                <p className="mt-3">{consent('helperYoucam')}</p>
                <p className="mt-3">{consent('helperGoogle')}</p>
              </>
            )}
            {section === 'retention' && (
              <dl className="mt-3 space-y-3">
                {(['standard', 'extended'] as const).map((mode) => (
                  <div key={mode}>
                    <dt className="font-semibold">{consent(`retention.${mode}.label`)}</dt>
                    <dd>{consent(`retention.${mode}.description`)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-3">{t(`${section}.body`)}</p>
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
