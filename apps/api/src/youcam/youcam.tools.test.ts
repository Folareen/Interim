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
  it('rejects a request with no concern and accepts the result scores', () => {
    expect(tools.skin_analysis.request.safeParse({ src_file_id: 'f', dst_actions: [] }).success).toBe(false);
    const parsed = tools.skin_analysis.result.parse({ output: [{ type: 'pore', ui_score: 71, raw_score: 70.5, mask_urls: [] }] });
    expect(parsed.output[0]?.ui_score).toBe(71);
  });
});
