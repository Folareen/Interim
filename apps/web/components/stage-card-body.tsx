import { localeNames, measuredValueText } from '@interim/templates';
import { type CardView, colourHex, liveLocaleSchema } from '@interim/types';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { OptionImage } from '@/app/cards/[id]/option-image';
import { isGarmentKey, isLookKey, isStageKey, isToolKey } from '@/lib/labels';

const changeTools = [
  'hair_density',
  'hair_length',
  'hair_type',
  'face_shape',
  'skin_tone',
  'self_report',
] as const;
type ChangeTool = (typeof changeTools)[number];
const isChangeTool = (tool: string): tool is ChangeTool =>
  (changeTools as readonly string[]).includes(tool);

/** Whether the card shows clothes, a shopping list or hold offs, so a fit situation with none can offer the catalog. */
export const cardHasClothes = (card: CardView['card']) =>
  card.clothes.length > 0 || card.shoppingList.length > 0 || card.holdOffBuying.length > 0;

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
  const [
    t,
    trace,
    tools,
    stages,
    labels,
    garments,
    advice,
    colours,
    looks,
    locale,
    format,
    workspace,
  ] = await Promise.all([
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
    getTranslations('workspace'),
  ]);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  // The person's current language, not the one the card was made in, so the screen reads in one language.
  const valueText = (value: Parameters<typeof measuredValueText>[0]) =>
    measuredValueText(value, liveLocaleSchema.parse(locale));
  const stage = isStageKey(card.stageKey) ? stages(card.stageKey) : '';
  const garmentName = (sku: string) => (isGarmentKey(sku) ? garments(sku) : '');

  return (
    <>
      <h1 className="text-[1.75rem] leading-[1.2] sm:text-[2rem]">{t('title')}</h1>
      <p className="mt-2 text-muted">{date(card.takenAt)}</p>

      <section className="mt-5 rounded-2xl bg-tint p-4">
        <p lang={card.locale} className="font-serif text-[1.15rem] leading-relaxed">
          {card.companionNote.text}
        </p>
        {card.locale !== locale && (
          <p className="mt-2 text-[0.9rem] text-muted">
            {workspace('savedLanguage', { language: localeNames[card.locale] })}
          </p>
        )}
      </section>

      <section id="card-previews" className="mt-8">
        <h2 className="text-[1.25rem]">{t('optionsTitle')}</h2>
        <p className="mt-2 text-[0.95rem] text-muted">{t('optionsIntro')}</p>
        {card.options.length === 0 && <p className="mt-4">{t('noOptions')}</p>}
        <ul className="mt-4 grid min-w-0 items-start gap-5 sm:grid-cols-2">
          {card.options.map((option) => {
            const url = view.renderUrls[option.renderId];
            return (
              <li key={option.renderId} className="min-w-0">
                {url ? (
                  <OptionImage
                    previewUrl={url}
                    photoUrl={view.photoUrl}
                    label={t(option.label === 'preview' ? 'preview' : 'earlierLook')}
                  />
                ) : (
                  <p className="rounded-card border border-border bg-surface px-4 py-6 text-muted">
                    {t('imageGone')}
                  </p>
                )}
                {/* A look is named by what it is, so a preview never says who it is for. */}
                {option.look && isLookKey(option.look) ? (
                  <>
                    <p className="mt-3 font-semibold">{looks(option.look)}</p>
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
          <ul className="mt-4 grid min-w-0 items-start gap-5 sm:grid-cols-2">
            {card.clothes.map((piece) => {
              const url = view.renderUrls[piece.renderId];
              return (
                <li key={piece.renderId} className="min-w-0">
                  {url ? (
                    <OptionImage
                      previewUrl={url}
                      photoUrl={view.bodyPhotoUrl}
                      label={t('preview')}
                      previewAlt={t('clothesAlt', { item: garmentName(piece.sku) })}
                    />
                  ) : (
                    <p className="rounded-card border border-border bg-surface px-4 py-6 text-muted">
                      {t('imageGone')}
                    </p>
                  )}
                  <p className="mt-3 font-semibold">{garmentName(piece.sku)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <details id="card-changes" className="workspace-card mt-8 px-5 py-4 sm:px-6">
        <summary className="min-h-11 cursor-pointer font-serif text-[1.4rem]">
          {t('changesTitle')}
        </summary>
        <dl className="mt-4 divide-y divide-border rounded-card border border-border bg-surface">
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
            <ul className="mt-3 space-y-3">
              {card.changes
                .filter((c) => isChangeTool(c.tool))
                .map((change) => (
                  <li
                    key={`${change.tool}-${change.measurementId ?? 'reported'}`}
                    className="rounded-card border border-border bg-surface px-4 py-3"
                  >
                    <p className="font-semibold">
                      {t(`changeLine.${change.tool as ChangeTool}`, {
                        value: valueText(change.value),
                      })}
                    </p>
                    <p className="text-[0.9rem] text-muted">
                      {change.tool === 'self_report'
                        ? t('reportedOn', { date: date(change.measuredAt) })
                        : t(change.current ? 'measuredOn' : 'lastMeasuredOn', {
                            date: date(change.measuredAt),
                          })}
                    </p>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </details>
      {card.advice.length > 0 && (
        <details className="workspace-card mt-6 px-5 py-4 sm:px-6">
          <summary className="min-h-11 cursor-pointer font-serif text-[1.4rem]">
            {t('adviceTitle')}
          </summary>
          <ul className="mt-3 space-y-3">
            {card.advice.map((line) => (
              <li
                key={line.code}
                className="rounded-card border border-border bg-surface px-4 py-3"
              >
                <p>{advice(line.code)}</p>
                {line.colours.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {line.colours.map((colour) => (
                      <li key={colour} className="flex items-center gap-2 text-[0.95rem]">
                        <span
                          aria-hidden="true"
                          className="inline-block size-6 rounded-full border border-border"
                          style={{ backgroundColor: colourHex[colour] }}
                        />
                        {colours(colour)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details id="card-shopping" className="workspace-card mt-6 px-5 py-4 sm:px-6">
        <summary className="min-h-11 cursor-pointer font-serif text-[1.4rem]">
          {t('shoppingTitle')}
        </summary>
        <p className="mt-3 text-[0.95rem] text-muted">{t('shoppingIntro')}</p>
        {card.shoppingList.length > 0 && (
          <section className="mt-8">
            <ul className="mt-3 space-y-3">
              {card.shoppingList.map((entry) => (
                <li
                  key={entry.sku}
                  className="rounded-card border border-border bg-surface px-4 py-3 font-semibold"
                >
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
                <li
                  key={entry.item}
                  className="rounded-card border border-border bg-surface px-4 py-3"
                >
                  <p className="font-semibold">{garmentName(entry.item)}</p>
                  <p className="text-[0.95rem] text-muted">{t(`holdReasons.${entry.reason}`)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {afterHold}
      </details>
      {card.whatToSay.length > 0 && (
        <details className="workspace-card mt-6 px-5 py-4 sm:px-6">
          <summary className="min-h-11 cursor-pointer font-serif text-[1.4rem]">
            {t('whatToSayTitle')}
          </summary>
          <ul className="mt-3 space-y-3">
            {card.whatToSay.map((line) => (
              <li key={line} className="border-l-2 border-accent pl-4">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}

      {afterWhatToSay}

      <details className="mt-8 rounded-card border border-border bg-surface px-4 py-3">
        <summary className="cursor-pointer font-semibold">{t('traceTitle')}</summary>
        <ol className="mt-3 space-y-2 text-[0.95rem]">
          {card.trace.map((line) => (
            <li key={line.seq}>
              <p>
                {trace(line.reason, {
                  tool: line.tool && isToolKey(line.tool) ? tools(line.tool) : '',
                })}
              </p>
              {line.tool && (
                <p className="text-muted">
                  {t('traceUnits', { units: format.number(line.costUnits) })}
                </p>
              )}
            </li>
          ))}
        </ol>
      </details>

      {card.sensitive && (
        <section className="mt-8 space-y-2 text-[0.95rem] text-muted">
          <p>{t('professionalLine')}</p>
          <a
            href="https://findahelpline.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-4"
          >
            {t('talkLink')}
          </a>
        </section>
      )}
    </>
  );
}
