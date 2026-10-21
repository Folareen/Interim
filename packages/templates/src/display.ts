import type { LiveLocale, MeasuredValue } from '@interim/types';
import { messages } from './copy';

type DensityKey = keyof (typeof messages)['en']['terms']['density'];
type LengthKey = keyof (typeof messages)['en']['terms']['length'];

// YouCam's own wording. The docs spell the first density grade "Extremely"; the live API says "Extreme".
const densityKeys: Record<string, DensityKey> = {
  'Extreme Low Density': 'extremeLow',
  'Extremely Low Density': 'extremeLow',
  'Low Density': 'low',
  'Medium Density': 'medium',
  'High Density': 'high',
};

const lengthKeys: Record<string, LengthKey> = {
  'above the ears': 'aboveEars',
  'ear length': 'earLength',
  'ear length or longer': 'earLengthOrLonger',
  'short hair': 'short',
  'short hair or longer': 'shortOrLonger',
  'above chest': 'aboveChest',
  'above chest or longer': 'aboveChestOrLonger',
  'long hair': 'long',
};

/**
 * How a measured or reported value reads in the person's language. Code writes every term, number
 * and size on a card, so a figure always comes from a record and never from model text.
 * @throws Error for a term YouCam adds later, rather than showing an untranslated word.
 */
export function measuredValueText(value: MeasuredValue, locale: LiveLocale): string {
  const { terms } = messages[locale];
  switch (value.kind) {
    case 'density': {
      const key = densityKeys[value.term];
      if (!key) throw new Error(`Unknown density term: ${value.term}`);
      return terms.density[key];
    }
    case 'length': {
      const key = lengthKeys[value.term];
      if (!key) throw new Error(`Unknown length term: ${value.term}`);
      return terms.length[key];
    }
    case 'hair_type':
    case 'face_shape':
      return value.term;
    case 'face_ratio':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value.ratio);
    case 'skin_colour':
      return value.hex;
    case 'reported_size':
      return terms.size.replace('{size}', value.size);
    case 'reported_change':
      return terms.change[value.changed];
  }
}
