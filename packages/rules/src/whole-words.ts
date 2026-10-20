// JavaScript's \b only knows ASCII letters, so it splits words at letters such as ẹ, ọ or ń.
// Letters and combining marks from any script count as part of a word here.
const letter = '[\\p{L}\\p{M}]';

/** Builds a case insensitive pattern that matches any of the alternatives as whole words. */
export function wholeWords(alternatives: readonly string[]): RegExp {
  return new RegExp(`(?<!${letter})(?:${alternatives.join('|')})(?!${letter})`, 'iu');
}
