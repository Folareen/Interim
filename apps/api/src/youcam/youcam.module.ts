import path from 'node:path';
import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { YoucamClient } from './youcam.client';

@Module({
  providers: [
    {
      provide: YoucamClient,
      useFactory: () =>
        new YoucamClient({
          apiKey: env.YOUCAM_API_KEY,
          baseUrl: env.YOUCAM_BASE_URL,
          // Judge mode wins over YOUCAM_MODE (docs/architecture.md section 6).
          mode: env.JUDGE_MODE_FORCE_REPLAY === 'true' ? 'replay' : env.YOUCAM_MODE,
          liveCallsEnabled: env.LIVE_CALLS_ENABLED === 'true',
          fixturesDir: path.resolve(env.YOUCAM_FIXTURES_DIR),
          retryBaseMs: 1000,
        }),
    },
  ],
  exports: [YoucamClient],
})
export class YoucamModule {}
