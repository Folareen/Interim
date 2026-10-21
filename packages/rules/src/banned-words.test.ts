import { describe, expect, it } from 'vitest';
import { findBannedWord } from './banned-words';

describe('findBannedWord', () => {
  it('flags banned words', () => {
    expect(findBannedWord('A new treatment plan', 'en')).toBe('treatment');
    expect(findBannedWord('Helps hair regrow', 'en')).toBe('regrow');
    expect(findBannedWord('Hair is regrowing', 'en')).toBe('regrowing');
    expect(findBannedWord('It will Heal', 'en')).toBe('Heal');
  });

  it('passes clean copy', () => {
    expect(findBannedWord('Your stage card is ready', 'en')).toBeUndefined();
    expect(findBannedWord('Ask a professional about health questions', 'en')).toBeUndefined();
    expect(findBannedWord('Keep your account secure', 'en')).toBeUndefined();
    expect(findBannedWord('stage: growing_in', 'en')).toBeUndefined();
  });
});

describe('findBannedWord in other languages', () => {
  it.each([
    ['fr', 'Un nouveau traitement', 'traitement'],
    ['es', 'Un tratamiento nuevo', 'tratamiento'],
    ['it', 'Un nuovo trattamento', 'trattamento'],
    ['pt', 'Um novo tratamento', 'tratamento'],
    ['sw', 'Matibabu mapya', 'Matibabu'],
    ['ha', 'Sabon jiyya', 'jiyya'],
    ['yo', 'Ìtọ́jú tuntun', 'Itoju'],
    ['ig', 'Ọgwụgwọ ọhụrụ', 'Ogwugwo'],
    ['pcm', 'New treatment', 'treatment'],
  ] as const)('%s flags "%s"', (locale, text, found) => {
    expect(findBannedWord(text, locale)).toBe(found);
  });

  it('ignores accents, so a word typed without them is still caught', () => {
    expect(findBannedWord('traitement', 'fr')).toBe('traitement');
    expect(findBannedWord('tratamiento', 'es')).toBe('tratamiento');
  });

  it('passes clean text in each language', () => {
    expect(findBannedWord('Votre carte est prête', 'fr')).toBeUndefined();
    expect(findBannedWord('Tu tarjeta está lista', 'es')).toBeUndefined();
    expect(findBannedWord('Ìkàn rẹ ti ṣetán', 'yo')).toBeUndefined();
  });
});

