import { Injectable } from '@nestjs/common';
import { env } from '../config/env';

// The only place allowed to talk to YouCam. See docs/integrations/youcam.md.
// Per-call flow: consent and budget, eligibility, call_cache, ledger estimate,
// upload, create task, poll, parse, settle, cache.
@Injectable()
export class YoucamClient {
  readonly mode = env.JUDGE_MODE_FORCE_REPLAY === 'true' ? 'replay' : env.YOUCAM_MODE;

  runTool(_tool: string, _photoSha256: string, _params: Record<string, string>): Promise<never> {
    throw new Error('YoucamClient.runTool is not implemented yet');
  }
}
