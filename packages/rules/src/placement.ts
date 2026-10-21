import type { ChangeReport, Placement, Size } from '@interim/types';
import { sizeLadder } from '@interim/types';

/** Density readings are compared with the person's own baseline, never across people (spec section 6). */
export interface PlacementInput {
  /** The template's stages in order. */
  stages: readonly string[];
  /** The stage of the last snapshot, or null when this is the baseline. */
  previousStage: string | null;
  /** What the baseline measured or reported. */
  baseline: { density?: number; skinLuma?: number; size?: Size };
  /** What this snapshot measured and the person reported. A tool that was not taken is absent. */
  latest: {
    /** Absent when the reading is not reliable (YouCam's `face_quality` was not all good). */
    density?: number;
    lowestDensity?: number;
    lengthTerm?: string;
    skinLuma?: number;
    size?: Size;
    changed?: ChangeReport;
  };
  /** The size reported at the last check in. */
  previousSize?: Size;
}

/** The stage placed, and what it rests on, for the trace. */
export interface Placed {
  stageKey: string;
  basis: 'baseline' | 'measured' | 'reported' | 'previous';
}

const advance: Record<ChangeReport, number> = { none: 0, some: 1, lot: 2 };

/**
 * Places a person on the template's path from this check in. A reading that is missing or not
 * reliable falls back to the self report, and then to the last stage, so a card never rests on a
 * number it does not have (docs/product/spec.md sections 4 and 6).
 */
export function placeStage(placement: Placement, input: PlacementInput): Placed {
  const [first] = input.stages;
  if (first === undefined) throw new Error('A template needs at least one stage');
  if (input.previousStage === null) return { stageKey: first, basis: 'baseline' };

  const measured = placeFromMeasurement(placement, input, input.previousStage);
  if (measured) return { stageKey: measured, basis: 'measured' };
  return placeFromReport(input, input.previousStage, placement.by === 'reported_size' || placement.by === 'reported_change');
}

function placeFromMeasurement(placement: Placement, input: PlacementInput, previous: string): string | undefined {
  const { baseline, latest } = input;
  switch (placement.by) {
    case 'density': {
      if (baseline.density === undefined || latest.density === undefined) return undefined;
      const lowest = latest.lowestDensity ?? latest.density;
      if (latest.density - lowest >= placement.recovery.minRise) return placement.recovery.stage;
      const drop = baseline.density - latest.density;
      return placement.bands.find((band) => drop >= band.minDrop)?.stage ?? input.stages[0];
    }
    case 'length':
      return latest.lengthTerm === undefined ? undefined : placement.stages[latest.lengthTerm];
    case 'skin_colour': {
      if (baseline.skinLuma === undefined || latest.skinLuma === undefined) return undefined;
      const change = Math.abs(latest.skinLuma - baseline.skinLuma);
      const band = placement.bands.find((b) => change >= b.minChange);
      if (band) return band.stage;
      // Back within the noise after a change: the colour has settled.
      return previous === input.stages[0] ? previous : placement.settled;
    }
    case 'reported_size':
      return latest.size === undefined || baseline.size === undefined ? undefined : placeSize(placement, input, previous);
    case 'reported_change':
      return undefined;
  }
}

function placeSize(placement: Extract<Placement, { by: 'reported_size' }>, input: PlacementInput, previous: string): string {
  const { baseline, latest } = input;
  if (latest.size === undefined || baseline.size === undefined) return previous;
  const away = Math.abs(sizeLadder.indexOf(latest.size) - sizeLadder.indexOf(baseline.size));
  const [usual, one, two] = placement.steps;
  if (away === 0) return usual;
  // The same size twice running, away from the baseline, means it has stopped changing.
  if (input.previousSize === latest.size && previous !== usual) return placement.settled;
  return away === 1 ? one : two;
}

function placeFromReport(input: PlacementInput, previous: string, reportOnly: boolean): Placed {
  const { changed } = input.latest;
  const at = input.stages.indexOf(previous);
  if (changed === undefined || at < 0) return { stageKey: previous, basis: 'previous' };
  if (changed === 'none' && !reportOnly) return { stageKey: previous, basis: 'previous' };
  const next = Math.min(at + advance[changed], input.stages.length - 1);
  return { stageKey: input.stages[next] ?? previous, basis: 'reported' };
}
