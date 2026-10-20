// docs/product/overview.md owns the rules; docs/product/spec.md section 13 describes the scan.
// User facing text must never contain these. Whole words only, so "health" is fine.
export const bannedWords = [
  'patient',
  'treatment',
  'diagnosis',
  'cure',
  'heal',
  'regrow',
] as const;

const pattern =
  /\b(patients?|treatments?|diagnos(?:is|es|e|ed|ing)|cures?|cured|curing|heal(?:s|ed|ing|er|ers)?|regrow(?:s|n|ing|th)?|regrew)\b/i;

export function findBannedWord(text: string): string | undefined {
  return pattern.exec(text)?.[0];
}
