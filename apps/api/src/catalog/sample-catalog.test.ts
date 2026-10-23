import { messages } from '@interim/templates';
import { describe, expect, it } from 'vitest';
import { sampleCatalog } from './sample-catalog';

describe('the sample catalog', () => {
  it('has unique skus, and a name in every language for each', () => {
    expect(new Set(sampleCatalog.map((i) => i.sku)).size).toBe(sampleCatalog.length);
    for (const locale of Object.values(messages)) {
      for (const item of sampleCatalog) expect(locale.garments, item.sku).toHaveProperty([item.sku]);
    }
  });

  it('offers at least one size on the ladder for every piece', () => {
    for (const item of sampleCatalog) expect(Object.keys(item.sizeChart).length, item.sku).toBeGreaterThan(0);
  });
});
