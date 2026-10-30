import path from 'node:path';
import { google } from '@ai-sdk/google';
import { Module } from '@nestjs/common';
import { generateText } from 'ai';
import { env } from '../config/env';
import { PLANNER_CONFIG, PLANNER_MODEL } from './planner';
import { SafetyReviewer } from './safety-reviewer';
import { ASSISTANT_MODEL } from './assistant.service';

/**
 * The model connection and the parts that use it without the rest of the agent. It imports nothing,
 * so any module can take the safety review without pulling in the ledger and YouCam (which would
 * loop back to profiles).
 */
@Module({
  providers: [
    {
      provide: PLANNER_CONFIG,
      useValue: {
        // Judge mode wins over the mode setting, as it does for YouCam (docs/architecture.md section 6).
        mode: env.JUDGE_MODE_FORCE_REPLAY === 'true' ? 'replay' : env.YOUCAM_MODE,
        fixturesDir: path.resolve(env.PLANNER_FIXTURES_DIR),
        canCallModel: env.LIVE_CALLS_ENABLED === 'true' && env.GOOGLE_GENERATIVE_AI_API_KEY !== '',
      },
    },
    {
      provide: PLANNER_MODEL,
      useValue: async (prompt: string) =>
        (await generateText({ model: google(env.LLM_MODEL), prompt })).text,
    },
    SafetyReviewer,
    {
      provide: ASSISTANT_MODEL,
      useValue: async (prompt: string) =>
        (
          await generateText({
            model: google(env.LLM_MODEL),
            prompt,
            maxOutputTokens: 512,
            abortSignal: AbortSignal.timeout(10_000),
          })
        ).text,
    },
  ],
  exports: [PLANNER_CONFIG, PLANNER_MODEL, ASSISTANT_MODEL, SafetyReviewer],
})
export class ModelModule {}
