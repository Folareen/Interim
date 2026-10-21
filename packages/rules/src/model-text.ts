import type { LiveLocale } from '@interim/types';
import { findBannedWord } from './banned-words';
import { findCompanionPhrase } from './companion-language';
import { foldMarks, wholeWords } from './whole-words';

/** Why model text was refused (docs/product/spec.md sections 8 and 13). */
export type ModelTextProblem =
  | 'empty'
  | 'too_long'
  | 'digit'
  | 'number_word'
  | 'unknown_placeholder'
  | 'banned_word'
  | 'companion_phrase';

// Number words, written without accents because the text is folded first. Words that are also
// common everyday words (English "one", Italian "sei", Yoruba "kan", Portuguese "um") are left out:
// the risk is an invented figure, which numerals and larger numbers carry. Draft lists outside
// English wait for a native speaker's check (spec section 17, item 9).
const english = [
  'zero', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty',
  'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand', 'million', 'dozen',
];

const numberWords: Record<LiveLocale, RegExp> = {
  en: wholeWords(english),
  fr: wholeWords(['zero', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'cent', 'mille', 'million']),
  es: wholeWords(['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa', 'cien', 'ciento', 'mil', 'millon']),
  it: wholeWords(['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'cento', 'mille', 'milione']),
  pt: wholeWords(['zero', 'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'cem', 'mil', 'milhao']),
  sw: wholeWords(['sifuri', 'moja', 'mbili', 'tatu', 'nne', 'tano', 'sita', 'saba', 'nane', 'tisa', 'kumi', 'ishirini', 'thelathini', 'arobaini', 'hamsini', 'sitini', 'sabini', 'themanini', 'tisini', 'mia', 'elfu']),
  ha: wholeWords(['daya', 'biyu', 'uku', 'hudu', 'biyar', 'shida', 'bakwai', 'takwas', 'tara', 'goma', 'ashirin', 'talatin', 'arba.?in', 'hamsin', 'sittin', 'saba.?in', 'tamanin', 'casa.?in', 'dari', 'dubu']),
  yo: wholeWords(['eji', 'eta', 'erin', 'arun', 'efa', 'eje', 'ejo', 'esan', 'ewa', 'ogun', 'ogbon', 'ogoji', 'aadota', 'ogota', 'aadorin', 'ogorin', 'aadosan', 'ogorun', 'egberun']),
  ig: wholeWords(['abuo', 'ato', 'ano', 'ise', 'isii', 'asaa', 'asato', 'itoolu', 'iri', 'ohu', 'puku']),
  pcm: wholeWords(english),
};

const placeholder = /\{m:([^{}]*)\}/g;

/**
 * Checks text a model wrote before it reaches a person: no digit and no number word, only
 * `{m:<id>}` placeholders that name a known measurement, no banned word or companion phrase, and
 * no more than `maxSentences` sentences. Code fills each placeholder in after this check.
 * @returns What is wrong, or undefined when the text may be used.
 */
export function modelTextProblem(
  text: string,
  locale: LiveLocale,
  knownIds: ReadonlySet<string>,
  maxSentences: number,
): ModelTextProblem | undefined {
  if (text.trim() === '') return 'empty';
  let unknown = false;
  const bare = text.replace(placeholder, (_, id: string) => {
    if (!knownIds.has(id)) unknown = true;
    return ' ';
  });
  if (unknown || /[{}]/.test(bare)) return 'unknown_placeholder';
  if (/\p{N}/u.test(bare)) return 'digit';
  if (numberWords[locale].test(foldMarks(bare))) return 'number_word';
  if (findBannedWord(bare, locale)) return 'banned_word';
  if (findCompanionPhrase(bare, locale)) return 'companion_phrase';
  const sentences = bare.split(/[.!?…。]+(?:\s+|$)/u).filter((part) => part.trim() !== '');
  if (sentences.length > maxSentences) return 'too_long';
  return undefined;
}
