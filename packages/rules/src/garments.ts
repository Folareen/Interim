import type { GarmentFit, HoldReason, Size } from '@interim/types';

/** A saved piece as the buy or hold rule reads it. `sizeChart` maps a reported size to the label on the piece. */
export interface SavedPiece {
  sku: string;
  fit: GarmentFit;
  sizeChart: Readonly<Partial<Record<Size, string>>>;
}

/** What to buy now, with sizes, and what to wait on, with the reason. */
export interface ShoppingAdvice {
  shoppingList: { sku: string; size: string }[];
  holdOffBuying: { item: string; reason: HoldReason }[];
}

/**
 * The hold or buy rule for saved clothes (docs/product/spec.md section 4). The size is the reported
 * size looked up in the catalog's size chart, never read from a render. A fitted piece waits while
 * the stage says the size is still moving; a relaxed one can be bought at today's size.
 * @param buyStages The template's stages in which fitted pieces can be bought.
 */
export function shoppingAdvice(input: {
  stage: string;
  buyStages: readonly string[];
  reportedSize: Size | undefined;
  pieces: readonly SavedPiece[];
}): ShoppingAdvice {
  const advice: ShoppingAdvice = { shoppingList: [], holdOffBuying: [] };
  for (const piece of input.pieces) {
    const label = input.reportedSize ? piece.sizeChart[input.reportedSize] : undefined;
    if (!input.reportedSize) advice.holdOffBuying.push({ item: piece.sku, reason: 'size_unknown' });
    else if (!label) advice.holdOffBuying.push({ item: piece.sku, reason: 'size_not_offered' });
    else if (piece.fit === 'fitted' && !input.buyStages.includes(input.stage)) {
      advice.holdOffBuying.push({ item: piece.sku, reason: 'size_moving' });
    } else advice.shoppingList.push({ sku: piece.sku, size: label });
  }
  return advice;
}
