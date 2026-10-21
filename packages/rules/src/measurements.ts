import type { ChangeReport, MeasureTool, PhotoKind } from '@interim/types';

/** What decides which measurements to take on this snapshot. */
export interface MeasurementsContext {
  isBaseline: boolean;
  /** The tools this template follows over time. */
  tracks: readonly MeasureTool[];
  photos: ReadonlySet<PhotoKind>;
  headCovering: boolean;
  /** The self report, absent at the baseline. */
  changed?: ChangeReport;
  /** The stage model expects a change from the stage the person is in. */
  stageExpectsChange: boolean;
  /** Check ins since a measurement was last taken. */
  checkInsSinceMeasured: number;
  remeasureEvery: number;
}

// Hair measures would read a covering as hair (spec section 7, rule 4), so a covered head skips them.
const hairMeasures: ReadonlySet<MeasureTool> = new Set(['hair_type', 'hair_density', 'hair_length']);

const baselineTools: readonly MeasureTool[] = ['hair_type', 'hair_density', 'hair_length', 'face_shape', 'skin_tone'];

/**
 * The measurements worth taking now (docs/product/spec.md section 6). The baseline takes them all;
 * a check in takes the template's tracked ones when something changed, the stage model expects a
 * change, or `remeasureEvery` check ins have passed. Eligibility and the budget are checked after.
 */
export function measurementsDue(context: MeasurementsContext): MeasureTool[] {
  if (!context.isBaseline && !due(context)) return [];
  const wanted = context.isBaseline ? baselineTools : context.tracks;
  return wanted.filter((tool) => hasPhotosFor(tool, context) && !(context.headCovering && hairMeasures.has(tool)));
}

function due(context: MeasurementsContext): boolean {
  return (
    context.changed === 'some' ||
    context.changed === 'lot' ||
    context.stageExpectsChange ||
    context.checkInsSinceMeasured >= context.remeasureEvery
  );
}

function hasPhotosFor(tool: MeasureTool, context: MeasurementsContext): boolean {
  if (tool === 'hair_type') return context.isBaseline && context.photos.has('left') && context.photos.has('right');
  if (tool === 'hair_density') return context.photos.has('top');
  return context.photos.has('front');
}
