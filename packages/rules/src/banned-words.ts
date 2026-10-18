// docs/product/spec.md section 13. User facing text must never contain these.
export const bannedWords = [
  'patient',
  'treatment',
  'diagnosis',
  'cure',
  'heal',
  'regrow',
] as const;

const pattern = new RegExp(`\\b(${bannedWords.join('|')})\\w*`, 'i');

export function findBannedWord(text: string): string | undefined {
  return pattern.exec(text)?.[0];
}
