import { bannedWords } from '@interim/rules';
import type { LiveLocale, Moment, Strategy, TemplateKey, Tone } from '@interim/types';

/** Bump when the prompt changes, so recorded plans from an older prompt are not replayed (docs/llm.md). */
export const PLANNER_PROMPT_VERSION = 'planner-v2';

/** One fact the planner may cite. It never carries a number: `term` is English words, `direction` is relative to the person's own baseline. */
export interface PlannerFact {
  ref: string;
  /** What kind of reading it is, in words. */
  about: string;
  term: string | null;
  direction: 'lower' | 'similar' | 'higher' | null;
}

/**
 * Everything the model receives. No photos, no words for today set, no head covering setting and
 * no reflection text (docs/product/spec.md section 8, planner rules).
 */
export interface PlannerInput {
  templateKey: TemplateKey;
  stage: string;
  previousStage: string | null;
  facts: PlannerFact[];
  moment: Moment | null;
  tone: Tone;
  locale: LiveLocale;
  strategies: Strategy[];
}

const toneGuide: Record<Tone, string> = {
  practical: 'Practical: say what changed and the one step. Skip feelings language.',
  warm: 'Warm: gentle and kind, in plain words.',
  light: 'Light: a little playful, never flippant about the change.',
};

// What each strategy means, so the model chooses among the ones this situation offers and never invents one.
const strategyGuide: Record<Strategy, string> = {
  cut: 'a different cut or style, shown as previews',
  volume: 'a fuller look, shown as previews',
  colour: 'a touch of colour, shown as previews',
  brow: 'a softer brow colour, shown as previews',
  part: 'a parting in a new place',
  neckline: 'necklines that suit a changing face, with size from what the person reported',
  frame: 'glasses frames for a changing face',
  comfort: 'soft, loose and easy to wear clothes first',
  match: 'colours for clothes and makeup from the skin colour reading',
  cover: 'a covering',
  hold: 'change nothing for now',
};

/** Builds the planner prompt. The banned words come from `@interim/rules`, so the prompt and the scan never drift apart. */
export function plannerPrompt(input: PlannerInput): string {
  const facts = input.facts
    .map((f) => `- ${f.ref}: ${f.about}${f.term ? `, ${f.term}` : ''}${f.direction ? `, ${f.direction} than their own baseline` : ''}`)
    .join('\n');
  const banned = [...new Set([...bannedWords.en, ...bannedWords[input.locale]])].join(', ');
  return `You help choose one look strategy and write one short note for Interim, a companion for adults whose appearance is changing.

Reply with JSON only, no other text: {"strategy": <one of the allowed strategies>, "citation": <the ref of the fact that supports the choice>, "note": <the note>}

The note:
- is written in the language with code "${input.locale}";
- has at most three sentences, in this order: what you notice in plain visual terms, that this is common at this stage with no cause named, and one small thing to do for the person's next moment;
- tone: ${toneGuide[input.tone]};
- never contains a digit or a number word. To mention a fact, write its placeholder exactly as shown, such as {m:m1}, and the app fills it in;
- never names a cause, a medicine, an illness or any health finding;
- never uses these words: ${banned};
- never uses forced positivity ("stay positive", "you've got this") or battle language ("fight", "battle", "brave").

Situation: ${input.templateKey}
Stage: ${input.stage}${input.previousStage ? ` (was ${input.previousStage})` : ''}
Next moment: ${input.moment ?? 'none given'}
Facts:
${facts}
Allowed strategies:
${input.strategies.map((s) => `- ${s}: ${strategyGuide[s]}`).join('\n')}`;
}
