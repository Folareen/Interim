import type { LiveLocale } from '@interim/types';
import { foldMarks, wholeWords } from './whole-words';

// Plain code, never the model (docs/product/spec.md section 13): the device runs this on reflection
// text and a match replaces the screen with crisis contacts. It errs towards matching, since a
// false match costs one screen and a missed one costs far more. Patterns are written without
// accents or tone marks because the text is folded before matching. Every list except English is a
// draft until a native speaker has checked it, and reflection must not ship in a language before then.
const apostrophe = "['’]?";
const patterns: Record<LiveLocale, RegExp> = {
  en: wholeWords([
    'suicid(?:e|al)',
    'kill(?:ing)? myself',
    'end(?:ing)? my life',
    'end it all',
    'take my (?:own )?life',
    'want(?:ed)? to die',
    'wanna die',
    'better off dead',
    'better off without me',
    'no reason to live',
    `don${apostrophe}t want to (?:be here|live|wake up)`,
    `can${apostrophe}t go on`,
    'self[- ]?harm(?:ing)?',
    'hurt(?:ing)? myself',
    'cut(?:ting)? myself',
  ]),
  fr: wholeWords(['suicid(?:e|er|aire)', 'me tuer', 'mettre fin a (?:mes jours|ma vie)', 'en finir', 'veux mourir', 'voudrais mourir', 'ne veux plus vivre', 'mieux sans moi', 'mieux mort(?:e)?', 'me faire du mal', 'me blesser', 'automutilation', 'ne peux plus continuer', 'ne peux plus']),
  es: wholeWords(['suicid(?:io|arme|ar)', 'quitarme la vida', 'matarme', 'acabar con mi vida', 'acabar con todo', 'quiero morir', 'quisiera morir', 'no quiero vivir', 'mejor sin mi', 'mejor muert(?:o|a)', 'hacerme dano', 'autolesion(?:arme|es)?', 'no puedo mas', 'no puedo seguir']),
  it: wholeWords(['suicid(?:io|armi|arsi)', 'uccidermi', 'togliermi la vita', 'farla finita', 'voglio morire', 'vorrei morire', 'non voglio vivere', 'meglio senza di me', 'farmi del male', 'autolesionismo', 'non ce la faccio piu']),
  pt: wholeWords(['suicid(?:io|ar)', 'me matar', 'tirar a minha vida', 'acabar com tudo', 'quero morrer', 'nao quero viver', 'melhor sem mim', 'me machucar', 'me ferir', 'automutilacao', 'nao aguento mais']),
  sw: wholeWords(['kujiua', 'kujiua mwenyewe', 'nataka kufa', 'sitaki kuishi', 'bora nife', 'bora bila mimi', 'kujidhuru', 'kujiumiza', 'siwezi kuendelea']),
  ha: wholeWords(['kashe kaina', 'kashe kaina da kaina', 'ina son mutuwa', 'ba na son rayuwa', 'ba na so in rayu', 'ya fi kyau idan na mutu', 'cutar da kaina', 'ba zan iya ci gaba ba']),
  yo: wholeWords(['pa ara mi', 'mo fe ku', 'n o fe gbe', 'ko dara ki n wa laaye', 'ba ara mi je', 'ko ye mi mo', 'ara mi ni ki n pa']),
  ig: wholeWords(['igbu onwe m', 'gbuo onwe m', 'ana m acho ime ka m nwuo', 'achoghi m ibi ndu', 'ime onwe m ahu ahu', 'enweghi m ike iga n ihu']),
  pcm: wholeWords(['suicide', 'kill myself', 'wan die', 'wan kill myself', 'no wan live', 'i no wan dey again', 'end my life', 'hurt myself', 'i no fit continue', 'i no fit again']),
};

/**
 * Whether text suggests crisis or self-harm, so the app shows crisis contacts before anything else.
 * English is always checked as well, because people mix languages when they write.
 */
export function soundsLikeCrisis(text: string, locale: LiveLocale): boolean {
  const folded = foldMarks(text);
  return patterns[locale].test(folded) || patterns.en.test(folded);
}

/** Regions with their own crisis contacts. `other` points to a directory. */
export type CrisisRegion = 'us' | 'ca' | 'gb' | 'ie' | 'au' | 'other';

/** How a crisis service is reached. The wording for each is in `crisisWording`. */
export type CrisisHow = 'callOrText' | 'callFree' | 'call' | 'directory';

/** One crisis service. `phone` is null for a directory that lists services instead. */
export interface CrisisContact {
  name: string;
  phone: string | null;
  how: CrisisHow;
  url: string;
}

