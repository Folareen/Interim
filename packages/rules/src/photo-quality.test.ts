import { describe, expect, it } from 'vitest';
import { photoQualityProblem } from './photo-quality';

const good = { width: 800, height: 1000, meanLuma: 120, sharpness: 200 };

describe('photoQualityProblem', () => {
  it('passes a clear, evenly lit photo', () => {
    expect(photoQualityProblem(good)).toBeUndefined();
  });

  it('names the first thing to fix', () => {
    expect(photoQualityProblem({ ...good, width: 300 })).toBe('too_small');
    expect(photoQualityProblem({ ...good, meanLuma: 20 })).toBe('too_dark');
    expect(photoQualityProblem({ ...good, meanLuma: 245 })).toBe('too_bright');
    expect(photoQualityProblem({ ...good, sharpness: 5 })).toBe('blurry');
  });

  it('checks the short side, so a landscape photo is judged the same as a portrait one', () => {
    expect(photoQualityProblem({ ...good, width: 1000, height: 400 })).toBe('too_small');
  });
});
