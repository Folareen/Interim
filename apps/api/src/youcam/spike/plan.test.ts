import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bodyFor, estimateUnits, manifestSchema } from './plan';

const run = { label: 'density-1', tool: 'hair_density', photo: 'a.jpg' };

describe('manifest', () => {
  it('needs a photo or three photos, not both and not neither', () => {
    expect(manifestSchema.safeParse({ runs: [run] }).success).toBe(true);
    expect(manifestSchema.safeParse({ runs: [{ ...run, photo: undefined }] }).success).toBe(false);
    expect(manifestSchema.safeParse({ runs: [{ ...run, photos: ['a', 'b', 'c'] }] }).success).toBe(false);
    expect(manifestSchema.safeParse({ runs: [{ ...run, photo: undefined, photos: ['a', 'b'] }] }).success).toBe(false);
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
  it('builds a single photo, a three photo and a reference body', () => {
    const single = manifestSchema.parse({ runs: [run] }).runs[0];
    expect(single && bodyFor(single, ['f1'], undefined)).toEqual({ src_file_id: 'f1' });

    const three = manifestSchema.parse({ runs: [{ label: 't', tool: 'hair_type', photos: ['a', 'b', 'c'] }] }).runs[0];
    expect(three && bodyFor(three, ['1', '2', '3'], undefined)).toEqual({ src_file_ids: ['1', '2', '3'] });

    const hat = manifestSchema.parse({
      runs: [{ label: 'h', tool: 'hat', photo: 'a.jpg', ref: 'hat.jpg', params: { gender: 'female' } }],
    }).runs[0];
    expect(hat && bodyFor(hat, ['f1'], 'h1')).toEqual({ src_file_id: 'f1', ref_file_id: 'h1', gender: 'female' });
  });
});

describe('estimateUnits', () => {
  it('adds known costs and counts the tools with none apart', () => {
    const { runs } = manifestSchema.parse({
      runs: [run, { ...run, label: 'd2' }, { label: 'c', tool: 'cloth_v4', photo: 'a.jpg' }],
    });
    expect(estimateUnits(runs)).toEqual({ units: 2, unpriced: 1 });
  });
});
