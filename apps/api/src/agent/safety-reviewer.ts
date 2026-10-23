import { type LiveLocale } from '@interim/types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PLANNER_CONFIG, PLANNER_MODEL, type GenerateText, type PlannerConfig } from './planner';
import { safetyPrompt } from './prompts/safety.v1';

/** What the model made of a flagged reflection. */
export type SafetyVerdict = 'concern' | 'clear' | 'unsure';

// Model output is untrusted input, so it is parsed like any other boundary (docs/typescript.md).
const outputSchema = z.object({ verdict: z.enum(['concern', 'clear', 'unsure']) });

/**
 * The model's part of the safety review (docs/llm.md, Safety review). It sees the flagged text and
 * its language and nothing else, and answers with a verdict. Anything but a clean answer is
 * `unsure`, which keeps the contacts showing, so a failure can never lower a flag.
 */
@Injectable()
export class SafetyReviewer {
  private readonly log = new Logger(SafetyReviewer.name);

  constructor(
    @Inject(PLANNER_CONFIG) private readonly config: PlannerConfig,
    @Inject(PLANNER_MODEL) private readonly generate: GenerateText,
  ) {}

  /** Reviews one reflection. Replay mode and a missing key answer `unsure` without calling the model. */
  async review(text: string, locale: LiveLocale): Promise<SafetyVerdict> {
    // A recording would keep the person's words in the repo, so there are no fixtures for this.
    if (this.config.mode === 'replay' || !this.config.canCallModel) return 'unsure';
    try {
      const body = (await this.generate(safetyPrompt(text, locale))).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = outputSchema.safeParse(JSON.parse(body));
      return parsed.success ? parsed.data.verdict : 'unsure';
    } catch (error) {
      this.log.warn(`Safety review failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return 'unsure';
    }
  }
}
