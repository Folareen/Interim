# Interim: Architecture

Companion documents: product/overview.md, product/spec.md

## 1. Principles

* Eligibility, budgets and consent are plain code. The language model plans and explains.
* Every YouCam call goes through one client, one ledger and one dedupe layer.
* Everything a judge sees can run from recorded fixtures at zero cost.
* One engine and one code path for every template. Templates are configuration.
* API keys never reach the browser.
* Anyone can reach the public endpoints, so every endpoint that can spend units is limited and capped.

## 2. System overview

Components, from the user inward:

* **Web app (Next.js PWA, on Vercel).** Capture wizard, Stage Cards, unit ledger view, judge mode. It proxies `/api/*` to the API so cookies are first party (section 12).
* **API (NestJS, on a VPS or AWS ECS).** Profiles, snapshots, runs, ledger, templates. Long running, not serverless, because YouCam tasks are asynchronous.
* **Worker (NestJS process with BullMQ).** Uploads, task creation, polling, backoff, retries.
* **Agent module.** Planner, eligibility rules, composer, trace writer.
* **PostgreSQL.** All records.
* **Redis.** Queues, the shared rate limit bucket and short lived locks.
* **Object storage (S3 compatible).** Encrypted photos and renders. Cloudflare R2 in production, MinIO locally.
* **YouCam API.** External. Called only from the worker.

Request flow for one check in:

1. Browser runs capture checks, asks the API for presigned upload links, and uploads each photo straight to storage.
2. The API normalises each photo (format, orientation, EXIF, size), runs the capture checks again, creates a snapshot and a run, then queues the run.
3. Worker starts the agent loop. The agent asks the YouCam module for measurements and renders. The YouCam module checks consent, caps, eligibility and call_cache before it makes any call.
4. Progress is streamed to the browser over server sent events.
5. The composer writes the Stage Card. The run closes.

## 3. Repository layout

A TypeScript monorepo with shared types.

```
interim/
  apps/
    web/            Next.js PWA
    api/            NestJS API and worker entry points
  packages/
    types/          Shared types and zod schemas
    templates/      Situations and stages, fixed copy per language, words for today
    rules/          Eligibility, budget, retention and language rules, crisis contacts
    db/             Drizzle schema and migrations
    fixtures/       Sample personas and recorded YouCam and planner responses
    tsconfig/       Shared TypeScript configs
    eslint-config/  Shared ESLint config
  docs/
```

## 4. API modules (NestJS)

* **profiles.** Create profiles from templates. Delete and export profiles and everything under them.
* **snapshots.** Presigned uploads, photo normalisation, server side capture checks, self report, store snapshots.
* **runs.** Start a run, stream progress, return the Stage Card.
* **templates.** Load template configuration and expose it read only.
* **ledger.** Append only unit ledger, reservations and budget counters.
* **youcam.** The only module allowed to talk to YouCam. See section 6.
* **agent.** Planner, rules, composer, trace. See section 7.
* **guard.** Owner identity, consent checks and request limits.
* **cleanup.** Retention, deletion and bucket reconcile. See section 8.
* **storage.** The S3 client: presigned uploads, reads, listing and deletes.

## 5. Data model (PostgreSQL)

Each table has a primary key and a created timestamp. Deletion is a hard delete, recorded in `deletion_request`. The Drizzle schema mirrors this section.

* **profile.** id, template_key, owner_ref (hash of the owner token, or `sample`), consent_version, consented_at (null until consent), retention (standard or extended), locale (only live languages are accepted), tone (practical, warm or light), words_set (null while off), head_covering (default off), body_photos (starts from the template), judge_sample flag. words_set and head_covering are read only through the preferences routes.
* **consent_event.** id, profile_id, version, action (grant or withdraw), created.
* **snapshot.** id, profile_id, taken_at, is_baseline, stage_key, moment (nullable), capture_check_json.
* **self_report.** id, snapshot_id, changed (none, some, lot), reported_size (nullable).
* **photo.** id, snapshot_id, kind (front, left, right, top, body), s3_key, sha256 of the normalised file, expires_at.
* **measurement.** id, snapshot_id, tool, value_json, youcam_task_id. Cost is read from the ledger through the task id.
* **render.** id, snapshot_id, tool, input_hash, s3_key (null once expired), label (preview or earlier look), expires_at.
* **run.** id, snapshot_id, template_key, template_version, status, stop_reason, budget_units. Spent units are summed from the ledger.
* **trace_entry.** id, run_id, seq, tool, inputs_json, outputs_ref, cost_units, reason.
* **stage_card.** id, run_id, card_json, approved_at.
* **youcam_task.** id (our request id), profile_id, run_id, tool, state (intent, created, polling, done, failed, unknown), youcam_task_id, updated.
* **ledger_entry.** id, profile_ref, run_id, tool, kind (reserve, settle or release), units, task_id. `profile_ref` is a random id with no foreign key. Ledger rows hold no personal data and are not deleted with the profile.
* **budget_counter.** scope (run, profile, day, source), reserved_units, settled_units. Locked in a transaction while reserving.
* **call_cache.** key (normalised photo hash, tool, API version, parameters hash), outcome (success or blocked), result_ref. Transient failures are never cached.
* **catalog_item.** sku, name, size chart (sample catalog).
* **garment.** id, profile_id, catalog_sku, saved_at.
* **share_link.** id, card_id, token_hash, expires_at, revoked_at.
* **deletion_request.** id, requested_at, completed_at. Holds no profile reference.

