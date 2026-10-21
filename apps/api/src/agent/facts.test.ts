import { describe, expect, it } from 'vitest';
import { densityDirection, factText, isReliable, luma, reportedChange } from './facts';

const at = new Date('2026-10-01T00:00:00Z');
const fact = (value: Parameters<typeof factText>[0]['value']) => ({
  ref: 'm1',
  tool: 'hair_density' as const,
  value,
  measurementId: null,
  measuredAt: at,
  current: true,
});

describe('factText', () => {
  it('translates YouCam’s terms into the person’s language, with either spelling of the lowest grade', () => {
    expect(factText(fact({ kind: 'density', term: 'Medium Density', mapping: 1.5 }), 'en')).toBe('medium density');
    expect(factText(fact({ kind: 'density', term: 'Medium Density', mapping: 1.5 }), 'fr')).toBe('densité moyenne');
    expect(factText(fact({ kind: 'density', term: 'Extreme Low Density', mapping: 0 }), 'en')).toBe('very low density');
    expect(factText(fact({ kind: 'density', term: 'Extremely Low Density', mapping: 0 }), 'en')).toBe('very low density');
    expect(factText(fact({ kind: 'length', term: 'ear length' }), 'es')).toBe('a la altura de las orejas');
  });

  it('writes numbers, sizes and answers itself', () => {
    expect(factText(fact({ kind: 'face_ratio', ratio: 1.3456 }), 'en')).toBe('1.35');
    expect(factText(fact({ kind: 'face_ratio', ratio: 1.3456 }), 'fr')).toBe('1,35');
    expect(factText(fact({ kind: 'reported_size', size: 'M' }), 'en')).toBe('size M');
    expect(factText(reportedChange('some', at), 'en')).toBe('some change');
  });

  it('refuses a term it cannot translate', () => {
    expect(() => factText(fact({ kind: 'density', term: 'Ultra Density', mapping: 3 }), 'en')).toThrow(/Unknown density term/);
  });
});

describe('luma', () => {
  it('orders colours by brightness', () => {
    expect(luma('#ffffff')).toBeCloseTo(255);
    expect(luma('#000000')).toBe(0);
    expect(luma('#674935')).toBeLessThan(luma('#e0b090'));
  });
});

describe('densityDirection', () => {
  it('treats a move under the noise floor as similar', () => {
    expect(densityDirection(2, 1.5)).toBe('similar');
    expect(densityDirection(2, 1.2)).toBe('lower');
    expect(densityDirection(1, 1.8)).toBe('higher');
  });
});

describe('isReliable', () => {
  it('needs every part of YouCam’s own read to be good', () => {
    expect(isReliable({ has_face: true, area: 'good', frontal: 'good', lighting: 'good', faceangle: 'good' })).toBe(true);
    expect(isReliable({ has_face: true, area: 'toosmall', frontal: 'good' })).toBe(false);
    expect(isReliable(undefined)).toBe(true);
  });
});
