import type { PhotoKind } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { type MeasurementsContext, measurementsDue } from './measurements';

const photos = (...kinds: PhotoKind[]) => new Set<PhotoKind>(kinds);
const everyTool = ['hair_type', 'hair_density', 'hair_length', 'face_shape', 'skin_tone'] as const;
const checkIn: MeasurementsContext = {
  isBaseline: false,
  baseline: everyTool,
  tracks: ['hair_density', 'hair_length'],
  photos: photos('front', 'top'),
  headCovering: false,
  changed: 'none',
  stageExpectsChange: false,
  checkInsSinceMeasured: 0,
  remeasureEvery: 3,
};

describe('measurementsDue', () => {
  it('takes every baseline measure the photos allow', () => {
    const due = measurementsDue({ ...checkIn, isBaseline: true, photos: photos('front', 'left', 'right', 'top') });
    expect(due).toEqual(['hair_type', 'hair_density', 'hair_length', 'face_shape', 'skin_tone']);
  });

  it('takes only the tools a template reads at the baseline, and nothing when it reads none', () => {
    const all = { ...checkIn, isBaseline: true, photos: photos('front', 'left', 'right', 'top') };
    expect(measurementsDue({ ...all, baseline: ['skin_tone'] })).toEqual(['skin_tone']);
    expect(measurementsDue({ ...all, baseline: [] })).toEqual([]);
  });

  it('measures density only when a top photo was taken, and hair type only with both sides', () => {
    const due = measurementsDue({ ...checkIn, isBaseline: true, photos: photos('front', 'left') });
    expect(due).toEqual(['hair_length', 'face_shape', 'skin_tone']);
  });

  it('measures nothing at a quiet check in', () => {
    expect(measurementsDue(checkIn)).toEqual([]);
  });

  it('measures the tracked tools when the person reports a change', () => {
    expect(measurementsDue({ ...checkIn, changed: 'some' })).toEqual(['hair_density', 'hair_length']);
  });

  it('measures when the stage model expects a change, or after remeasure_every check ins', () => {
    expect(measurementsDue({ ...checkIn, stageExpectsChange: true })).toHaveLength(2);
    expect(measurementsDue({ ...checkIn, checkInsSinceMeasured: 3 })).toHaveLength(2);
    expect(measurementsDue({ ...checkIn, checkInsSinceMeasured: 2 })).toEqual([]);
  });

  it('skips hair measures on a covered head, and keeps the face ones', () => {
    const due = measurementsDue({ ...checkIn, isBaseline: true, headCovering: true, photos: photos('front', 'left', 'right', 'top') });
    expect(due).toEqual(['face_shape', 'skin_tone']);
  });
});
