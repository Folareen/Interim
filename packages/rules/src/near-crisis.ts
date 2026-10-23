import type { LiveLocale } from '@interim/types';
import { soundsLikeCrisis } from './distress';
import { foldMarks, wholeWords } from './whole-words';

// The exact check in distress.ts decides when the screen is replaced. This one is looser and only
// flags (docs/product/spec.md section 13): a hit is saved and a model reads it, so a false hit
// costs one model call and a gap in the exact lists is not the last line of defence. Written
// without accents or tone marks because the text is folded before matching.
const tail = '\\p{L}*';
const signals: Record<LiveLocale, RegExp> = {
  en: wholeWords([
    'die', 'dies', 'died', 'dying', 'dead', 'death', `kill${tail}`, `suicid${tail}`, `overdos${tail}`, `hopeless${tail}`, `worthless${tail}`,
    'no point', 'pointless', `what(?: is|['’]?s) the point`, 'give up', 'giving up', 'disappear', 'end it', 'ending it', 'burden', 'harm', 'harming', 'harmed',
    'tired of (?:living|life|everything)', 'nothing matters', 'no one would miss', 'not be here', 'cannot take', `can['’]?t take it`,
  ]),
  fr: wholeWords([`mour${tail}`, 'mort', 'morte', `tuer`, `suicid${tail}`, `desesper${tail}`, 'sans espoir', 'a quoi bon', 'disparaitre', 'abandonner', 'faire du mal', 'fardeau', 'plus envie de vivre', 'en finir', 'finir avec tout']),
  es: wholeWords([`mori${tail}`, 'muerto', 'muerta', 'muerte', `matar${tail}`, `suicid${tail}`, 'sin esperanza', `desesper${tail}`, 'no vale la pena', 'desaparecer', 'rendirme', 'hacerme dano', 'carga', 'no puedo mas', 'acabar con']),
  it: wholeWords([`mori${tail}`, 'morto', 'morta', 'morte', `uccid${tail}`, `suicid${tail}`, 'senza speranza', `disperat${tail}`, 'non ha senso', 'sparire', 'arrendermi', 'farmi del male', 'peso', 'non ce la faccio', 'finirla']),
  pt: wholeWords([`morr${tail}`, 'morto', 'morta', 'morte', 'matar', `suicid${tail}`, 'sem esperanca', `desesper${tail}`, 'nao vale a pena', 'desaparecer', 'desistir', 'me machucar', 'fardo', 'nao aguento', 'acabar com']),
  sw: wholeWords(['kufa', 'nife', 'kifo', 'kuua', `kujiua${tail}`, 'kujidhuru', 'kujiumiza', 'hakuna maana', 'nimechoka kuishi', 'sina matumaini', 'kujitoa uhai', 'mzigo', 'siwezi tena']),
  ha: wholeWords([`mutu${tail}`, `kash${tail}`, 'gajiya da rayuwa', 'ba ni da bege', 'babu amfani', 'cutar da', 'zan bace', 'rayuwa ta kare']),
  yo: wholeWords(['iku', 'ainireti', 'ko wulo mo', 'agara', 'fe ku', 'n o fe ku', 'sa ku', 'pa ara', 'ge ara mi', 'ko si ireti']),
  ig: wholeWords(['onwu', 'nwuo', 'igbu', 'gbuo', 'ike agwula', 'enweghi olile anya', 'enweghi uru', 'meru onwe', 'ndu adighi mma']),
  pcm: wholeWords(['die', 'dies', 'died', 'dead', 'death', `kill${tail}`, 'suicide', 'no get hope', 'hopeless', 'tire for life', 'wan disappear', 'make i die', 'no get reason', 'pain myself']),
};

// Single words from the exact lists, for spelling slips such as "sucide" or "sueside".
const spelled: Record<LiveLocale, readonly string[]> = {
  en: ['suicide', 'suicidal', 'overdose', 'selfharm', 'hopeless', 'worthless'],
  fr: ['suicide', 'suicidaire', 'mourir', 'desespere'],
  es: ['suicidio', 'suicidarme', 'matarme', 'morir', 'desesperada'],
  it: ['suicidio', 'uccidermi', 'morire', 'disperato'],
  pt: ['suicidio', 'morrer', 'desesperado', 'automutilacao'],
  sw: ['kujiua', 'kujidhuru', 'kujiumiza'],
  ha: ['mutuwa', 'kashe'],
  yo: ['ainireti'],
  ig: ['nwuo', 'gbuo'],
  pcm: ['suicide', 'hopeless'],
};

/** Edit distance counting a swap of two neighbouring letters as one slip. */
function slips(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  const first = rows[0];
  if (!first) return Math.max(a.length, b.length);
  for (let j = 1; j <= b.length; j++) first[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const row = rows[i];
    const above = rows[i - 1];
    if (!row || !above) continue;
    for (let j = 1; j <= b.length; j++) {
      const same = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((above[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (above[j - 1] ?? 0) + same);
      const twoAbove = rows[i - 2];
      if (twoAbove && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] ?? 0, (twoAbove[j - 2] ?? 0) + 1);
      }
    }
  }
  return rows[a.length]?.[b.length] ?? 0;
}

function isNearSpelling(word: string, term: string): boolean {
  if (word.length < 5 || Math.abs(word.length - term.length) > 2) return false;
  return slips(word, term) <= (term.length >= 9 ? 2 : 1);
}

/** How strongly text points to a crisis: `match` replaces the screen, `near` is saved and reviewed. */
export type CrisisCheck = 'match' | 'near' | 'none';

/**
 * Checks text in the person's language and in English, because people mix languages. An exact
 * phrase is a `match`; a looser sign or a likely misspelling is `near`.
 */
export function crisisCheck(text: string, locale: LiveLocale): CrisisCheck {
  if (soundsLikeCrisis(text, locale)) return 'match';
  const folded = foldMarks(text);
  if (signals[locale].test(folded) || signals.en.test(folded)) return 'near';
  const words = folded.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const terms = [...spelled[locale], ...spelled.en];
  return words.some((word) => terms.some((term) => isNearSpelling(word, term))) ? 'near' : 'none';
}
