import { describe, expect, it } from 'vitest';
import { tools } from './youcam.tools';

describe('face_shape result', () => {
  it('keeps the face aspect ratio, the number tracked for fullness', () => {
    const parsed = tools.face_shape.result.parse({
      faceshape: 'Oval',
      facialratio: { face_aspect_ratio: [1, 1.34] },
      face_quality: { has_face: true, area: 'good', frontal: 'good', lighting: 'good', faceangle: 'good' },
    });
    expect(parsed.facialratio?.face_aspect_ratio[1]).toBe(1.34);
  });
});
