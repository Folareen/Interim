import { measuredValueText } from '@interim/templates';
import { type CardView, colourHex, liveLocaleSchema } from '@interim/types';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { OptionImage } from '@/app/cards/[id]/option-image';
import { isGarmentKey, isLookKey, isStageKey, isToolKey } from '@/lib/labels';

const changeTools = ['hair_density', 'hair_length', 'hair_type', 'face_shape', 'skin_tone', 'self_report'] as const;
type ChangeTool = (typeof changeTools)[number];
const isChangeTool = (tool: string): tool is ChangeTool => (changeTools as readonly string[]).includes(tool);

/** Whether the card shows clothes, a shopping list or hold offs, so a fit situation with none can offer the catalog. */
export const cardHasClothes = (card: CardView['card']) => card.clothes.length > 0 || card.shoppingList.length > 0 || card.holdOffBuying.length > 0;

/**
 * Everything a Stage Card says, in the order it says it. The owner's card and the public demo card
 * both render this, so they cannot drift apart. The slots hold the owner only offers (the catalog,
 * the reflection), which the demo leaves out.
 */
export async function StageCardBody({
  view,
  afterHold,
  afterWhatToSay,
}: {
  view: CardView;
  afterHold?: ReactNode;
  afterWhatToSay?: ReactNode;
}) {
  const { card } = view;
  const [t, trace, tools, stages, labels, garments, advice, colours, looks, locale, format] = await Promise.all([
    getTranslations('card'),
    getTranslations('trace'),
    getTranslations('tools'),
    getTranslations('stages'),
    getTranslations('templateLabels'),
    getTranslations('garments'),
    getTranslations('advice'),
    getTranslations('colours'),
    getTranslations('looks'),
    getLocale(),
    getFormatter(),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  // The person's current language, not the one the card was made in, so the screen reads in one language.
  const valueText = (value: Parameters<typeof measuredValueText>[0]) => measuredValueText(value, liveLocaleSchema.parse(locale));
  const stage = isStageKey(card.stageKey) ? stages(card.stageKey) : '';
  const garmentName = (sku: string) => (isGarmentKey(sku) ? garments(sku) : '');

  return (
    <>
      <h1 className="text-[2rem] leading-[1.15]">{t('title')}</h1>
      <p className="mt-2 text-muted">{date(card.takenAt)}</p>

      <section className="mt-8 border-l-2 border-accent pl-4">
        <p className="text-[1.15rem]">{card.companionNote.text}</p>
      </section>

      <dl className="mt-8 divide-y divide-border rounded-card border border-border bg-surface">
        <div className="px-4 py-3">
          <dt className="text-[0.9rem] text-muted">{t('situationLabel')}</dt>
          <dd className="font-semibold">{labels(card.templateKey)}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[0.9rem] text-muted">{t('stageLabel')}</dt>
          <dd className="font-semibold">{stage}</dd>
        </div>
      </dl>

      {card.changes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('changesTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {card.changes.filter((c) => isChangeTool(c.tool)).map((change) => (
              <li key={`${change.tool}-${change.measurementId ?? 'reported'}`} className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="font-semibold">{t(`changeLine.${change.tool as ChangeTool}`, { value: valueText(change.value) })}</p>
                <p className="text-[0.9rem] text-muted">
                  {change.tool === 'self_report'
                    ? t('reportedOn', { date: date(change.measuredAt) })
                    : t(change.current ? 'measuredOn' : 'lastMeasuredOn', { date: date(change.measuredAt) })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.advice.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('adviceTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {card.advice.map((line) => (
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

      <section className="mt-8">
        <h2 className="text-[1.25rem]">{t('optionsTitle')}</h2>
        <p className="mt-2 text-[0.95rem] text-muted">{t('optionsIntro')}</p>
        {card.options.length === 0 && <p className="mt-4">{t('noOptions')}</p>}
        <ul className="mt-4 space-y-8">
          {card.options.map((option) => {
            const url = view.renderUrls[option.renderId];
            return (
              <li key={option.renderId}>
                {url ? (
                  <OptionImage previewUrl={url} photoUrl={view.photoUrl} label={t(option.label === 'preview' ? 'preview' : 'earlierLook')} />
                ) : (
                  <p className="rounded-card border border-border bg-surface px-4 py-6 text-muted">{t('imageGone')}</p>
                )}
                {/* A look is named by what it is, so a preview never says who it is for. */}
                {option.look && isLookKey(option.look) ? (
                  <>
                    <p className="mt-3 font-semibold">{looks(option.look)}</p>
                    <p className="text-[0.95rem] text-muted">{t(`optionReasons.${option.strategy}`)}</p>
                  </>
                ) : (
                  <p className="mt-3 font-semibold">{t(`optionReasons.${option.strategy}`)}</p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {card.clothes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('clothesTitle')}</h2>
          <p className="mt-2 text-[0.95rem] text-muted">{t('clothesIntro')}</p>
          <ul className="mt-4 space-y-8">
            {card.clothes.map((piece) => {
              const url = view.renderUrls[piece.renderId];
              return (
                <li key={piece.renderId}>
                  {url ? (
                    <OptionImage
                      previewUrl={url}
                      photoUrl={view.bodyPhotoUrl}
                      label={t('preview')}
                      previewAlt={t('clothesAlt', { item: garmentName(piece.sku) })}
                    />
                  ) : (
                    <p className="rounded-card border border-border bg-surface px-4 py-6 text-muted">{t('imageGone')}</p>
                  )}
                  <p className="mt-3 font-semibold">{garmentName(piece.sku)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {card.shoppingList.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('shoppingTitle')}</h2>
          <p className="mt-2 text-[0.95rem] text-muted">{t('shoppingIntro')}</p>
          <ul className="mt-3 space-y-3">
            {card.shoppingList.map((entry) => (
              <li key={entry.sku} className="rounded-card border border-border bg-surface px-4 py-3 font-semibold">
                {t('shoppingLine', { item: garmentName(entry.sku), size: entry.size })}
              </li>
            ))}
          </ul>
        </section>
      )}

      {card.holdOffBuying.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('holdTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {card.holdOffBuying.map((entry) => (
              <li key={entry.item} className="rounded-card border border-border bg-surface px-4 py-3">
                <p className="font-semibold">{garmentName(entry.item)}</p>
                <p className="text-[0.95rem] text-muted">{t(`holdReasons.${entry.reason}`)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {afterHold}

      {card.whatToSay.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[1.25rem]">{t('whatToSayTitle')}</h2>
          <ul className="mt-3 space-y-3">
            {card.whatToSay.map((line) => (
              <li key={line} className="border-l-2 border-accent pl-4">
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {afterWhatToSay}

      <details className="mt-8 rounded-card border border-border bg-surface px-4 py-3">
        <summary className="cursor-pointer font-semibold">{t('traceTitle')}</summary>
        <ol className="mt-3 space-y-2 text-[0.95rem]">
          {card.trace.map((line) => (
            <li key={line.seq}>
              <p>{trace(line.reason, { tool: line.tool && isToolKey(line.tool) ? tools(line.tool) : '' })}</p>
              {line.tool && <p className="text-muted">{t('traceUnits', { units: format.number(line.costUnits) })}</p>}
            </li>
          ))}
        </ol>
      </details>

      {card.sensitive && (
        <section className="mt-8 space-y-2 text-[0.95rem] text-muted">
          <p>{t('professionalLine')}</p>
          <a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
            {t('talkLink')}
          </a>
        </section>
      )}

    </>
  );
}
