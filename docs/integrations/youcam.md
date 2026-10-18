# YouCam integration

Design: [architecture.md](architecture.md) section 6. Eligibility rules, error mapping and the cost table: [product/spec.md](product/spec.md) sections 7, 10, 11. This doc tracks implementation state and open questions.

Code: `apps/api/src/youcam`. Constants (cost table, rate limit) are in `youcam.constants.ts`.

## Modes (`YOUCAM_MODE`)
- `live`: real calls, spends units.
- `record`: real calls, responses saved to `packages/fixtures/youcam` with secrets removed.
- `replay`: no network, serves fixtures. `JUDGE_MODE_FORCE_REPLAY=true` forces this.

Default is `replay` so a fresh checkout never spends units.

## Status
Scaffold only. `YoucamClient.runTool` throws. Cost table and error codes are copied from the spec; entries that are `null` are unconfirmed.

## Open (resolve in the spike, spec section 17)
Costs for density, length, volume, hair transfer v2.1 and clothes v4; hair-too-short threshold; whether a clothes render can feed hair transfer; clothes framing; Camera Kit angle control. Record answers in the spec and update the cost table.
