import type { RenderTool, Strategy } from '@interim/types';

/**
 * One preview the agent can render. The API turns it into the tool's request, so a look is data
 * and a template is configuration (docs/product/spec.md section 4). Styles are offered to everyone;
 * nothing asks for gender (spec section 17, item 7).
 */
export type Look =
  | { id: string; tool: 'hairstyle'; templateId: string }
  | { id: string; tool: 'hair_volume'; templateId: string }
  | { id: string; tool: 'hair_color'; preset: 'Jet Black' | 'Chocolate Brown' | 'Honey Blonde' | 'Ash Gray' | 'Copper Red' }
  | { id: string; tool: 'makeup_brows'; color: string };

// Only ids that succeeded in the spike are listed (docs/integrations/youcam.md, Observed live).
// More come from YouCam's template lists, which are free to read but need a live call. Beard style
// has no confirmed id yet, so the beard template does not offer it.
const looks: readonly Look[] = [
  { id: 'style_short_curly', tool: 'hairstyle', templateId: 'male_short_curly' },
  { id: 'style_blunt_bob', tool: 'hairstyle', templateId: 'female_blunt_bob' },
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
  cut: looks.filter((l) => l.tool === 'hairstyle'),
  volume: looks.filter((l) => l.tool === 'hair_volume'),
  colour: looks.filter((l) => l.tool === 'hair_color' || l.tool === 'makeup_brows'),
  cover: [],
  hold: [],
};

/** The tool a look renders with. */
export function lookTool(id: string): RenderTool | undefined {
  return looksById[id]?.tool;
}
