import type { PhotoKind } from '@interim/types';

/** What the photo and self report checks need to know about a snapshot. */
export interface SnapshotContext {
  isBaseline: boolean;
  /** Fit templates need a reported size, and a body photo while body photos are on (docs/product/spec.md section 5). */
  usesFit: boolean;
  /** The profile's body photo setting. Off means no body photo is asked for or accepted. */
  bodyPhotos: boolean;
}

/**
 * Checks the photo set for a snapshot against spec section 5. The top photo is always optional
 * because a person cannot take it alone; left and right are baseline only.
 * @returns A plain sentence for the person, or undefined when the set is complete.
 */
export function photoSetProblem(kinds: readonly PhotoKind[], context: SnapshotContext): string | undefined {
  const present = new Set(kinds);
  if (present.size !== kinds.length) return 'Send one photo of each kind.';

  if (!context.isBaseline && (present.has('left') || present.has('right'))) {
    return 'The side photos are only needed for the first set.';
  }

  if (!context.bodyPhotos && present.has('body')) return 'Body photos are off. Turn them on to add one.';

  const required: PhotoKind[] = ['front'];
  if (context.isBaseline) required.push('left', 'right');
  if (context.usesFit && context.bodyPhotos) required.push('body');

  const missing = required.filter((kind) => !present.has(kind));
  if (missing.length > 0) return `Add the ${missing.join(', ')} photo${missing.length > 1 ? 's' : ''}.`;
  return undefined;
}

/**
 * Checks the check in questions. The baseline has no self report; later snapshots need the
 * "has anything changed" answer, and fit templates also need the current size.
 * @returns A plain sentence for the person, or undefined when the answers are complete.
 */
export function selfReportProblem(
  report: { changed: 'none' | 'some' | 'lot'; reportedSize?: string } | undefined,
  context: SnapshotContext,
): string | undefined {
  if (context.isBaseline) return report ? 'The first set does not need a check in answer.' : undefined;
  if (!report) return 'Tell us whether anything has changed since last time.';
  if (context.usesFit && !report.reportedSize) return 'Pick your current size.';
  return undefined;
}
