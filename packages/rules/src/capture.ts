import type { CapturePlan, CaptureProblem, ChangeReport, PhotoKind, Size } from '@interim/types';

/** What the photo and self report checks need to know about a snapshot. */
export interface SnapshotContext {
  isBaseline: boolean;
  /** Fit templates need a reported size, and a body photo while body photos are on (docs/product/spec.md section 5). */
  usesFit: boolean;
  /** The profile's body photo setting. Off means no body photo is asked for or accepted. */
  bodyPhotos: boolean;
}

/**
 * What a snapshot asks for (docs/product/spec.md section 5). The top photo is always optional
 * because a person cannot take it alone; left and right are baseline only.
 */
export function capturePlan(context: SnapshotContext): CapturePlan {
  const required: PhotoKind[] = ['front'];
  if (context.isBaseline) required.push('left', 'right');
  const wantsBody = context.usesFit && context.bodyPhotos;
  if (wantsBody) required.push('body');
  return {
    isBaseline: context.isBaseline,
    required,
    optional: ['top'],
    asksChange: !context.isBaseline,
    asksSize: !context.isBaseline && context.usesFit,
  };
}

/**
 * Checks the photo set for a snapshot against `capturePlan`.
 * @returns What is wrong, or undefined when the set is complete.
 */
export function photoSetProblem(kinds: readonly PhotoKind[], context: SnapshotContext): CaptureProblem | undefined {
  const present = new Set(kinds);
  if (present.size !== kinds.length) return 'duplicate_kind';
  if (!context.isBaseline && (present.has('left') || present.has('right'))) return 'sides_baseline_only';
  if (!context.bodyPhotos && present.has('body')) return 'body_photos_off';

  const missing = capturePlan(context).required.find((kind) => !present.has(kind));
  if (missing) return `missing_${missing}` as CaptureProblem;
  return undefined;
}

/**
 * Checks the check in questions. The baseline has no self report; later snapshots need the
 * "has anything changed" answer, and fit templates also need the current size.
 * @returns What is wrong, or undefined when the answers are complete.
 */
export function selfReportProblem(
  report: { changed: ChangeReport; reportedSize?: Size } | undefined,
  context: SnapshotContext,
): CaptureProblem | undefined {
  if (context.isBaseline) return report ? 'baseline_has_report' : undefined;
  if (!report) return 'needs_change_answer';
  if (context.usesFit && !report.reportedSize) return 'needs_size';
  return undefined;
}
