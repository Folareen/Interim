import { describe, expect, it } from 'vitest';
import { capturePlan, photoSetProblem, selfReportProblem } from './capture';

const baseline = { isBaseline: true, usesFit: false, bodyPhotos: true };
const checkIn = { isBaseline: false, usesFit: false, bodyPhotos: true };

describe('capturePlan', () => {
  it('asks the baseline for front and both sides, with no questions', () => {
    expect(capturePlan(baseline)).toEqual({
      isBaseline: true,
      required: ['front', 'left', 'right'],
      optional: ['top'],
      asksChange: false,
      asksSize: false,
    });
  });

  it('asks a check in for the front and the change answer', () => {
    expect(capturePlan(checkIn)).toMatchObject({ required: ['front'], asksChange: true, asksSize: false });
  });

  it('adds the body photo and the size for fit templates, unless body photos are off', () => {
    expect(capturePlan({ ...checkIn, usesFit: true })).toMatchObject({ required: ['front', 'body'], asksSize: true });
    expect(capturePlan({ ...checkIn, usesFit: true, bodyPhotos: false }).required).toEqual(['front']);
  });
});

describe('photoSetProblem', () => {
  it('accepts a baseline of front, left and right, with top optional', () => {
    expect(photoSetProblem(['front', 'left', 'right'], baseline)).toBeUndefined();
    expect(photoSetProblem(['front', 'left', 'right', 'top'], baseline)).toBeUndefined();
  });

  it('asks for missing baseline photos', () => {
    expect(photoSetProblem(['front'], baseline)).toBe('missing_left');
    expect(photoSetProblem(['front', 'left'], baseline)).toBe('missing_right');
  });

  it('needs a body photo only for fit templates', () => {
    const fit = { ...checkIn, usesFit: true };
    expect(photoSetProblem(['front'], checkIn)).toBeUndefined();
    expect(photoSetProblem(['front'], fit)).toBe('missing_body');
    expect(photoSetProblem(['front', 'body'], fit)).toBeUndefined();
  });

  it('neither asks for nor accepts a body photo while body photos are off', () => {
    const fitOff = { ...checkIn, usesFit: true, bodyPhotos: false };
    expect(photoSetProblem(['front'], fitOff)).toBeUndefined();
    expect(photoSetProblem(['front', 'body'], fitOff)).toBe('body_photos_off');
  });

  it('rejects side photos at a check in', () => {
    expect(photoSetProblem(['front', 'left'], checkIn)).toBe('sides_baseline_only');
  });

  it('rejects two photos of the same kind', () => {
    expect(photoSetProblem(['front', 'front'], checkIn)).toBe('duplicate_kind');
  });
});

describe('selfReportProblem', () => {
  it('has no self report at baseline', () => {
    expect(selfReportProblem(undefined, baseline)).toBeUndefined();
    expect(selfReportProblem({ changed: 'none' }, baseline)).toBe('baseline_has_report');
  });

  it('needs the answer at a check in, and a size for fit templates', () => {
    expect(selfReportProblem(undefined, checkIn)).toBe('needs_change_answer');
    expect(selfReportProblem({ changed: 'some' }, checkIn)).toBeUndefined();
    const fit = { ...checkIn, usesFit: true };
    expect(selfReportProblem({ changed: 'lot' }, fit)).toBe('needs_size');
    expect(selfReportProblem({ changed: 'lot', reportedSize: 'M' }, fit)).toBeUndefined();
  });
});
