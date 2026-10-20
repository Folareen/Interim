import { describe, expect, it } from 'vitest';
import { photoSetProblem, selfReportProblem } from './capture';

const baseline = { isBaseline: true, usesFit: false, bodyPhotos: true };
const checkIn = { isBaseline: false, usesFit: false, bodyPhotos: true };

describe('photoSetProblem', () => {
  it('accepts a baseline of front, left and right, with top optional', () => {
    expect(photoSetProblem(['front', 'left', 'right'], baseline)).toBeUndefined();
    expect(photoSetProblem(['front', 'left', 'right', 'top'], baseline)).toBeUndefined();
  });

  it('asks for missing baseline photos', () => {
    expect(photoSetProblem(['front'], baseline)).toBe('Add the left, right photos.');
  });

  it('needs a body photo only for fit templates', () => {
    const fit = { ...checkIn, usesFit: true };
    expect(photoSetProblem(['front'], checkIn)).toBeUndefined();
    expect(photoSetProblem(['front'], fit)).toBe('Add the body photo.');
    expect(photoSetProblem(['front', 'body'], fit)).toBeUndefined();
  });

  it('neither asks for nor accepts a body photo while body photos are off', () => {
    const fitOff = { ...checkIn, usesFit: true, bodyPhotos: false };
    expect(photoSetProblem(['front'], fitOff)).toBeUndefined();
    expect(photoSetProblem(['front', 'body'], fitOff)).toBe('Body photos are off. Turn them on to add one.');
  });

  it('rejects side photos at a check in', () => {
    expect(photoSetProblem(['front', 'left'], checkIn)).toMatch(/only needed for the first set/);
  });

  it('rejects two photos of the same kind', () => {
    expect(photoSetProblem(['front', 'front'], checkIn)).toBe('Send one photo of each kind.');
  });
});

describe('selfReportProblem', () => {
  it('has no self report at baseline', () => {
    expect(selfReportProblem(undefined, baseline)).toBeUndefined();
    expect(selfReportProblem({ changed: 'none' }, baseline)).toBeDefined();
  });

  it('needs the answer at a check in, and a size for fit templates', () => {
    expect(selfReportProblem(undefined, checkIn)).toBeDefined();
    expect(selfReportProblem({ changed: 'some' }, checkIn)).toBeUndefined();
    const fit = { ...checkIn, usesFit: true };
    expect(selfReportProblem({ changed: 'lot' }, fit)).toBe('Pick your current size.');
    expect(selfReportProblem({ changed: 'lot', reportedSize: 'M' }, fit)).toBeUndefined();
  });
});
