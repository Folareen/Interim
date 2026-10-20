# YouCam integration

Design: [architecture.md](architecture.md) section 6. Eligibility rules, error mapping and the cost table: [product/spec.md](product/spec.md) sections 7, 10, 11. This doc tracks implementation state and open questions.

Code: `apps/api/src/youcam`. Constants (cost table, rate limit) are in `youcam.constants.ts`.

## Modes (`YOUCAM_MODE`)
- `live`: real calls, spends units.
- `record`: real calls, responses saved to `packages/fixtures/youcam` with secrets removed.
- `replay`: no network, serves fixtures. `JUDGE_MODE_FORCE_REPLAY=true` forces this and wins over `YOUCAM_MODE`.

Default is `replay` so a fresh checkout never spends units.

## Status
Scaffold only. `YoucamClient.runTool` throws. Cost table and error codes are copied from the spec; entries that are `null` are unconfirmed.

## Safety rules for calls
- Nothing is sent unless `LIVE_CALLS_ENABLED=true`. Replay never touches the network, and a missing fixture is an error.
- Reserve units first, write the task row as `intent`, then send. Never re-send a create call; only a 429 is retried.
- The rate limit bucket lives in Redis and is shared by all workers.

## Open questions
Owned by [product/spec.md](../product/spec.md) section 17. Record answers in the spec and update the cost table.
