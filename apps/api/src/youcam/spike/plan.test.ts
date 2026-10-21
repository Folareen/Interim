import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodyFor, estimateUnits, manifestSchema, maxUnitsFrom, spendProblem } from './plan';

const run = { label: 'density-1', tool: 'hair_density', photo: 'a.jpg' };

describe('manifest', () => {
  it('takes a photo, up to three photos, or none, but never a photo and photos together', () => {
    expect(manifestSchema.safeParse({ runs: [run] }).success).toBe(true);
    expect(manifestSchema.safeParse({ runs: [{ ...run, photo: undefined }] }).success).toBe(true);
    expect(manifestSchema.safeParse({ runs: [{ ...run, photo: undefined, photos: ['a', 'b'] }] }).success).toBe(true);
    expect(manifestSchema.safeParse({ runs: [{ ...run, photos: ['a', 'b', 'c'] }] }).success).toBe(false);
    expect(manifestSchema.safeParse({ runs: [{ ...run, photo: undefined, photos: ['a', 'b', 'c', 'd'] }] }).success).toBe(false);
  });

  it('rejects an unknown tool and a label that could name a path', () => {
    expect(manifestSchema.safeParse({ runs: [{ ...run, tool: 'nope' }] }).success).toBe(false);
    expect(manifestSchema.safeParse({ runs: [{ ...run, label: '../x' }] }).success).toBe(false);
  });
});

describe('example manifest', () => {
  it('stays valid against the schema', () => {
    const file = path.join(__dirname, 'manifest.example.json');
    expect(manifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8'))).success).toBe(true);
  });
});

describe('bodyFor', () => {
  it('builds a single photo, a three photo and a garment body', () => {
    const single = manifestSchema.parse({ runs: [run] }).runs[0];
    expect(single && bodyFor(single, ['f1'], undefined)).toEqual({ src_file_id: 'f1' });

    const text = manifestSchema.parse({ runs: [{ label: 't', tool: 'text_to_image', params: { prompt: 'x' } }] }).runs[0];
    expect(text && bodyFor(text, [], undefined)).toEqual({ prompt: 'x' });

    const three = manifestSchema.parse({ runs: [{ label: 't', tool: 'hair_type', photos: ['a', 'b', 'c'] }] }).runs[0];
    expect(three && bodyFor(three, ['1', '2', '3'], undefined)).toEqual({ src_file_ids: ['1', '2', '3'] });

    const cloth = manifestSchema.parse({
      runs: [{ label: 'c', tool: 'cloth_v4', photo: 'a.jpg', ref: 'jacket.jpg', params: { garment_category: 'outer' } }],
    }).runs[0];
    expect(cloth && bodyFor(cloth, ['f1'], 'j1')).toEqual({ src_file_id: 'f1', ref_file_id: 'j1', garment_category: 'outer' });
  });
});

describe('estimateUnits', () => {
  it('adds up the costs of the runs', () => {
    const { runs } = manifestSchema.parse({
      runs: [run, { ...run, label: 'd2' }, { label: 'c', tool: 'cloth_v4', photo: 'a.jpg' }],
    });
    expect(estimateUnits(runs)).toEqual({ units: 4, unpriced: 0 });
  });
});

describe('spending cap', () => {
  it('reads --max-units and ignores anything that is not a positive whole number', () => {
    expect(maxUnitsFrom(['--yes', '--max-units', '40'])).toBe(40);
    expect(maxUnitsFrom(['--yes'])).toBeUndefined();
    for (const bad of ['0', '-5', 'ten', '2.5', '']) expect(maxUnitsFrom(['--max-units', bad])).toBeUndefined();
    expect(maxUnitsFrom(['--max-units'])).toBeUndefined();
  });

  it('refuses to spend without a cap, with an unpriced run, or over the cap', () => {
    expect(spendProblem({ units: 10, unpriced: 0 }, undefined)).toMatch(/--max-units/);
    expect(spendProblem({ units: 10, unpriced: 1 }, 100)).toMatch(/no confirmed price/);
    expect(spendProblem({ units: 101, unpriced: 0 }, 100)).toMatch(/over the cap/);
    expect(spendProblem({ units: 100, unpriced: 0 }, 100)).toBeUndefined();
  });
});
