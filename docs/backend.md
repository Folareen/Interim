# Backend (NestJS)

System design, module list, data model and HTTP routes are in [architecture.md](architecture.md). This doc covers conventions only.

## Processes
`apps/api` has two entry points, `main.ts` (HTTP) and `worker.ts` (BullMQ), which boot the same `AppModule`. Neither runs serverless.

## Modules
- One module per concept in architecture section 4. Keep them flat; do not add layers that only forward calls.
- **Only the `youcam` module talks to YouCam.** No other module imports an HTTP client for it. See [integrations/youcam.md](integrations/youcam.md).
- Controllers parse and validate with zod, then call a service. Business rules live in `packages/rules` as pure functions.

## Config
`src/config/env.ts` parses `process.env` once with zod. Import the typed `env`; never read `process.env` elsewhere.

## Database
- Drizzle, schema in `packages/db/src/schema.ts`, mirroring architecture section 5.
- Migrations: `pnpm --filter @interim/db db:generate` then `db:migrate`. Commit generated SQL.
- Profile deletion is a hard delete that cascades through foreign keys and removes its stored files in the same request; the cleanup job is the backstop. The ledger, budget counters and deletion requests hold no personal data and sit outside the cascade.
- The ledger is append only (`reserve`, `settle`, `release`): never update or delete a row. Reserve in one transaction that locks each scope's `budget_counter` row in key order. `LedgerService` is keyed by the caller's `youcam_task.id`, so a retried job never counts a task twice. `ledger_entry.profile_ref` has no foreign key, so once a profile is deleted nothing links its rows to a person.

## Queues
BullMQ: `run`, `poll`, `cleanup`, `safety`. Processors start in `worker.ts` only, never in `main.ts`. Jobs must be idempotent: read the ledger, the `youcam_task` row and `call_cache` before acting, and never re-send a create call (architecture section 6).

## Storage
Cloudflare R2 for local work and production, through the `@aws-sdk/client-s3` client because R2's API is the S3 protocol (nothing from AWS itself is used). Set `R2_REGION=auto`. The bucket is private and needs a CORS rule that allows PUT from the web origin, because browsers upload to it with presigned links. Postgres stores keys, never URLs. Keys are `raw/<profileId>/<uploadId>` for uploads as received (deleted once the snapshot is saved) and `photos/<profileId>/<snapshotId>/<kind>.jpg` for normalised photos. Uploads and reads both use short-lived presigned URLs. Normalisation is in spec section 5 and `snapshots/photo.ts`. Expiry follows each row's `expires_at` through the cleanup queue; there is no bucket lifecycle rule because retention can slide.

## Errors and logging
- Throw Nest `HttpException` subclasses for expected failures; let the global filter handle the rest.
- Log at one boundary, structured, with run id and task id. Never log photo contents or personal text.

## Identity
A profile's owner is a signed in account (`owner_ref = account:<id>`); there is no anonymous owner and there are no partner or API keys. `OwnerGuard` resolves the caller from the session cookie, whose hash is an HMAC keyed with `SESSION_SECRET`. `AccountGuard` is the same check for routes about the account itself. Check ownership in every controller that takes a profile, snapshot, run or card id. Services look rows up by id and `owner_ref` together and answer 404 for anyone else's, so ids do not leak. Public endpoints that can spend units sit behind the rate limits in architecture section 12.

## Auth
Written in `apps/api/src/auth` with no auth library. Rules, limits and what is stored are in [product/spec.md](product/spec.md) section 12b; routes in [architecture.md](architecture.md) section 9.
- Passwords: `PasswordService`, scrypt, cost kept in the stored string. Never log or return a hash or a token.
- Emailed links are rows in `auth_token`, spent by one atomic update. Send them through `MailService` only; it is the one place that talks to Brevo. Sending is not awaited in the sign up, link and reset paths so the answer is the same for known and unknown addresses; a failure is logged with no address.
- `MAIL_MODE=log` writes mail to the console for local work and is refused in production.
- Counting tries: `RateLimitService.hit(scope, subject, limit, windowMs)`. Add a call before any new route that can be guessed at.
- Anything that can show whether an address has an account must answer the same either way, in time as well as in words.
