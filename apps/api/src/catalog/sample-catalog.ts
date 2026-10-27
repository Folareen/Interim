import type { GarmentCategory, GarmentFit, Size } from '@interim/types';

/** One piece of the sample catalog. Its picture is `images/<sku>.jpg`. */
export interface SampleItem {
  sku: string;
  /** English, for logs. People see the name from the message catalogs, keyed by sku. */
  name: string;
  category: GarmentCategory;
  fit: GarmentFit;
  /** The label printed on the piece for each size it comes in. A size that is missing is not made. */
  sizeChart: Readonly<Partial<Record<Size, string>>>;
}

const sameLabels = (sizes: readonly Size[]): Partial<Record<Size, string>> => Object.fromEntries(sizes.map((size) => [size, size]));

/**
 * The sample catalog (docs/product/spec.md section 17): a few upper body and outer pieces, the two
 * categories YouCam's clothes tool has been seen to handle on chest up photos. The pictures are
 * generated with YouCam's image generator (they stand in for licensed retailer pictures). Real retailer sync is out of scope.
 */
export const sampleCatalog: readonly SampleItem[] = [
  { sku: 'tee-crew', name: 'Crew neck tee', category: 'upper_body', fit: 'relaxed', sizeChart: sameLabels(['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']) },
  { sku: 'shirt-oxford', name: 'Oxford shirt', category: 'upper_body', fit: 'fitted', sizeChart: { S: '15', M: '15.5', L: '16.5', XL: '17.5', XXL: '18.5' } },
  { sku: 'jumper-knit', name: 'Knit jumper', category: 'upper_body', fit: 'relaxed', sizeChart: sameLabels(['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']) },
  { sku: 'jacket-light', name: 'Light jacket', category: 'outer', fit: 'fitted', sizeChart: { S: '46', M: '48', L: '50', XL: '52', XXL: '54' } },
];
