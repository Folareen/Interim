# Interim: Architecture

Version 1, October 18, 2026
Companion documents: product/overview.md, product/spec.md

## 1. Principles

* Eligibility, budgets and consent are plain code. The language model plans and explains.
* Every YouCam call goes through one client, one ledger and one dedupe layer.
* Everything a judge sees can run from recorded fixtures at zero cost.
* One engine and one code path for all seven templates. Templates are configuration.
* API keys never reach the browser.

## 2. System overview

Components, from the user inward:

* **Web app (Next.js PWA, on Vercel).** Capture wizard, Stage Cards, unit ledger view, judge mode.
* **API (NestJS, on a VPS or AWS ECS).** Profiles, snapshots, runs, ledger, templates. Long running, not serverless, because YouCam tasks are asynchronous.
* **Worker (NestJS process with BullMQ).** Uploads, task creation, polling, backoff, retries.
* **Agent module.** Planner, eligibility rules, composer, trace writer.
* **MCP server (TypeScript MCP SDK).** Exposes the engine to other agents.
* **PostgreSQL.** All records.
* **Redis.** Queues and short lived locks.
* **Object storage (S3 compatible).** Encrypted photos and renders. Cloudflare R2 in production, MinIO locally.
* **YouCam API.** External. Called only from the worker.

Request flow for one check in:

1. Browser runs capture checks, then uploads photos through the API to S3.
2. API creates a snapshot and a run, then queues the run.
3. Worker starts the agent loop. The agent asks the YouCam module for measurements and renders. The YouCam module checks the ledger, the dedupe cache and eligibility before it makes any call.
4. Progress is streamed to the browser over server sent events.
5. The composer writes the Stage Card. The run closes.

## 3. Repository layout

A TypeScript monorepo with shared types.

```
interim/
  apps/
    web/            Next.js PWA
    api/            NestJS API and worker entry points
    mcp/            MCP server
  packages/
    types/          Shared types and zod schemas
    templates/      Template configuration files and stage definitions
    rules/          Eligibility rules and the banned word list
    db/             Drizzle schema and migrations
    fixtures/       Recorded YouCam responses and sample profiles
    tsconfig/       Shared TypeScript configs
    eslint-config/  Shared ESLint config
  scripts/
    spike/          48 hour spike scripts
    record/         Fixture recording helper
  docs/
```

## 4. API modules (NestJS)

* **profiles.** Create profiles from templates. Delete profiles and everything under them.
* **snapshots.** Upload photos, run server side capture checks, store snapshots.
* **runs.** Start a run, stream progress, return the Stage Card.
* **templates.** Load template configuration and expose it read only.
* **ledger.** Append only unit ledger and budgets. Estimate before a call, settle after.
* **youcam.** The only module allowed to talk to YouCam. See section 6.
* **agent.** Planner, rules, composer, trace. See section 7.
* **guard.** Consent checks, banned word scan, privacy deletion jobs.
* **mcp.** Adapter that maps MCP tool calls to the same services.

## 5. Data model (PostgreSQL)

Each table has a primary key, a created timestamp and, where it makes sense, a deleted timestamp for hard deletion jobs.

* **profile.** id, template_key, consent_version, consented_at, judge_sample flag.
* **snapshot.** id, profile_id, taken_at, is_baseline, stage_key, capture_check_json.
* **photo.** id, snapshot_id, kind (front, left, right, top, full_length, body), s3_key, sha256 hash.
* **measurement.** id, snapshot_id, tool, value_json, units_settled, youcam_task_id.
* **render.** id, snapshot_id, tool, input_hash, s3_key, label (preview or earlier look), units_settled.
* **run.** id, snapshot_id, status, stop_reason, budget_units, spent_units.
* **trace_entry.** id, run_id, seq, tool, inputs_json, outputs_ref, cost_units, reason.
* **stage_card.** id, run_id, card_json, approved_at.
* **ledger_entry.** id, profile_id, run_id, tool, kind (estimate or settle), units, task_id.
* **call_cache.** key (photo hash, tool, parameters hash), outcome (success, blocked, failed), result_ref.
* **garment.** id, profile_id, catalog_sku, saved_at.

Hard delete cascades from profile to everything above, including S3 objects.

## 6. YouCam client design

Single module, single entry point. Nothing else imports an HTTP client for YouCam.

* **Flow per call.** Check consent and budget, check eligibility, check call_cache, write an estimate to the ledger, upload the file if needed, create the task, poll to completion, parse the result, settle the ledger, write the cache.
* **Auth.** Bearer token from server side environment. Never sent to the browser.
* **Upload.** The documented V2 flow: register the file, upload to the returned location, then create the task with the file id.
* **Polling.** BullMQ job with growing delay. Stop on success, error or timeout.
* **Errors.** HTTP errors and task level errors are both parsed. A task status of error inside an HTTP 200 is a failure. Mapped error codes follow the spec.
* **Rate limit.** A token bucket sized to the documented limit of 250 requests per 300 seconds, with random jitter on a 429 because there is no Retry After header.
* **Duplicates.** There is no idempotency key. A create call is never repeated unless the earlier task is known to have failed. The cache key is photo hash, tool and parameter hash.
* **Cost.** A cost function calls Get_Feature_Cost where available and falls back to the config table in the spec.
* **Recording.** A flag records every request and response into the fixtures package, with secrets removed.
* **Replay.** A flag replays recorded responses with no network call. Judge mode forces this flag.

## 7. Agent module

Four parts.

