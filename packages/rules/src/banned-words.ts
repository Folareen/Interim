import type { LiveLocale } from '@interim/types';
import { foldMarks, wholeWords } from './whole-words';

// Whole words only, so "health" is fine. The patterns are written without accents or tone marks,
// because the text is folded the same way before matching. docs/product/overview.md owns the rules.

/** The banned words per language, as the planner prompt lists them. */
export const bannedWords: Record<LiveLocale, readonly string[]> = {
  en: ['patient', 'treatment', 'diagnosis', 'cure', 'heal', 'regrow'],
  fr: ['patient', 'traitement', 'diagnostic', 'guérir', 'guérison', 'repousse'],
  es: ['paciente', 'tratamiento', 'diagnóstico', 'curar', 'sanar', 'rebrote'],
  it: ['paziente', 'trattamento', 'diagnosi', 'guarire', 'guarigione', 'ricrescita'],
  pt: ['paciente', 'tratamento', 'diagnóstico', 'cura', 'curar', 'rebrote'],
  sw: ['mgonjwa', 'matibabu', 'utambuzi', 'tiba', 'kuponya', 'kumea tena'],
  ha: ['majiyyaci', 'jiyya', 'ganewar asali', 'warkewa', 'warkar'],
  yo: ['aláìsàn', 'ìtọ́jú', 'ìwádìí àrùn', 'ìwòsàn', 'hù padà'],
  ig: ['onye ọrịa', 'ọgwụgwọ', 'nchọpụta ọrịa', 'gwọọ', 'too ọzọ'],
  pcm: ['patient', 'treatment', 'diagnosis', 'cure', 'heal', 'regrow'],
};

const english = [
  'patients?',
  'treatments?',
  'diagnos(?:is|es|e|ed|ing)',
  'cures?',
  'cured',
  'curing',
  'heal(?:s|ed|ing|er|ers)?',
  'regrow(?:s|n|ing|th)?',
  'regrew',
];

// The words above with their usual inflections.
const patterns: Record<LiveLocale, RegExp> = {
  en: wholeWords(english),
  fr: wholeWords(['patient(?:e|es|s)?', 'traitements?', 'diagnostics?', 'diagnostiqu(?:e|es|er|ent)', 'gueri(?:r|e|es|s|t|ssent)', 'guerisons?', 'remedes?', 'repouss(?:e|es|er|ent)']),
  es: wholeWords(['pacientes?', 'tratamientos?', 'diagnostic(?:o|os|ar|ado|ada)', 'cur(?:a|as|ar|ado|ada|acion)', 'sanar', 'sanado', 'sanacion', 'rebrot(?:e|es|ar|a)', 'recrec(?:er|e|imiento)']),
  it: wholeWords(['pazient(?:e|i)', 'trattament(?:o|i)', 'diagnos(?:i|tic(?:o|are|a|ato))', 'guar(?:ire|igione|ito)', 'ricresc(?:ita|ere|e)']),
  pt: wholeWords(['pacientes?', 'tratamentos?', 'diagnostic(?:o|os|ar|ado)', 'cur(?:a|as|ar|ado|ada)', 'sarar', 'rebrot(?:e|ar|a)', 'recresc(?:er|imento|e)']),
  sw: wholeWords(['mgonjwa', 'wagonjwa', 'matibabu', 'tiba', 'kutibu', 'utambuzi', 'kuponya', 'kupona', 'uponyaji', 'kumea tena']),
  ha: wholeWords(['majiyyaci', 'majinyata', 'jiyya', 'ganewar asali', 'warke', 'warkewa', 'warkar', 'warkarwa', 'sake tohowa']),
  yo: wholeWords(['alaisan', 'itoju', 'iwadii aisan', 'iwosan', 'wosan', 'hu pada']),
  ig: wholeWords(['onye oria', 'ogwugwo', 'nchoputa oria', 'gwoo', 'too ozo']),
  // Pidgin borrows these words from English.
  pcm: wholeWords(english),
};

/** Finds the first banned word in user facing text in that language, or undefined when it is clean. */
export function findBannedWord(text: string, locale: LiveLocale): string | undefined {
  return patterns[locale].exec(foldMarks(text))?.[0];
}
