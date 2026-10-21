import { liveLocaleSchema, liveLocales, type LiveLocale } from '@interim/types';

/**
 * Picks the first language in an Accept-Language header that Interim offers, so a first visit opens
 * in the browser's language. A regional tag such as `fr-CA` counts as its base language.
 */
export function negotiateLocale(header: string | null | undefined): LiveLocale | undefined {
  if (!header) return undefined;
  const ranked = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = Number(params.find((p) => p.trim().startsWith('q='))?.trim().slice(2) ?? 1);
      return { base: tag.trim().toLowerCase().split('-')[0] ?? '', q: Number.isNaN(q) ? 0 : q };
    })
    .filter(({ q }) => q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { base } of ranked) {
    const match = liveLocaleSchema.safeParse(base);
    if (match.success) return match.data;
  }
  return undefined;
}

/** Whether a value is one of the offered languages. */
export function isLiveLocale(value: unknown): value is LiveLocale {
  return typeof value === 'string' && (liveLocales as readonly string[]).includes(value);
}

/**
 * Keeps a `next` address on this site. Anything else, such as another origin or a protocol relative
 * address, falls back, so the language form cannot be used to send a person elsewhere.
 */
export function safeNext(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}
