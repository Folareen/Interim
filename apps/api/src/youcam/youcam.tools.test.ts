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

describe('skin_analysis', () => {
  it('rejects a request with no concern or more than the four the price covers', () => {
    const request = (dst_actions: string[]) => tools.skin_analysis.request.safeParse({ src_file_id: 'f', dst_actions }).success;
    expect(request([])).toBe(false);
    expect(request(['wrinkle', 'pore', 'texture', 'acne', 'redness'])).toBe(false);
    expect(request(['wrinkle', 'pore'])).toBe(true);
  });
});

describe('hair_type result', () => {
  it('accepts the upper case grades the live API returned', () => {
    const parsed = tools.hair_type.result.parse({ hair_type: { mapping: '4B to 4C', term: 'Coily to Extremely Coily' } });
    expect(parsed.hair_type.mapping).toBe('4b to 4c');
  });
});
