import { measuredValueText } from '@interim/templates';
import type { ChangeReport, LiveLocale, MeasureTool, MeasuredValue } from '@interim/types';

/** A reading or an answer, as the planner cites it and the card shows it (docs/product/spec.md sections 8 and 9). */
export interface Fact {
  /** What the planner cites. Stable between runs (`m1`, `m2`, `r1`), so a recorded plan replays. */
  ref: string;
  tool: MeasureTool | 'self_report';
  value: MeasuredValue;
  /** The measurement row, or null for something the person reported. */
  measurementId: string | null;
  measuredAt: Date;
  /** False when the reading is from an earlier check in, so the card says "last measured on". */
  current: boolean;
  /** For density only: how it compares with the person's own baseline. Never shown as a number. */
  direction?: 'lower' | 'similar' | 'higher';
}

/**
 * The text that fills a `{m:<ref>}` placeholder, in the person's language. Code writes every term,
 * number and size, so a figure on the card always comes from a record.
 */
export function factText(fact: Fact, locale: LiveLocale): string {
  return measuredValueText(fact.value, locale);
}

/** Brightness of a `#rrggbb` colour, 0 to 255, for comparing skin colour with the baseline. */
export function luma(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Density readings under this move are noise (docs/product/spec.md section 6). */
const DENSITY_NOISE = 0.7;

/** How a density reading compares with the person's own baseline, for the planner. Never a number. */
export function densityDirection(baseline: number, current: number): 'lower' | 'similar' | 'higher' {
  if (current <= baseline - DENSITY_NOISE) return 'lower';
  if (current >= baseline + DENSITY_NOISE) return 'higher';
  return 'similar';
}

/** What a self report says, as a fact. */
export function reportedChange(changed: ChangeReport, at: Date): Fact {
  return { ref: 'r1', tool: 'self_report', value: { kind: 'reported_change', changed }, measurementId: null, measuredAt: at, current: true };
}

/** Whether YouCam's own read of a photo was good enough to place a stage on (spec section 6). */
export function isReliable(quality: Record<string, string | boolean | undefined> | undefined): boolean {
  if (!quality) return true;
  return Object.values(quality).every((v) => v === undefined || v === true || v === 'good');
}
