import { adviceCodes, colourHex, templateKeys } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { type AdviceInput, shareableAdvice, skinPalette, templateAdvice } from './advice';
import { adviceStrategies, adviceStrategyAllowed, strategyTools } from './eligibility';

const base: AdviceInput = {
  templateKey: 'hair_patches',
  stage: 'patchy',
  strategy: 'hold',
  basis: 'measured',
  headCovering: false,
  bodyPhotos: true,
  skinHex: undefined,
};
const codes = (input: Partial<AdviceInput>) => templateAdvice({ ...base, ...input }).map((l) => l.code);

describe('hair_patches advice', () => {
  it('gives parting, brow and volume advice for those strategies', () => {
    expect(codes({ strategy: 'part' })).toEqual(['patches_part']);
    expect(codes({ strategy: 'brow' })).toEqual(['patches_brow']);
    expect(codes({ strategy: 'volume' })).toEqual(['patches_volume']);
  });

  it('says the stage comes from the person’s own report when density did not place it', () => {
    expect(codes({ strategy: 'brow', basis: 'reported' })).toEqual(['patches_own_report', 'patches_brow']);
    expect(codes({ strategy: 'brow', basis: 'previous' })).toEqual(['patches_own_report', 'patches_brow']);
    expect(codes({ strategy: 'brow', basis: 'baseline' })).toEqual(['patches_brow']);
  });

  it('never advises a parting to a person who covers their hair', () => {
    expect(codes({ strategy: 'part', headCovering: true })).toEqual([]);
    expect(adviceStrategyAllowed('part', { headCovering: true })).toBe(false);
    expect(adviceStrategyAllowed('part', { headCovering: false })).toBe(true);
    expect(adviceStrategyAllowed('brow', { headCovering: true })).toBe(false);
  });
});

describe('face_fullness advice', () => {
  const fullness = { templateKey: 'face_fullness', stage: 'fuller' } as const;

  it('offers a neckline, and a soft collar while the size is moving', () => {
    expect(codes({ ...fullness, strategy: 'neckline' })).toEqual(['fullness_neckline', 'fullness_collar']);
    expect(codes({ ...fullness, stage: 'usual', strategy: 'neckline' })).toEqual(['fullness_neckline']);
  });

  it('offers a frame choice', () => {
    expect(codes({ ...fullness, strategy: 'frame' })).toEqual(['fullness_frame']);
  });
});

describe('after_surgery advice', () => {
  const surgery = { templateKey: 'after_surgery', strategy: 'comfort' } as const;

  it('puts comfort first while recovering, then relaxed pieces, then fitted ones once settled', () => {
    expect(codes({ ...surgery, stage: 'recovering' })).toEqual(['surgery_soft', 'surgery_front_opening']);
    expect(codes({ ...surgery, stage: 'settling' })).toEqual(['surgery_soft', 'surgery_relaxed_first']);
    expect(codes({ ...surgery, stage: 'settled' })).toEqual(['surgery_settled']);
  });

  it('says body photos are off whatever the strategy, and stays quiet when they are on', () => {
    expect(codes({ ...surgery, stage: 'recovering', bodyPhotos: false })[0]).toBe('surgery_photos_off');
    expect(codes({ ...surgery, stage: 'recovering', strategy: 'hold', bodyPhotos: false })).toEqual(['surgery_photos_off']);
    expect(codes({ ...surgery, stage: 'recovering', strategy: 'hold' })).toEqual([]);
  });
});

describe('skin_colour advice', () => {
  const skin = { templateKey: 'skin_colour', stage: 'usual', strategy: 'match' } as const;

  it('matches clothes and makeup to the skin colour reading, and asks for a recheck while it changes', () => {
    const lines = templateAdvice({ ...base, ...skin, skinHex: '#674935' });
    expect(lines.map((l) => l.code)).toEqual(['skin_match_clothes', 'skin_match_makeup']);
    expect(lines.every((l) => l.colours.length > 0)).toBe(true);
    expect(codes({ ...skin, stage: 'changing', skinHex: '#674935' })).toContain('skin_match_recheck');
  });

  it('suggests no colours without a reading', () => {
    expect(templateAdvice({ ...base, ...skin })).toEqual([{ code: 'skin_match_unmeasured', colours: [] }]);
  });

  it('gives different colours for different skin colours, and the same ones for the same reading', () => {
    const light = skinPalette('#e0b49c');
    const deep = skinPalette('#4a2f22');
    expect(light).not.toEqual(deep);
    expect(skinPalette('#674935')).toEqual(skinPalette('#674935'));
    for (const colour of [...light.clothes, ...deep.makeup]) expect(colourHex).toHaveProperty(colour);
  });
});

describe('who gives which advice', () => {
  it('gives each situation its own codes, and none to the others', () => {
    const everyStrategy = [...adviceStrategies, 'cut', 'volume', 'colour', 'brow', 'hold'] as const;
    const stages = ['usual', 'fuller', 'settling', 'recovering', 'settled', 'changing', 'patchy'];
    const seen = new Map<string, Set<string>>();
    for (const templateKey of templateKeys) {
      for (const stage of stages) {
        for (const strategy of everyStrategy) {
          for (const basis of ['baseline', 'measured', 'reported'] as const) {
            for (const skinHex of ['#674935', undefined]) {
              const input = { ...base, templateKey, stage, strategy, basis, bodyPhotos: false, skinHex };
              for (const { code } of templateAdvice(input)) seen.set(code, (seen.get(code) ?? new Set()).add(templateKey));
            }
          }
        }
      }
    }
    expect([...seen.keys()].sort()).toEqual([...adviceCodes].sort());
    for (const [code, owners] of seen) expect(owners.size, code).toBe(1);
  });

  it('renders nothing for the advice strategies', () => {
    for (const strategy of adviceStrategies) expect(strategyTools(strategy, 'hair_patches')).toEqual([]);
    expect(strategyTools('brow', 'hair_patches')).toEqual(['makeup_brows']);
  });
});

describe('shareableAdvice', () => {
  it('keeps what a reader can act on and drops lines that speak of the stage, recovery or body photos', () => {
    const lines = adviceCodes.map((code) => ({ code, colours: [] }));
    const kept = shareableAdvice(lines).map((l) => l.code);
    expect(kept).toEqual([
      'patches_part',
      'patches_brow',
      'patches_volume',
      'fullness_neckline',
      'fullness_frame',
      'skin_match_clothes',
      'skin_match_makeup',
    ]);
    expect(kept).not.toContain('surgery_photos_off');
    expect(kept).not.toContain('patches_own_report');
  });
});
