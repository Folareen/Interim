// docs/product/overview.md (Language and safety rules) owns these; spec section 13 describes the scan.
// Forced positivity, battle and journey framing, and talking about an earlier look as better.
// Runs beside findBannedWord on companion text, what to say lines and the words for today library.
const apostrophe = "['’]?";
const pattern = new RegExp(
  [
    'stay positive',
    'think positive',
    'be strong',
    'stay strong',
    `you${apostrophe}ve got this`,
    'you got this',
    'everything happens for a reason',
    'bright side',
    'silver lining',
    'at least you',
    'fight(?:s|ing|er|ers)?',
    'fought',
    'battl(?:e|es|ed|ing)',
    'beat(?:s|ing|en)?',
    'warriors?',
    'survivors?',
    'conquer(?:s|ed|ing)?',
    'journeys?',
    'old self',
    'back to normal',
    'used to look',
  ]
    .map((phrase) => `\\b${phrase}\\b`)
    .join('|'),
  'i',
);

/** Finds the first companion phrase in user facing text, or undefined when the text is clean. */
export function findCompanionPhrase(text: string): string | undefined {
  return pattern.exec(text)?.[0];
}
