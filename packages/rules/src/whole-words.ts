// JavaScript's \b only knows ASCII letters, so it splits words at letters such as ẹ, ọ or ń.
// Letters and combining marks from any script count as part of a word here.
const letter = '[\\p{L}\\p{M}]';

/** Builds a case insensitive pattern that matches any of the alternatives as whole words. */
export function wholeWords(alternatives: readonly string[]): RegExp {
  return new RegExp(`(?<!${letter})(?:${alternatives.join('|')})(?!${letter})`, 'iu');
}

/**
 * Removes accents and tone marks, so a phrase matches whether or not the writer typed them. The
 * word lists are written without marks to match.
 */
export function foldMarks(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}
