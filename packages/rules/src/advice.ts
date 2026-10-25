import type { AdviceCode, ColourCode, Strategy, TemplateKey } from '@interim/types';
import type { Placed } from './placement';

/** One advice line for a card. `colours` is set on the colour lines, as swatches. */
export interface AdviceLine {
  code: AdviceCode;
  colours: ColourCode[];
}

/** What the advice rests on. All of it is already known by the time the card is composed. */
export interface AdviceInput {
  templateKey: TemplateKey;
  stage: string;
  /** The strategy the planner chose. */
  strategy: Strategy;
  /** What the stage was placed from. */
  basis: Placed['basis'];
  headCovering: boolean;
  /** The profile's body photo setting. */
  bodyPhotos: boolean;
  /** The newest reliable skin colour reading, as `#rrggbb`. */
  skinHex: string | undefined;
}

const line = (code: AdviceCode, colours: ColourCode[] = []): AdviceLine => ({ code, colours });

/**
 * The advice only this situation gives (docs/product/spec.md section 9). Plain code from the stage,
 * the strategy and what is known, so the model never writes it and a test can pin it. Each code
 * belongs to one situation, and a situation with nothing to say returns an empty list.
 */
export function templateAdvice(input: AdviceInput): AdviceLine[] {
  switch (input.templateKey) {
    case 'hair_patches':
      return patchesAdvice(input);
    case 'face_fullness':
      return fullnessAdvice(input);
    case 'after_surgery':
      return surgeryAdvice(input);
    case 'skin_colour':
      return skinAdvice(input);
    default:
      return [];
  }
}

function patchesAdvice({ strategy, basis, headCovering }: AdviceInput): AdviceLine[] {
  const lines: AdviceLine[] = [];
  // Density that is missing or unclear places the stage from the person's own report instead.
  if (basis === 'reported' || basis === 'previous') lines.push(line('patches_own_report'));
  if (strategy === 'part' && !headCovering) lines.push(line('patches_part'));
  if (strategy === 'brow') lines.push(line('patches_brow'));
  if (strategy === 'volume') lines.push(line('patches_volume'));
  return lines;
}

function fullnessAdvice({ strategy, stage }: AdviceInput): AdviceLine[] {
  if (strategy === 'neckline') {
    // A fitted collar waits with the other fitted pieces until the size has settled.
    return stage === 'usual' ? [line('fullness_neckline')] : [line('fullness_neckline'), line('fullness_collar')];
  }
  return strategy === 'frame' ? [line('fullness_frame')] : [];
}

function surgeryAdvice({ strategy, stage, bodyPhotos }: AdviceInput): AdviceLine[] {
  const lines: AdviceLine[] = [];
  if (!bodyPhotos) lines.push(line('surgery_photos_off'));
  if (strategy !== 'comfort') return lines;
  if (stage === 'settled') return [...lines, line('surgery_settled')];
  lines.push(line('surgery_soft'));
  lines.push(line(stage === 'recovering' ? 'surgery_front_opening' : 'surgery_relaxed_first'));
  return lines;
}

function skinAdvice({ strategy, stage, skinHex }: AdviceInput): AdviceLine[] {
  if (strategy !== 'match') return [];
  if (!skinHex) return [line('skin_match_unmeasured')];
  const palette = skinPalette(skinHex);
  const lines = [line('skin_match_clothes', palette.clothes), line('skin_match_makeup', palette.makeup)];
  // While the colour is changing, shades bought now may not match next month.
  if (stage === 'changing') lines.push(line('skin_match_recheck'));
  return lines;
}

type Depth = 'light' | 'medium' | 'deep';
type Undertone = 'cool' | 'neutral' | 'warm';

// Cool undertones sit well with blue based colours and warm ones with earth tones; neutral takes
// both. Deeper skin takes richer colours. A starting point to try near the face, not a rule.
const palettes: Record<Undertone, Record<Depth, { clothes: ColourCode[]; makeup: ColourCode[] }>> = {
  cool: {
    light: { clothes: ['navy', 'rose', 'plum'], makeup: ['rose', 'berry'] },
    medium: { clothes: ['teal', 'berry', 'navy'], makeup: ['berry', 'plum'] },
    deep: { clothes: ['cream', 'berry', 'teal'], makeup: ['plum', 'berry'] },
  },
  neutral: {
    light: { clothes: ['teal', 'plum', 'camel'], makeup: ['rose', 'coral'] },
    medium: { clothes: ['forest', 'rose', 'camel'], makeup: ['rose', 'rust'] },
    deep: { clothes: ['coral', 'cream', 'forest'], makeup: ['berry', 'rust'] },
  },
  warm: {
    light: { clothes: ['olive', 'camel', 'coral'], makeup: ['coral', 'rust'] },
    medium: { clothes: ['rust', 'olive', 'gold'], makeup: ['coral', 'rust'] },
    deep: { clothes: ['gold', 'rust', 'cream'], makeup: ['rust', 'berry'] },
  },
};

/**
 * Colours to try near the face, from a skin colour reading. Depth is the brightness of the colour
 * and undertone its hue, so the same reading always gives the same colours.
 */
export function skinPalette(hex: string): { clothes: ColourCode[]; makeup: ColourCode[] } {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  let depth: Depth = 'deep';
  if (brightness >= 140) depth = 'light';
  else if (brightness >= 95) depth = 'medium';
  // Hue in degrees: skin sits between red (0) and yellow (60), pinker below about 20 and yellower above about 28.
  const hue = (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
  let undertone: Undertone = 'neutral';
  if (hue < 20) undertone = 'cool';
  else if (hue > 28) undertone = 'warm';
  return palettes[undertone][depth];
}
