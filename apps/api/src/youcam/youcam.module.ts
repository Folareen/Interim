import path from 'node:path';
import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { LedgerModule } from '../ledger/ledger.module';
import { StorageModule } from '../storage/storage.module';
import { YoucamClient } from './youcam.client';
import { GATEWAY_CONFIG, YoucamGateway } from './youcam.gateway';

// Replay serves files, so there is nothing to wait for. Live tasks take 10 to 40 seconds (docs/integrations/youcam.md).
const replay = env.JUDGE_MODE_FORCE_REPLAY === 'true' || env.YOUCAM_MODE === 'replay';

@Module({
  imports: [LedgerModule, StorageModule],
  providers: [
    {
      provide: GATEWAY_CONFIG,
      useValue: replay
        ? { firstPollMs: 0, maxPollMs: 0, timeoutMs: 30_000 }
        : { firstPollMs: 5000, maxPollMs: 20_000, timeoutMs: 5 * 60_000 },
    },
    YoucamGateway,
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
  exports: [YoucamClient, YoucamGateway],
})
export class YoucamModule {}
