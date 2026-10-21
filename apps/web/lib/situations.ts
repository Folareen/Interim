import type { TemplateKey } from '@interim/types';

/** The situations as the picker groups them, in display order (docs/product/overview.md, Templates). */
export const situationGroups = {
  illness: ['hair_loss_ahead', 'hair_patches', 'face_fullness', 'after_surgery', 'skin_colour'],
  other: ['weight_change', 'midlife_change', 'after_a_baby', 'going_grey', 'textured_growth', 'beard_growth'],
} as const satisfies Record<string, readonly TemplateKey[]>;
