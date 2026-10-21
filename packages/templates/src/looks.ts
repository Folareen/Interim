import type { RenderTool, Strategy } from '@interim/types';

/**
 * One preview the agent can render. The API turns it into the tool's request, so a look is data
 * and a template is configuration (docs/product/spec.md section 4). Styles are offered to everyone;
 * nothing asks for gender (spec section 17, item 7).
 */
export type Look =
  | { id: string; tool: 'hairstyle'; templateId: string }
  | { id: string; tool: 'hair_volume'; templateId: string }
  | { id: string; tool: 'beard_style'; templateId: string }
  | { id: string; tool: 'hair_color'; preset: 'Jet Black' | 'Chocolate Brown' | 'Honey Blonde' | 'Ash Gray' | 'Copper Red' }
  | { id: string; tool: 'makeup_brows'; color: string };

// Ids come from YouCam's own template lists (hair transfer v2.1 and beard style v2.0, read once, which
// costs nothing). Only `male_short_curly` and `female_blunt_bob` have been rendered live so far
// (docs/integrations/youcam.md, Observed live); the rest are valid ids that still need a recorded run.
// The first three of a strategy are the ones a run renders, so they are kept varied. The `all_` ids
// are YouCam's own unisex ones; the older male and female ids are offered to everyone too.
const looks: readonly Look[] = [
  { id: 'style_short_curly', tool: 'hairstyle', templateId: 'male_short_curly' },
  { id: 'style_blunt_bob', tool: 'hairstyle', templateId: 'female_blunt_bob' },
  { id: 'style_buzz_cut', tool: 'hairstyle', templateId: 'all_buzz_cut' },
  { id: 'style_pixie', tool: 'hairstyle', templateId: 'all_pixie' },
  { id: 'style_crewcut', tool: 'hairstyle', templateId: 'all_crewcut' },
  { id: 'style_textured_crop', tool: 'hairstyle', templateId: 'male_textured_crop' },
  { id: 'style_afro', tool: 'hairstyle', templateId: 'male_afro' },
  { id: 'style_dreadlocks', tool: 'hairstyle', templateId: 'all_dreadlocks' },
  { id: 'beard_goatee', tool: 'beard_style', templateId: 'all_goatee' },
  { id: 'beard_circle', tool: 'beard_style', templateId: 'all_circle' },
  { id: 'beard_anchor', tool: 'beard_style', templateId: 'all_anchor' },
  { id: 'beard_shaved', tool: 'beard_style', templateId: 'all_shaved' },
  { id: 'volume_natural', tool: 'hair_volume', templateId: 'female_natural' },
  { id: 'volume_medium', tool: 'hair_volume', templateId: 'female_medium' },
  { id: 'colour_chocolate', tool: 'hair_color', preset: 'Chocolate Brown' },
  { id: 'colour_ash', tool: 'hair_color', preset: 'Ash Gray' },
  { id: 'brows_soft', tool: 'makeup_brows', color: '#4a3b32' },
  { id: 'brows_deep', tool: 'makeup_brows', color: '#2b211c' },
];

/** Every look by id. */
export const looksById: Readonly<Record<string, Look>> = Object.fromEntries(looks.map((look) => [look.id, look]));

/** The looks each strategy can offer, by the tool that renders them, in the order to try them. */
export const looksByStrategy: Readonly<Record<Strategy, readonly Look[]>> = {
  cut: looks.filter((l) => l.tool === 'hairstyle' || l.tool === 'beard_style'),
  volume: looks.filter((l) => l.tool === 'hair_volume'),
  colour: looks.filter((l) => l.tool === 'hair_color' || l.tool === 'makeup_brows'),
  cover: [],
  hold: [],
};

/** The tool a look renders with. */
export function lookTool(id: string): RenderTool | undefined {
  return looksById[id]?.tool;
}
