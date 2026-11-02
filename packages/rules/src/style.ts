/** Most references one request may preview. Each is a paid call, so the cap also bounds the cost. */
export const STYLE_MAX_REFERENCES = 3;

/** Units one reference preview costs (`cloth_v4`, docs/integrations/youcam.md). */
export const STYLE_PREVIEW_UNITS = 2;

/** Why a style request cannot start. */
export type StyleRequestProblem = 'no_consent' | 'no_references' | 'too_many_references' | 'over_budget';

/** What a style request needs to know before any units are reserved. */
export interface StyleRequestContext {
  hasCurrentConsent: boolean;
  referenceCount: number;
  /** Units left under the tightest cap, from the ledger. */
  remainingUnits: number;
}

/**
 * Decides whether a style request may start and what it costs. Plain code, so the model never
 * decides consent or spending.
 * @returns The cost in units, or the reason it cannot start.
 */
export function stylePreviewPlan(
  context: StyleRequestContext,
): { ok: true; units: number } | { ok: false; problem: StyleRequestProblem } {
  if (!context.hasCurrentConsent) return { ok: false, problem: 'no_consent' };
  if (context.referenceCount < 1) return { ok: false, problem: 'no_references' };
  if (context.referenceCount > STYLE_MAX_REFERENCES) return { ok: false, problem: 'too_many_references' };
  const units = context.referenceCount * STYLE_PREVIEW_UNITS;
  if (units > context.remainingUnits) return { ok: false, problem: 'over_budget' };
  return { ok: true, units };
}
