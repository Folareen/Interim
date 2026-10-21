import path from 'node:path';
import { google } from '@ai-sdk/google';
import { Module } from '@nestjs/common';
import { generateText } from 'ai';
import { env } from '../config/env';
import { LedgerModule } from '../ledger/ledger.module';
import { YoucamModule } from '../youcam/youcam.module';
import { AgentService } from './agent.service';
import { PLANNER_CONFIG, PLANNER_MODEL, Planner } from './planner';

@Module({
  imports: [YoucamModule, LedgerModule],
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
      useValue: async (prompt: string) => (await generateText({ model: google(env.LLM_MODEL), prompt })).text,
    },
    Planner,
    AgentService,
  ],
  exports: [AgentService],
})
export class AgentModule {}
