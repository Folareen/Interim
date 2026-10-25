import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { modelTextProblem } from '@interim/rules';
import { messages } from '@interim/templates';
import { type Strategy, type YoucamMode, strategySchema } from '@interim/types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PLANNER_PROMPT_VERSION, type PlannerInput, plannerPrompt } from './prompts/planner.v2';

/** How the planner runs. `mode` follows the YouCam mode, and judge mode forces replay. */
export interface PlannerConfig {
  mode: YoucamMode;
  /** Recorded plans, `<dir>/<prompt version>-<input hash>.json`. */
  fixturesDir: string;
  /** Live model calls need `LIVE_CALLS_ENABLED` and a key; without them the planner falls back. */
  canCallModel: boolean;
}
export const PLANNER_CONFIG = Symbol('PLANNER_CONFIG');

/** Sends a prompt to the model and returns its text. Provided by the module so tests need no network. */
export type GenerateText = (prompt: string) => Promise<string>;
export const PLANNER_MODEL = Symbol('PLANNER_MODEL');

/** What the planner decided. `source` says whether a person could have read the model's own words. */
export interface Plan {
  strategy: Strategy;
  citation: string;
  note: string;
  source: 'model' | 'fixture' | 'fallback';
}

// Model output is untrusted input, so it is parsed like any other boundary (docs/typescript.md).
const outputSchema = z.object({ strategy: strategySchema, citation: z.string(), note: z.string() });
type Output = z.infer<typeof outputSchema>;

const MAX_SENTENCES = 3;
const MODEL_ATTEMPTS = 2;

/**
 * The model's part of a run: choose a strategy from the ones eligibility allows, cite the fact
 * behind it and write the companion note. Everything it returns is checked, and anything that
 * fails the checks twice is replaced with the fixed text for the person's tone (spec section 8).
 */
@Injectable()
export class Planner {
  private readonly log = new Logger(Planner.name);

  constructor(
    @Inject(PLANNER_CONFIG) private readonly config: PlannerConfig,
    @Inject(PLANNER_MODEL) private readonly generate: GenerateText,
  ) {}

  /** Plans one run. Never throws for a bad or missing model answer: that falls back to fixed text. */
  async plan(input: PlannerInput): Promise<Plan> {
    const key = plannerFixtureName(input).replace(/\.json$/, '');

    if (this.config.mode === 'replay') {
      const recorded = await this.readFixture(key);
      const output = recorded === undefined ? undefined : this.accept(recorded, input);
      return output ? { ...output, source: 'fixture' } : this.fixedPlan(input);
    }
    if (!this.config.canCallModel) return this.fixedPlan(input);

    for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
      const output = this.accept(parseJson(await this.generate(plannerPrompt(input))), input);
      if (!output) continue;
      if (this.config.mode === 'record') await this.writeFixture(key, output);
      return { ...output, source: 'model' };
    }
    return this.fixedPlan(input);
  }

  private accept(raw: unknown, input: PlannerInput): Output | undefined {
    const parsed = outputSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    const refs = new Set(input.facts.map((f) => f.ref));
    const { strategy, citation, note } = parsed.data;
    if (!input.strategies.includes(strategy) || !refs.has(citation)) return undefined;
    const problem = modelTextProblem(note, input.locale, refs, MAX_SENTENCES);
    if (problem) {
      this.log.warn(`Planner text refused: ${problem}`);
      return undefined;
    }
    return parsed.data;
  }

  /**
   * The plan used when the model cannot be used: the first allowed strategy and the fixed note for
   * the person's tone in their language. Also used when there is nothing to cite.
   */
  fixedPlan(input: PlannerInput): Plan {
    return {
      strategy: input.strategies[0] ?? 'hold',
      citation: input.facts[0]?.ref ?? '',
      note: messages[input.locale].companionFallback[input.tone],
      source: 'fallback',
    };
  }

  private async readFixture(key: string): Promise<unknown> {
    try {
      return parseJson(await readFile(path.join(this.config.fixturesDir, `${key}.json`), 'utf8'));
    } catch {
      // No recording is a normal case in replay: the run uses the fixed text instead of failing.
      return undefined;
    }
  }

  private async writeFixture(key: string, output: Output): Promise<void> {
    await mkdir(this.config.fixturesDir, { recursive: true });
    await writeFile(path.join(this.config.fixturesDir, `${key}.json`), `${JSON.stringify(output, null, 2)}\n`);
  }
}

/** Parses model text as JSON, tolerating a code fence around it. Anything else is treated as no answer. */
function parseJson(text: string): unknown {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** The file name a plan is recorded under, so fixtures can be written for a known input. */
export function plannerFixtureName(input: PlannerInput): string {
  return `${PLANNER_PROMPT_VERSION}-${createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16)}.json`;
}
