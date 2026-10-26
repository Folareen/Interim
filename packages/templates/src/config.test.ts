import { adviceStrategies } from '@interim/rules';
import { type Strategy, templateKeys } from '@interim/types';
import { describe, expect, it } from 'vitest';
import { looksByStrategy, looksById, templates } from './index';

describe('template config', () => {
  it.each(templateKeys)('%s names only stages it has', (key) => {
    const { placement, stages } = templates[key];
    const named: string[] = [];
    if (placement.by === 'density') named.push(...placement.bands.map((b) => b.stage), placement.recovery.stage);
    if (placement.by === 'length') named.push(...Object.values(placement.stages));
    if (placement.by === 'skin_colour') named.push(...placement.bands.map((b) => b.stage), placement.settled);
    if (placement.by === 'reported_size') named.push(...placement.steps, placement.settled);
    for (const stage of named) expect(stages, `${key} places ${stage}`).toContain(stage);
  });

  it.each(templateKeys)('%s allows a strategy in every stage that works whatever is on the head', (key) => {
    const { stages, strategies } = templates[key];
    expect(Object.keys(strategies).sort()).toEqual([...stages].sort());
    const headFree = new Set<Strategy>(['colour', 'brow', 'hold', ...adviceStrategies]);
    for (const stage of stages) {
      expect(strategies[stage]?.length, `${key} ${stage}`).toBeGreaterThan(0);
      expect(strategies[stage]?.some((s) => headFree.has(s) && s !== 'part'), `${key} ${stage}`).toBe(true);
    }
  });

  it.each(templateKeys)('%s sets buy stages only where it uses fit, and only stages it has', (key) => {
    const { buyStages, stages, usesFit } = templates[key];
    expect(buyStages.length > 0, key).toBe(usesFit);
    for (const stage of buyStages) expect(stages, `${key} buys in ${stage}`).toContain(stage);
  });

  it.each(templateKeys)('%s follows only what its baseline measured', (key) => {
    const { baseline, tracks } = templates[key];
    for (const tool of tracks) expect(baseline, `${key} tracks ${tool}`).toContain(tool);
  });

  it('reads at the baseline only what the cards of templates 2 to 5 use', () => {
    expect(templates.after_surgery.baseline).toEqual([]);
    expect(templates.skin_colour.baseline).toEqual(['skin_tone']);
    expect(templates.face_fullness.baseline).toEqual(['face_shape']);
    expect(templates.hair_patches.baseline).not.toContain('skin_tone');
  });

  it('offers volume only where density is tracked', () => {
    for (const key of templateKeys) {
      const { strategies, tracks } = templates[key];
      const offersVolume = Object.values(strategies).some((list) => list.includes('volume'));
      if (offersVolume) expect(tracks, key).toContain('hair_density');
    }
  });

  it('gives every look a unique id that resolves to itself', () => {
    // Brow looks serve both colour and brow, so the same look can appear under two strategies.
    const all = [...new Set(Object.values(looksByStrategy).flat())];
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    for (const look of all) expect(looksById[look.id]).toBe(look);
  });

  it('has looks for every strategy a template can choose, except hold, cover and the advice strategies', () => {
    for (const key of templateKeys) {
      for (const list of Object.values(templates[key].strategies)) {
        for (const strategy of list.filter((s) => s !== 'hold' && s !== 'cover' && !adviceStrategies.has(s))) {
          expect(looksByStrategy[strategy].length, `${key} ${strategy}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('cover strategy', () => {
  it('is offered by no template, because hat and scarf try on are unusable (spec section 7, rule 6)', () => {
    for (const key of templateKeys) {
      for (const list of Object.values(templates[key].strategies)) expect(list, key).not.toContain('cover');
    }
  });
});

describe('situation strategies', () => {
  it('gives each of templates 2 to 5 a strategy only that situation offers', () => {
    const offered = (key: (typeof templateKeys)[number]) => new Set(Object.values(templates[key].strategies).flat());
    const mine = { hair_patches: 'part', face_fullness: 'neckline', after_surgery: 'comfort', skin_colour: 'match' } as const;
    for (const [key, strategy] of Object.entries(mine) as [keyof typeof mine, Strategy][]) {
      expect(offered(key).has(strategy), `${key} offers ${strategy}`).toBe(true);
      for (const other of templateKeys.filter((k) => k !== key)) expect(offered(other).has(strategy), `${other} offers ${strategy}`).toBe(false);
    }
  });

  it('keeps the brow in every patches stage, so a person who covers their hair still has a look', () => {
    for (const stage of templates.hair_patches.stages) {
      expect(templates.hair_patches.strategies[stage]).toContain('brow');
    }
  });
});
