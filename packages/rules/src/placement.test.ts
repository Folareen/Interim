import type { Placement } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { type PlacementInput, placeStage } from './placement';

const density: Placement = {
  by: 'density',
  bands: [
    { minDrop: 1.8, stage: 'none' },
    { minDrop: 0.7, stage: 'thinning' },
  ],
  recovery: { minRise: 0.7, stage: 'growing_in' },
};
const stages = ['full', 'thinning', 'short', 'none', 'growing_in'];
const input = (over: Partial<PlacementInput>): PlacementInput => ({
  stages,
  previousStage: 'full',
  baseline: { density: 2 },
  latest: {},
  ...over,
});

describe('placeStage by density', () => {
  it('puts the baseline on the first stage whatever is measured', () => {
    expect(placeStage(density, input({ previousStage: null, latest: { density: 0 } }))).toEqual({ stageKey: 'full', basis: 'baseline' });
  });

  it('compares with the person’s own baseline, not the grade', () => {
    expect(placeStage(density, input({ latest: { density: 1 } })).stageKey).toBe('thinning');
    expect(placeStage(density, input({ latest: { density: 0 } }))).toEqual({ stageKey: 'none', basis: 'measured' });
  });

  it('treats a change under the noise floor as no change', () => {
    expect(placeStage(density, input({ latest: { density: 1.5 } }))).toEqual({ stageKey: 'full', basis: 'measured' });
  });

  it('places growing in when the reading rises from its lowest', () => {
    const placed = placeStage(density, input({ previousStage: 'none', latest: { density: 1.2, lowestDensity: 0 } }));
    expect(placed).toEqual({ stageKey: 'growing_in', basis: 'measured' });
  });

  it('falls back to the self report when there is no reliable reading', () => {
    expect(placeStage(density, input({ latest: { changed: 'some' } }))).toEqual({ stageKey: 'thinning', basis: 'reported' });
    expect(placeStage(density, input({ latest: { changed: 'lot' } })).stageKey).toBe('short');
  });

  it('stays on the last stage when nothing changed and nothing was measured', () => {
    expect(placeStage(density, input({ previousStage: 'thinning', latest: { changed: 'none' } }))).toEqual({
      stageKey: 'thinning',
      basis: 'previous',
    });
  });

  it('never moves past the last stage', () => {
    expect(placeStage(density, input({ previousStage: 'growing_in', latest: { changed: 'lot' } })).stageKey).toBe('growing_in');
  });
});

describe('placeStage by reported change', () => {
  it('moves along the path with each report', () => {
    const placement: Placement = { by: 'reported_change' };
    const face = ['usual', 'fuller', 'settling'];
    const base = { stages: face, previousStage: 'usual', baseline: {} };
    expect(placeStage(placement, { ...base, latest: { changed: 'some' } })).toEqual({ stageKey: 'fuller', basis: 'reported' });
    expect(placeStage(placement, { ...base, latest: { changed: 'lot' } }).stageKey).toBe('settling');
    expect(placeStage(placement, { ...base, latest: { changed: 'none' } }).stageKey).toBe('usual');
  });
});

describe('placeStage by reported size', () => {
  const placement: Placement = { by: 'reported_size', steps: ['usual_size', 'one_size_away', 'two_sizes_away'], settled: 'settled' };
  const weight = ['usual_size', 'one_size_away', 'two_sizes_away', 'settled'];
  const base = { stages: weight, baseline: { size: 'M' as const } };

  it('counts sizes away from the baseline size, in either direction', () => {
    expect(placeStage(placement, { ...base, previousStage: 'usual_size', latest: { size: 'M' } }).stageKey).toBe('usual_size');
    expect(placeStage(placement, { ...base, previousStage: 'usual_size', latest: { size: 'L' } }).stageKey).toBe('one_size_away');
    expect(placeStage(placement, { ...base, previousStage: 'usual_size', latest: { size: 'S' } }).stageKey).toBe('one_size_away');
    expect(placeStage(placement, { ...base, previousStage: 'one_size_away', latest: { size: 'XL' } }).stageKey).toBe('two_sizes_away');
  });

  it('settles when the same size is reported twice away from the baseline', () => {
    const placed = placeStage(placement, { ...base, previousStage: 'one_size_away', previousSize: 'L', latest: { size: 'L' } });
    expect(placed).toEqual({ stageKey: 'settled', basis: 'measured' });
  });
});

describe('placeStage by skin colour', () => {
  const placement: Placement = { by: 'skin_colour', bands: [{ minChange: 8, stage: 'changing' }], settled: 'settled' };
  const colour = ['usual', 'changing', 'settled'];
  const base = { stages: colour, baseline: { skinLuma: 100 } };

  it('places a change in brightness from the baseline', () => {
    expect(placeStage(placement, { ...base, previousStage: 'usual', latest: { skinLuma: 112 } }).stageKey).toBe('changing');
    expect(placeStage(placement, { ...base, previousStage: 'usual', latest: { skinLuma: 103 } }).stageKey).toBe('usual');
  });

  it('settles once a change has come back within the noise', () => {
    expect(placeStage(placement, { ...base, previousStage: 'changing', latest: { skinLuma: 101 } }).stageKey).toBe('settled');
  });
});

describe('placeStage by length', () => {
  it('places from the length term, and falls back to the report without one', () => {
    const placement: Placement = { by: 'length', stages: { 'above the ears': 'very_short', 'ear length': 'short' } };
    const base = { stages: ['very_short', 'short'], previousStage: 'very_short', baseline: {} };
    expect(placeStage(placement, { ...base, latest: { lengthTerm: 'ear length' } })).toEqual({ stageKey: 'short', basis: 'measured' });
    expect(placeStage(placement, { ...base, latest: { changed: 'some' } })).toEqual({ stageKey: 'short', basis: 'reported' });
  });
});
