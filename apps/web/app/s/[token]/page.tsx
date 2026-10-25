import { colourHex } from '@interim/types';
import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Shell } from '@/components/shell';
import { isGarmentKey, isLookKey } from '@/lib/labels';
import { getSharedCard } from '@/lib/server-api';
import { OptionImage } from '../../cards/[id]/option-image';

// The address is the only credential, so it must not reach a search engine or leak in a referrer.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('share'))('viewTitle'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/** What someone sees when the person shares a card: previews and a shopping list, signed out. */
export default async function SharedCard({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await getSharedCard(token);
  if (!shared) notFound();

  const [t, card, garments, advice, colours, looks, format] = await Promise.all([
    getTranslations('share'),
    getTranslations('card'),
    getTranslations('garments'),
    getTranslations('advice'),
    getTranslations('colours'),
    getTranslations('looks'),
    getFormatter(),
  ]);
  const garmentName = (sku: string) => (isGarmentKey(sku) ? garments(sku) : '');
  const empty = shared.options.length === 0 && shared.clothes.length === 0 && shared.shoppingList.length === 0 && shared.advice.length === 0;

  return (
    <Shell>
      <h1 className="text-[2rem] leading-[1.15]">{t('viewTitle')}</h1>
      <p className="mt-2 text-muted">{t('viewIntro')}</p>
      <p className="mt-2 text-[0.9rem] text-muted">{t('viewExpires', { date: format.dateTime(new Date(shared.expiresAt), { dateStyle: 'medium' }) })}</p>
      {empty && <p className="mt-8">{t('viewEmpty')}</p>}

      {shared.options.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{card('optionsTitle')}</h2>
          <p className="mt-2 text-[0.95rem] text-muted">{card('optionsIntro')}</p>
          <ul className="mt-4 space-y-8">
            {shared.options.map((option) => (
              <li key={option.url}>
                <OptionImage previewUrl={option.url} photoUrl={null} label={card(option.label === 'preview' ? 'preview' : 'earlierLook')} />
                {option.look && isLookKey(option.look) ? (
                  <>
                    <p className="mt-3 font-semibold">{looks(option.look)}</p>
                    <p className="text-[0.95rem] text-muted">{card(`optionReasons.${option.strategy}`)}</p>
                  </>
                ) : (
                  <p className="mt-3 font-semibold">{card(`optionReasons.${option.strategy}`)}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {shared.advice.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{card('adviceTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {shared.advice.map((line) => (
              <li key={line.code} className="rounded-card border border-border bg-surface px-4 py-3">
                <p>{advice(line.code)}</p>
                {line.colours.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {line.colours.map((colour) => (
                      <li key={colour} className="flex items-center gap-2 text-[0.95rem]">
                        <span aria-hidden="true" className="inline-block size-6 rounded-full border border-border" style={{ backgroundColor: colourHex[colour] }} />
                        {colours(colour)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {shared.clothes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{card('clothesTitle')}</h2>
          <ul className="mt-4 space-y-8">
            {shared.clothes.map((piece) => (
              <li key={piece.url}>
                <OptionImage previewUrl={piece.url} photoUrl={null} label={card('preview')} previewAlt={card('clothesAlt', { item: garmentName(piece.sku) })} />
                <p className="mt-3 font-semibold">{garmentName(piece.sku)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shared.shoppingList.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{card('shoppingTitle')}</h2>
          <p className="mt-2 text-[0.95rem] text-muted">{card('shoppingIntro')}</p>
          <ul className="mt-3 space-y-3">
            {shared.shoppingList.map((entry) => (
              <li key={entry.sku} className="rounded-card border border-border bg-surface px-4 py-3 font-semibold">
                {card('shoppingLine', { item: garmentName(entry.sku), size: entry.size })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