// Check each entry against the official service before launch.
/** Crisis contacts per region. `other` points to a directory of helplines by country. */
export const crisisContacts: Record<CrisisRegion, readonly CrisisContact[]> = {
  us: [{ name: '988 Suicide & Crisis Lifeline', phone: '988', how: 'callOrText', url: 'https://988lifeline.org' }],
  ca: [{ name: '9-8-8 Suicide Crisis Helpline', phone: '988', how: 'callOrText', url: 'https://988.ca' }],
  gb: [{ name: 'Samaritans', phone: '116 123', how: 'callFree', url: 'https://www.samaritans.org' }],
  ie: [{ name: 'Samaritans', phone: '116 123', how: 'callFree', url: 'https://www.samaritans.org/ireland' }],
  au: [{ name: 'Lifeline', phone: '13 11 14', how: 'call', url: 'https://www.lifeline.org.au' }],
  other: [{ name: 'Find A Helpline', phone: null, how: 'directory', url: 'https://findahelpline.com' }],
};

/** What to say about reaching a service, per language. `{number}` is the service's phone number. */
export const crisisWording: Record<LiveLocale, Record<CrisisHow, string>> = {
  en: { callOrText: 'Call or text {number}, any time.', callFree: 'Call {number} free, any time.', call: 'Call {number}, any time.', directory: 'Find a free, confidential helpline in your country.' },
  fr: { callOrText: 'Appelez ou envoyez un SMS au {number}, à toute heure.', callFree: 'Appelez le {number}, gratuit, à toute heure.', call: 'Appelez le {number}, à toute heure.', directory: 'Trouvez une ligne d’écoute gratuite et confidentielle dans votre pays.' },
  es: { callOrText: 'Llame o envíe un mensaje al {number}, a cualquier hora.', callFree: 'Llame al {number}, gratis, a cualquier hora.', call: 'Llame al {number}, a cualquier hora.', directory: 'Encuentre una línea de ayuda gratuita y confidencial en su país.' },
  it: { callOrText: 'Chiama o scrivi al {number}, a qualsiasi ora.', callFree: 'Chiama il {number}, gratis, a qualsiasi ora.', call: 'Chiama il {number}, a qualsiasi ora.', directory: 'Trova una linea di ascolto gratuita e riservata nel tuo paese.' },
  pt: { callOrText: 'Ligue ou envie uma mensagem para {number}, a qualquer hora.', callFree: 'Ligue para {number}, grátis, a qualquer hora.', call: 'Ligue para {number}, a qualquer hora.', directory: 'Encontre uma linha de apoio gratuita e confidencial no seu país.' },
  sw: { callOrText: 'Piga simu au tuma ujumbe kwa {number}, wakati wowote.', callFree: 'Piga {number} bila malipo, wakati wowote.', call: 'Piga {number}, wakati wowote.', directory: 'Pata namba ya msaada ya bure na ya siri katika nchi yako.' },
  ha: { callOrText: 'Kira ko aika saƙo zuwa {number}, a kowane lokaci.', callFree: 'Kira {number} kyauta, a kowane lokaci.', call: 'Kira {number}, a kowane lokaci.', directory: 'Nemi layin taimako na kyauta kuma na sirri a ƙasarku.' },
  yo: { callOrText: 'Pe tàbí fi ránṣẹ́ sí {number}, nígbàkúgbà.', callFree: 'Pe {number} lọ́fẹ̀ẹ́, nígbàkúgbà.', call: 'Pe {number}, nígbàkúgbà.', directory: 'Wá ìlà ìrànlọ́wọ́ àìsan-owó àti àṣírí ní orílẹ̀-èdè rẹ.' },
  ig: { callOrText: 'Kpọọ ma ọ bụ zipu ozi na {number}, n’oge ọ bụla.', callFree: 'Kpọọ {number} n’efu, n’oge ọ bụla.', call: 'Kpọọ {number}, n’oge ọ bụla.', directory: 'Chọta ahịrị enyemaka n’efu na nke nzuzo n’obodo gị.' },
  pcm: { callOrText: 'Call or text {number}, any time.', callFree: 'Call {number} free, any time.', call: 'Call {number}, any time.', directory: 'Find helpline wey no go cost you and wey dey private for your country.' },
};

const regions: Record<string, CrisisRegion> = { US: 'us', CA: 'ca', GB: 'gb', UK: 'gb', IE: 'ie', AU: 'au' };

/**
 * Picks the crisis region from a BCP 47 locale such as `navigator.language`. An unknown or missing
 * region falls back to the directory.
 * @example crisisRegionFor('en-GB') // 'gb'
 */
export function crisisRegionFor(locale: string): CrisisRegion {
  const region = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(locale)?.[1]?.toUpperCase();
  return (region && regions[region]) || 'other';
}