* **Rules (code).** Eligibility rules from the spec, stage placement from template thresholds, budget checks, banned word checks. Pure functions with unit tests.
* **Planner (model).** Uses the Vercel AI SDK with tool calling. It receives only the tools that eligibility allows for this snapshot. It must cite a measurement id for every claim it makes. It cannot call a tool that was filtered out.
* **Composer (model plus code).** Builds the Stage Card from tool outputs. Code inserts all numbers and image references. The model only writes the explanation text.
* **Trace writer (code).** Stores a trace entry for each step with a one line reason.

Guard rails in the loop:

* The model cannot see raw photos. It sees measurement records and render references.
* A response validator rejects any card text that contains a number not found in the measurement records.
* A banned word scan runs on every model output before it is saved.
* The loop has a hard step limit and a hard budget limit.

## 8. Job queue

BullMQ on Redis.

* **run queue.** One job per run. Concurrency of one per profile.
* **poll queue.** One job per open YouCam task, with growing delay.
* **cleanup queue.** Photo expiry after 30 days and deletion requests.
* All jobs are idempotent at the run and task level. Jobs read the ledger and call_cache before they act.

## 9. HTTP API

* POST /profiles with a template key
* DELETE /profiles/:id
* POST /profiles/:id/snapshots (photos by upload)
* POST /snapshots/:id/runs (starts the agent)
* GET /runs/:id/events (server sent events)
* GET /runs/:id/card
* POST /cards/:id/approve
* POST /cards/:id/share (creates an expiring link)
* GET /profiles/:id/ledger
* GET /templates
* GET /judge/sample (opens a sample profile, replay only)

All routes check consent version and ownership. Share links expire and are read only.

## 10. Web app

* **Pages.** Template picker, consent, capture wizard, run progress, Stage Card, ledger view, share view, judge sample.
* **Capture wizard.** Uses the YouCam JS Camera Kit where possible for angle and lighting guidance. Runs checks on the device and blocks upload on failure.
* **Run progress.** Shows the live trace in short lines, so the agent is visible.
* **Stage Card.** Before and after slider for renders, a clear preview label, shopping list, share and delete actions.
* **Ledger view.** Every call, its cost and the reason it was made.
* **Mobile first.** Designed and filmed on a phone. Installable as a PWA.

## 11. MCP server

A separate process using the TypeScript MCP SDK. It maps these tools to the same services the API uses: create_profile, add_snapshot, run_checkin, get_stage_card, eligible_tools, unit_ledger. It applies the same consent, eligibility and budget checks. A partner agent cannot bypass them.

Interim also needs to call YouCam's own hosted MCP servers or REST. The beauty server holds the hair and beard tools. The fashion server holds clothes, hats and scarves. A head to toe flow needs both, or direct REST calls. The simplest plan is direct REST for everything the worker calls, and the hosted MCP servers only as a documented option.

## 12. Security and privacy

* Secrets in environment variables on the server only.
* Photos encrypted at rest with a key managed outside the code.
* Signed, short lived URLs for photo and render access.
* Consent version stored with every profile.
* Automatic deletion after 30 days, plus delete on request.
* Logs never contain photo contents or personal text.
* Judge mode has no write access to real accounts.

## 13. Configuration

Server environment variables, by name:

* YOUCAM_API_KEY
* YOUCAM_BASE_URL
* DATABASE_URL
* REDIS_URL
* S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY
* GOOGLE_GENERATIVE_AI_API_KEY and LLM_MODEL (Gemini through the Vercel AI SDK)
* UNIT_BUDGET_PER_RUN, UNIT_BUDGET_PER_PROFILE, UNIT_BUDGET_PER_DAY
* YOUCAM_MODE with values live, record or replay
* JUDGE_MODE_FORCE_REPLAY

## 14. Deployment

* **Web.** Vercel.
* **API, worker and MCP.** One VPS or AWS ECS service with three processes. Not serverless.
* **Database.** Managed PostgreSQL.
* **Redis.** Managed or on the same host for the hackathon.
* **Object storage.** Cloudflare R2, one bucket with a lifecycle rule (30 day photo expiry). Accessed through the S3 API, so the provider can change with env vars only.
* **Environments.** Local, and one production like environment. Judge mode is the default on the public link.

## 15. Observability

* Structured logs with run id and task id.
* A run timeline view built from trace entries.
* Counters for units spent, errors per tool and blocked calls avoided.
* These counters feed the numbers published in the readme.

## 16. Testing

* **Unit tests.** Eligibility rules, stage placement, cost and budget logic, banned word scan, card validator.
* **Contract tests.** The YouCam client against recorded fixtures, including errors inside HTTP 200 and 429 with no Retry After.
* **Template tests.** All seven templates run through the same code path.
* **End to end.** The capture to Stage Card flow in replay mode, using a browser test.
* **Guard tests.** A card with an invented number fails validation. A banned word fails the build.
* **Live smoke test.** A small live run before submission to confirm the recorded fixtures still match the API.

## 17. Build order

1. YouCam client with record and replay, and the ledger. Run the spike.
2. Templates and rules packages, with tests.
3. Snapshot upload and capture checks.
4. Agent loop with the planner, composer and trace.
5. Stage Card and the web app flow.
6. Judge mode and sample profiles.
7. MCP server.
8. Banned word scan, deletion jobs, and polish.
9. Measurements for the readme and the video.

## 18. Open technical questions

* Real unit cost and behaviour of density, length, volume, hair transfer v2.1 and clothes v4.
* Exact rejection thresholds for thin or short hair.
* Whether a clothes render can be passed into hair transfer.
* Whether the documented framing for clothes is full body or chest up.
* Whether the Camera Kit gives enough angle control for the density photo.

These are settled in the first 48 hours. The results go into the spec and the eligibility table.
