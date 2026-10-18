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
- Profile deletion is a hard delete that cascades through foreign keys; S3 objects are removed by the cleanup job.
- The ledger is append only. Never update or delete ledger rows.

## Queues
BullMQ: `run`, `poll`, `cleanup`. Jobs must be idempotent: read the ledger and `call_cache` before acting. Never re-send a YouCam create call unless the earlier task is known to have failed.

## Storage
Photos and renders go to S3-compatible object storage through `@aws-sdk/client-s3` with `S3_ENDPOINT` set: MinIO locally (console at http://localhost:9001), Cloudflare R2 in production (`S3_REGION=auto`). Store only the key in Postgres, never a URL. Serve files through short-lived presigned URLs. Photo expiry is a bucket lifecycle rule plus the cleanup queue; profile deletion removes the objects explicitly.

## Errors and logging
- Throw Nest `HttpException` subclasses for expected failures; let the global filter handle the rest.
- Log at one boundary, structured, with run id and task id. Never log photo contents or personal text.
