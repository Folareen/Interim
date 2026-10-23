import { describe, expect, it } from 'vitest';
import { type SavedPiece, shoppingAdvice } from './garments';

const tee: SavedPiece = { sku: 'tee', fit: 'relaxed', sizeChart: { S: 'S', M: 'M', L: 'L' } };
const jacket: SavedPiece = { sku: 'jacket', fit: 'fitted', sizeChart: { M: '40', L: '42' } };
const buyStages = ['usual_size', 'settled'];

describe('shoppingAdvice', () => {
  it('lists every piece with its size from the chart once the size has settled', () => {
    expect(shoppingAdvice({ stage: 'settled', buyStages, reportedSize: 'L', pieces: [tee, jacket] })).toEqual({
      shoppingList: [
        { sku: 'tee', size: 'L' },
        { sku: 'jacket', size: '42' },
      ],
      holdOffBuying: [],
    });
  });

  it('holds a fitted piece while the size is moving, and still lists a relaxed one', () => {
    expect(shoppingAdvice({ stage: 'one_size_away', buyStages, reportedSize: 'M', pieces: [tee, jacket] })).toEqual({
      shoppingList: [{ sku: 'tee', size: 'M' }],
      holdOffBuying: [{ item: 'jacket', reason: 'size_moving' }],
    });
  });

  it('holds a piece the catalog does not make in the reported size, whatever the stage', () => {
    expect(shoppingAdvice({ stage: 'settled', buyStages, reportedSize: 'XS', pieces: [tee, jacket] }).holdOffBuying).toEqual([
      { item: 'tee', reason: 'size_not_offered' },
      { item: 'jacket', reason: 'size_not_offered' },
    ]);
  });

  it('holds everything until a size is reported', () => {
    expect(shoppingAdvice({ stage: 'usual_size', buyStages, reportedSize: undefined, pieces: [tee] })).toEqual({
      shoppingList: [],
      holdOffBuying: [{ item: 'tee', reason: 'size_unknown' }],
    });
  });

  it('is empty with nothing saved', () => {
    expect(shoppingAdvice({ stage: 'usual_size', buyStages, reportedSize: 'M', pieces: [] })).toEqual({ shoppingList: [], holdOffBuying: [] });
  });
});
