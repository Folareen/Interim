import { templateKeys } from '@interim/types';
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

  it.each(templateKeys)('%s allows a strategy in every stage, and always lets the agent hold or colour', (key) => {
    const { stages, strategies } = templates[key];
    expect(Object.keys(strategies).sort()).toEqual([...stages].sort());
    for (const stage of stages) {
      expect(strategies[stage]?.length, `${key} ${stage}`).toBeGreaterThan(0);
      expect(strategies[stage]).toContain('colour');
    }
  });

  it('offers volume only where density is tracked', () => {
    for (const key of templateKeys) {
      const { strategies, tracks } = templates[key];
      const offersVolume = Object.values(strategies).some((list) => list.includes('volume'));
      if (offersVolume) expect(tracks, key).toContain('hair_density');
    }
  });

  it('gives every look a unique id that resolves to itself', () => {
    const all = Object.values(looksByStrategy).flat();
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    for (const look of all) expect(looksById[look.id]).toBe(look);
  });

  it('has looks for every strategy a template can choose, except hold and cover', () => {
    for (const key of templateKeys) {
      for (const list of Object.values(templates[key].strategies)) {
        for (const strategy of list.filter((s) => s !== 'hold' && s !== 'cover')) {
          expect(looksByStrategy[strategy].length, `${key} ${strategy}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
