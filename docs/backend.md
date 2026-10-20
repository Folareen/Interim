# Backend (NestJS)

System design, module list, data model and HTTP routes are in [architecture.md](architecture.md). This doc covers conventions only.

## Processes
`apps/api` has two entry points: `main.ts` (HTTP) and `worker.ts` (BullMQ). Both boot the same `AppModule`. Neither runs serverless.

## Modules
- One module per concept in architecture section 4. Keep them flat; do not add layers that only forward calls.
- **Only the `youcam` module talks to YouCam.** No other module imports an HTTP client for it. See [integrations/youcam.md](integrations/youcam.md).
- Controllers parse and validate with zod, then call a service. Business rules live in `packages/rules` as pure functions.

## Config
`src/config/env.ts` parses `process.env` once with zod. Import the typed `env`; never read `process.env` elsewhere.

## Database
- Drizzle, schema in `packages/db/src/schema.ts`, mirroring architecture section 5.
- Migrations: `pnpm --filter @interim/db db:generate` then `db:migrate`. Commit generated SQL.
- Profile deletion is a hard delete that cascades through foreign keys; its S3 objects are removed in the same request, with the cleanup job as backstop. The ledger, budget counters and deletion requests hold no personal data and are not part of the cascade (`ledger_entry.profile_ref` has no foreign key).
- The ledger is append only: `reserve`, `settle` and `release` rows. Never update or delete them. Reserve units in one transaction that locks the `budget_counter` row for each scope, in key order. Scopes are `run:<id>`, `profile:<id>`, `day:<date>`, `source:<hash>:<date>` and `partner:<id>`. `LedgerService` (`reserve`, `settle`, `release`) is keyed by the `youcam_task.id` the caller generates, so a retried job never counts a task twice; `ledger_entry` has a unique index on task and kind. `profile_ref` is the profile id: once the profile is deleted nothing links the rows to a person.

## Queues
BullMQ: `run`, `poll`, `cleanup`. Processors start in `worker.ts` only (`CleanupWorker.start()`), never in `main.ts`; both processes still boot the same `AppModule`. Jobs must be idempotent: read the ledger, the `youcam_task` row and `call_cache` before acting. Write the task row as `intent` before sending a create call. Never re-send a create call unless the earlier task is known to have failed; a task stuck in `intent` becomes `unknown` and is reconciled, not recreated. Only a 429 is retried on create.

## Storage
Photos and renders go to S3-compatible object storage through `@aws-sdk/client-s3` with `S3_ENDPOINT` set: MinIO locally (console at http://localhost:9001), Cloudflare R2 in production (`S3_REGION=auto`). Store only the key in Postgres, never a URL. Key layout: `raw/<profileId>/<uploadId>` for files as uploaded (deleted once the snapshot is saved) and `photos/<profileId>/<snapshotId>/<kind>.jpg` for normalised photos. Normalisation caps the long side at 1000 px (strictest YouCam limit) and rejects a short side under 480 px; the limits are constants in `snapshots/photo.ts`. Serve files through short-lived presigned URLs, and upload through presigned URLs too. After upload the API normalises each photo (HEIC to JPEG, orientation applied, EXIF removed, size limited) and stores the normalised file. Photo expiry follows each row's `expires_at` and is enforced by the cleanup queue (retention can slide with new check ins, so there is no bucket lifecycle rule); profile deletion removes the profile's `photos/` and `raw/` objects straight away, and the cleanup sweep is the backstop.

## Errors and logging
- Throw Nest `HttpException` subclasses for expected failures; let the global filter handle the rest.
- Log at one boundary, structured, with run id and task id. Never log photo contents or personal text.

## Identity
A profile's owner is identified by a cookie token (hash stored in `profile.owner_ref`), or by a partner key. Check ownership in every controller that takes a profile, snapshot, run or card id. `OwnerGuard` resolves the caller (`Authorization: Bearer <partner key>`, else the `interim_owner` cookie); the owner hash is an HMAC keyed with `SESSION_SECRET`. Services look rows up by id and `owner_ref` together and answer 404 for anyone else's, so ids do not leak. `PARTNER_API_KEYS` is `id:key` pairs, comma separated. Public endpoints that can spend units sit behind the rate limits in architecture section 12.