Hard delete cascades from profile to everything above except the ledger, budget counters and deletion requests, and removes the S3 objects. A cleanup job also compares stored keys against the bucket to find objects that are missing or that were left behind. Redis jobs carry ids only. Backups age out within 7 days.

## 6. YouCam client design

Single module, single entry point. Nothing else imports an HTTP client for YouCam.

* **Flow per call.** Check consent, live switch and caps, check eligibility, check call_cache, reserve units in the ledger, write the task row as `intent`, upload the file if needed, create the task, store the task id, poll to completion, parse the result, settle or release the ledger, write the cache.
* **Auth.** Bearer token from server side environment. Never sent to the browser.
* **Upload.** The documented V2 flow: register the file, upload to the returned location, then create the task with the file id.
* **Polling.** BullMQ job with growing delay. Stop on success, error or timeout.
* **Failures.** HTTP errors and task level errors are both parsed. Error mapping, unknown tasks, 429 handling and duplicate calls follow spec sections 10 and 11.
* **Rate limit.** A token bucket in Redis, sized to the documented limit of 250 requests per 300 seconds, shared by every worker. No profile may take more than its configured share. Random jitter on a 429 because there is no Retry After header.
* **Cache key.** The normalised photo hash, tool, API version and parameter hash.
* **Cost.** A cost function calls Get_Feature_Cost where available and falls back to the config table in the spec.
* **Live switch.** `LIVE_CALLS_ENABLED` must be true for any live call. It is turned off automatically when YouCam reports no units or rejects the key.
* **Record and replay.** Recording saves YouCam responses and planner output as fixtures with secrets removed. Replay serves them with no network call, and a missing fixture is an error, never a live call. Judge mode forces replay. Modes are in [integrations/youcam.md](integrations/youcam.md#modes-youcam_mode).

## 7. Agent module

Four parts.

* **Rules (code).** Eligibility rules from the spec, stage placement from template thresholds, budget checks, banned word checks. Pure functions with unit tests.
* **Planner (model).** Uses the Vercel AI SDK with tool calling. It receives only the tools that eligibility allows for this snapshot. It must cite a measurement id for every claim it makes, and each id is checked to exist. It cannot call a tool that was filtered out.
* **Composer (model plus code).** Builds the Stage Card from tool outputs. The model writes explanation text with placeholders such as `{m:<id>}`. Code inserts all numbers, dates, sizes and image references.
* **Trace writer (code).** Stores a trace entry for each step with a one line reason.

The model never sees raw photos, only measurement records and render references. Its text is validated and scanned before it is saved (spec sections 8 and 13, [llm.md](llm.md)). The loop has a hard step limit and a hard budget limit.

## 8. Job queue

BullMQ on Redis.

* **run queue.** One job per run. Concurrency of one per profile.
* **poll queue.** One job per open YouCam task, with growing delay.
* **cleanup queue.** One hourly job: photo and render expiry, storage reconcile, completing deletion requests and, later, unknown task reconcile. Expiry deletes the file, then the row (a render keeps its row and loses `s3_key`). The reconcile walks `raw/` and `photos/` once. Files of a deleted profile go at once, and unreferenced files of a live profile go after a grace period (24 hours for `raw/`, 1 hour for `photos/`). Photo rows whose file is missing are logged by id.
* All jobs are idempotent at the run and task level. Jobs read the ledger, the task row and call_cache before they act. BullMQ delivers at least once, so no job may send a create call without first finding the task row in a safe state.

## 9. HTTP API

* POST /profiles with a template key and an age confirmation (open; mints the owner cookie for a new person)
* GET /profiles (the caller's own) and GET /profiles/:id
* POST /profiles/:id/consent (grant or withdraw)
* GET and PUT /profiles/:id/preferences (language, tone, words for today set, body photos, head covering)
* GET /profiles/:id/words?date=YYYY-MM-DD (today's passage in the profile's language or English, or null while off; the person only)
* DELETE /profiles/:id
* GET /profiles/:id/export
* POST /profiles/:id/uploads (kind and size per photo; returns one presigned PUT link each; needs current consent)
* POST /profiles/:id/snapshots (upload ids with kinds, self report and an optional moment; normalises, stores, then deletes the raw uploads)
* POST /snapshots/:id/runs (starts the agent)
* GET /runs/:id/events (server sent events)
* GET /runs/:id/card
* POST /cards/:id/approve
* POST /cards/:id/share (creates an expiring link)
* DELETE /shares/:id (revokes a link)
* GET /profiles/:id/ledger (the profile's ledger rows and held and spent totals)
* GET /templates
* GET /judge/sample (opens a sample profile, replay only)

All routes check consent version and ownership. Share links expire, can be revoked, are read only and serve renders and card text only.

## 10. Web app

* **Pages.** Welcome, language, situation, setup (tone, head covering, age), consent and ready, then capture wizard, run progress, Stage Card, ledger view, share view, judge sample, privacy policy, terms.
* **Capture wizard.** Uses the YouCam JS Camera Kit where possible for angle and lighting guidance. Runs checks on the device and blocks upload on failure. Offers a timer for the top photo. The PWA install and camera permission flow is tested on iOS Safari and Android Chrome.
* **Run progress.** Shows the live trace in short lines, so the agent is visible.
* **Stage Card.** Before and after slider for renders, a clear preview label, shopping list, share, export and delete actions.
* **Ledger view.** Every call, its cost and the reason it was made.
* **Mobile first.** Designed and filmed on a phone. Installable as a PWA.

## 11. Access

Interim exposes no MCP server or partner API: every caller is the person, through the app. The worker calls YouCam's REST API directly and does not use YouCam's hosted MCP servers.

## 12. Security and privacy

* Secrets in environment variables on the server only.
* **Owner identity.** A new profile gets a random owner token in an httpOnly, Secure, SameSite=Lax cookie. Only its hash is stored (`profile.owner_ref`). The web app proxies `/api/*` so the cookie is first party and also works for server sent events. There is no recovery if the cookie is lost, and the consent screen says so.
* **Abuse limits.** Rate limits per source address and per owner token, a bot check on profile creation, a daily unit budget per source address, a maximum upload size and type checked by file signature, and image size limits that guard against decompression bombs.
* Photos encrypted at rest with a key managed outside the code.
* Signed, short lived URLs for photo and render access.
* Consent version stored with every profile, plus a consent event history.
* Retention, deletion, export and logging follow spec section 12. In keep history mode each new check in pushes `expires_at` forward on the profile's photos and renders.
* Judge mode has no write access to real accounts.

## 13. Configuration

Server environment variables, by name:

* YOUCAM_API_KEY
* YOUCAM_BASE_URL
* DATABASE_URL
* REDIS_URL
* S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY
* GOOGLE_GENERATIVE_AI_API_KEY and LLM_MODEL (Gemini through the Vercel AI SDK)
* UNIT_BUDGET_PER_RUN, UNIT_BUDGET_PER_PROFILE, UNIT_BUDGET_PER_DAY, UNIT_BUDGET_PER_SOURCE_PER_DAY
* YOUCAM_MODE with values live, record or replay
* LIVE_CALLS_ENABLED, false unless set
* JUDGE_MODE_FORCE_REPLAY
* SESSION_SECRET, MAX_UPLOAD_BYTES, TURNSTILE_SECRET_KEY

## 14. Deployment

* **Web.** Vercel.
* **API and worker.** One VPS or AWS ECS service with two processes. Not serverless.
* **Database.** Managed PostgreSQL.
* **Redis.** Managed or on the same host for the hackathon.
* **Object storage.** Cloudflare R2, one bucket. Expiry is enforced by the cleanup queue from each row's `expires_at`, because retention can slide and a bucket lifecycle rule cannot. Accessed through the S3 API, so the provider can change with env vars only.
* **Environments.** Local, and one production like environment. Judge mode is the default on the public link.

## 15. Observability

* Structured logs with run id and task id.
* A run timeline view built from trace entries.
* Counters for units spent, errors per tool and blocked calls avoided.
* Alerts for the daily budget reaching 80%, out of units, unknown tasks older than an hour, and a rise in 401 or 403.
* These counters feed the numbers published in the readme.

## 16. Testing

* **Unit tests.** Eligibility rules, stage placement, cost and budget logic, banned word scan, card validator.
* **Contract tests.** The YouCam client against recorded fixtures, including errors inside HTTP 200 and 429 with no Retry After.
* **Concurrency tests.** Two runs reserving the last units. A crash between send and store of a create call.
* **Template tests.** Every template runs through the same code path.
* **End to end.** The capture to Stage Card flow in replay mode, using a browser test.
* **Guard tests.** A card with an invented number or a digit fails validation. A banned word fails the build.
* **Upload tests.** HEIC, wrong file type, oversized file, EXIF removal.
* **Live smoke test.** A small live run before submission to confirm the recorded fixtures still match the API.
