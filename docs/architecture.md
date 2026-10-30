# Interim: Architecture

Companion documents: product/overview.md, product/spec.md

## 1. Principles

* Eligibility, budgets and consent are plain code. The language model plans and explains.
* Every YouCam call goes through one client, one ledger and one dedupe layer.
* Everything a visitor sees in demo mode runs from recorded data at zero cost.
* One engine and one code path for every template. Templates are configuration.
* API keys never reach the browser.
* Anyone can reach the public endpoints, so every endpoint that can spend units is limited and capped.

## 2. System overview

Components, from the user inward:

* **Web app (Next.js PWA, on Vercel).** Capture wizard, Stage Cards, unit ledger view, demo mode. It proxies `/api/*` to the API so cookies are first party (section 12).
* **API (NestJS, on a VPS or AWS ECS).** Profiles, snapshots, runs, ledger, templates. Long running, not serverless, because YouCam tasks are asynchronous.
* **Worker (NestJS process with BullMQ).** Uploads, task creation, polling, backoff, retries.
* **Agent module.** Planner, eligibility rules, composer, trace writer.
* **PostgreSQL.** All records.
* **Redis.** Queues, the shared rate limit bucket and short lived locks.
* **Object storage.** Encrypted photos and renders in Cloudflare R2, reached through its S3 compatible API (no AWS account is involved).
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
* **guard.** Who is calling (the signed in account's session), consent checks and request limits.
* **auth.** Accounts, sign in with password, email link or Google, password reset, account deletion, and the sign in rate limits. See section 12 and spec section 12b.
* **mail.** The one place that sends email, through Brevo.
* **cleanup.** Retention, deletion and bucket reconcile. See section 8.
* **reflections.** Save, list and delete a profile's reflections, run the plain crisis check on each, and queue the near matches for the model review. The model call itself lives in the agent module (`SafetyReviewer`).
* **storage.** The R2 client: presigned uploads, reads, listing and deletes.

## 5. Data model (PostgreSQL)

Each table has a primary key and a created timestamp. Deletion is a hard delete, recorded in `deletion_request`. The Drizzle schema mirrors this section.

* **profile.** id, template_key, owner_ref (`account:<account id>`, or `sample` for demo mode), consent_version, consented_at (null until consent), retention (standard or extended), locale (only live languages are accepted), tone (practical, warm or light), words_set (null while off), head_covering (default off), body_photos (starts from the template), judge_sample flag. words_set and head_covering are read only through the preferences routes.
* **account.** id, email (lower case, unique), email_verified_at, password_hash (scrypt, null without a password), google_sub (unique), created. Deleting a person's account deletes their profiles through `ProfilesService.remove`, which also removes the files.
* **session.** id, account_id (cascade), token_hash (unique), expires_at.
* **auth_token.** id, email, purpose (verify_email, magic_link, reset_password, change_email or recover_account), account_id (set for the last two, which move an existing account), token_hash (unique), expires_at, used_at. Keyed by email because a sign in link can create the account.
* **recovery_code.** id, account_id (cascade), code_hash (unique, keyed), used_at. Eight per account, replaced as a set.
* **rate_limit.** key (a keyed hash of scope and subject), window_start, hits. Holds no email or address.
* **consent_event.** id, profile_id, version, action (grant or withdraw), created.
* **snapshot.** id, profile_id, taken_at, is_baseline, stage_key, moment (nullable), capture_check_json.
* **self_report.** id, snapshot_id, changed (none, some, lot), reported_size (nullable).
* **photo.** id, snapshot_id, kind (front, left, right, top, body), object_key, sha256 of the normalised file, expires_at.
* **measurement.** id, snapshot_id, tool, value_json (a `MeasuredValue`, not YouCam's raw result), reliable, youcam_task_id. One per tool per snapshot. `reliable` is false when YouCam's own read of the photo was not all good, and such a reading never places a stage. Cost is read from the ledger through the task id.
* **render.** id, snapshot_id, tool, strategy (null for a clothes render), garment_sku (set for a clothes render), input_hash, object_key (null once expired), label (preview or earlier_look), expires_at. One per snapshot and input hash.
* **run.** id, snapshot_id (unique: one run per snapshot), template_key, template_version, status (queued, running, done or failed), stop_reason (a trace reason code), retake (a capture problem code, when YouCam asked for a new photo), budget_units, source_hash. Spent units are summed from the ledger.
* **trace_entry.** id, run_id, seq, step (observe, measure, place, decide, act, compose or stop), tool (null when none), inputs_json (no personal data; the decide step keeps the strategy and the fact it cites), outputs_ref, cost_units, reason (a code the web app translates, never text).
* **stage_card.** id, run_id (unique), profile_id, card_json, approved_at. The card stores keys and values, never display text for stages, tools or numbers; the web app writes those in the person's language.
* **youcam_task.** id (our request id), profile_id, run_id, tool, cache_key, state (intent, created, polling, done, failed, unknown), youcam_task_id, updated. Unique on run and cache key, so a redelivered job finds its task.
* **ledger_entry.** id, profile_ref, run_id, tool, kind (reserve, settle or release), units, task_id. `profile_ref` is a random id with no foreign key. Ledger rows hold no personal data and are not deleted with the profile.
* **budget_counter.** scope (run, profile, day, source), reserved_units, settled_units. Locked in a transaction while reserving.
* **call_cache.** key (`<profile id>:<tool>:` plus the fixture key from the normalised photo hash, API version and parameters hash), profile_id (cascade), tool, outcome (success or blocked), result_ref (a measurement's result as JSON, or a render's object key). Transient failures are never cached. The profile is part of the key, so one person's result is never served to another.
* **catalog_item.** sku, name (English, for logs), category (upper_body or outer), fit (relaxed or fitted), size_chart_json (reported size to the label on the piece; a size the piece is not made in is absent), image_key and image_sha256. Written from `apps/api/src/catalog/sample-catalog.ts` when the API or worker starts, with the pictures copied to `catalog/` in the bucket, which cleanup never touches.
* **garment.** id, profile_id (cascade), catalog_sku, saved_at. One per profile and sku.
* **reflection.** id, profile_id (cascade), text (encrypted), locale, safety (none, match or flagged), created_at.
* **safety_review.** id, reflection_id (cascade), reason, verdict (pending, concern, clear or unsure), reviewed_at, dismissed_at. No email or profile data.
* **push_subscription.** id, profile_id (cascade), endpoint (unique), p256dh, auth, time_zone, words_at (HH:MM local time, null while words for today is off), check_in, show_passage, last_words_at, last_check_in_at. One per device, and only while at least one kind is on. Deleted with the profile, when both kinds are switched off, and when the push service answers 404 or 410.
* **share_link.** id, card_id, token_hash, expires_at, revoked_at.
* **deletion_request.** id, requested_at, completed_at. Holds no profile reference.

Hard delete cascades from profile to everything above except the ledger, budget counters and deletion requests, and removes the stored files. A cleanup job also compares stored keys against the bucket to find objects that are missing or that were left behind. Redis jobs carry ids only. Backups age out within 7 days.

## 6. YouCam client design

Single module, single entry point. Nothing else imports an HTTP client for YouCam.

* **Flow per call.** Check consent, live switch and caps, check eligibility, check call_cache, reserve units in the ledger, write the task row as `intent`, upload the file if needed, create the task, store the task id, poll to completion, parse the result, settle or release the ledger, write the cache. `YoucamGateway` runs this flow around `YoucamClient`, and eligibility is decided before it by the agent. A task row found in `intent` or `unknown` is never sent again, and one found in `created` is polled instead of created.
* **Auth.** Bearer token from server side environment. Never sent to the browser.
* **Upload.** The documented V2 flow: register the file, upload to the returned location, then create the task with the file id.
* **Polling.** BullMQ job with growing delay. Stop on success, error or timeout.
* **Failures.** HTTP errors and task level errors are both parsed. Error mapping, unknown tasks, 429 handling and duplicate calls follow spec sections 10 and 11.
* **Rate limit.** A token bucket in Redis, sized to the documented limit of 250 requests per 300 seconds, shared by every worker. Random jitter on a 429 because there is no Retry After header.
* **Cache key.** The normalised photo hash, tool, API version and parameter hash.
* **Cost.** A cost function calls Get_Feature_Cost where available and falls back to the config table in the spec.
* **Live switch.** `LIVE_CALLS_ENABLED` must be true for any live call. It is turned off automatically, for every process, when YouCam reports no units or rejects the key (`youcam:live-off` in Redis).
* **Record and replay.** Recording saves YouCam responses and planner output as fixtures with secrets removed. Replay serves them with no network call, and a missing fixture is an error, never a live call. The `JUDGE_MODE_FORCE_REPLAY` setting (named before demo mode) forces replay. Modes are in [integrations/youcam.md](integrations/youcam.md#modes-youcam_mode).

## 7. Agent module

Four parts.

* **Rules (code).** Eligibility rules from the spec, stage placement from template thresholds, budget checks, banned word checks. Pure functions with unit tests.
* **Planner (model).** Uses the Vercel AI SDK with tool calling. It receives only the tools that eligibility allows for this snapshot. It must cite a measurement id for every claim it makes, and each id is checked to exist. It cannot call a tool that was filtered out.
* **Composer (model plus code).** Builds the Stage Card from tool outputs. The model writes explanation text with placeholders such as `{m:<id>}`. Code inserts all numbers, dates, sizes and image references.
* **Trace writer (code).** Stores a trace entry for each step with a one line reason.

The model never sees raw photos, only measurement records and render references. Its text is validated and scanned before it is saved (spec sections 8 and 13, [llm.md](llm.md)). The loop has a hard step limit and a hard budget limit.

## 8. Job queue

BullMQ on Redis.

* **run queue.** One job per run. A worker takes one at a time, and a Redis lock per profile (60 seconds, renewed while it runs) keeps two workers off one profile; a run that finds it held is delayed 15 seconds without using its attempt.
* **poll queue.** Not a separate queue yet: the gateway polls inside the run job with a growing delay, and a task row left in `created` is polled again if the job is delivered twice.
* **safety queue.** One job per flagged reflection, keyed by the review id, with three tries. It runs the model review and stores the verdict, and a worker start queues any review still pending. Jobs carry the id only.
* **notifications queue.** One hourly job that sends the notifications due in each subscription's own time zone (spec section 12a). A kind is due in the hour that starts at its time, so half hour zones are caught, and is sent once. Check in reminders go at 10:00 local time once the template's cadence has passed since the last check in. Nothing is sent without VAPID keys.
* **cleanup queue.** One hourly job: photo and render expiry, storage reconcile, completing deletion requests and settling tasks left open for 24 hours (`TaskReconciler`). Expiry deletes the file, then the row (a render keeps its row and loses `object_key`). The reconcile walks `raw/` and `photos/` once. Files of a deleted profile go at once, and unreferenced files of a live profile go after a grace period (24 hours for `raw/`, 1 hour for `photos/`). Photo rows whose file is missing are logged by id.
* All jobs are idempotent at the run and task level. Jobs read the ledger, the task row and call_cache before they act. BullMQ delivers at least once, so no job may send a create call without first finding the task row in a safe state.

## 9. HTTP API

* POST /profiles with a template key and an age confirmation (signed in; the profile belongs to the account)
* GET /profiles (the caller's own) and GET /profiles/:id
* POST /profiles/:id/consent (grant or withdraw)
* GET and PUT /profiles/:id/preferences (language, tone, words for today set, body photos, head covering)
* GET /profiles/:id/words?date=YYYY-MM-DD (today's passage in the profile's language or English, or null while off; the person only)
* DELETE /profiles/:id
* GET /profiles/:id/export (includes the reflections and a short lived download link for each render still stored), GET /profiles/:id/export.zip (the same as a file, with the render images inside)
* GET and POST /profiles/:id/reflections, DELETE /profiles/:id/reflections/:reflectionId, POST /profiles/:id/reflections/contacts/dismiss (the person only; need current consent; the server runs the check itself and allows 20 a day per profile)
* POST /profiles/:id/uploads (kind and size per photo; returns one presigned PUT link each; needs current consent)
* POST /profiles/:id/snapshots (upload ids with kinds, self report and an optional moment; normalises, stores, then deletes the raw uploads)
* POST /snapshots/:id/runs (starts the agent; starting twice returns the same run)
* GET /profiles/:id/latest-run (newest owned run, or null)
* GET /assistant/config (signed in; whether written help is available), POST /cards/:id/assistant (owned card, current consent and per-message Google acceptance; bounded topic, clarify, unavailable or support response)
* GET /runs/:id (status, stop reason, trace)
* GET /runs/:id/events (server sent events: the same view once a second until the run finishes)
* GET /cards/:id (the card with short lived links to its renders, the front photo and the body photo)
* GET /notifications/key (the public key a browser subscribes with, or null while push is off), GET, PUT and DELETE /profiles/:id/notifications (one device's choices, found by its subscription address; the person only; PUT with both kinds off deletes the subscription)
* GET /profiles/:id/garments (the sample catalog with the profile's saved pieces marked and a link to each picture), PUT and DELETE /profiles/:id/garments/:sku (save or remove; both repeat safely; only for a template that uses fit)
* GET /profiles/:id/cards (newest first)
* POST /cards/:id/approve
* POST /cards/:id/share (creates a link that expires after 7 days; the token is returned once, only its hash is stored), GET /cards/:id/shares (the links that still work)
* DELETE /shares/:id (revokes a link; repeats safely)
* GET /shared/:token (signed out; the share view, answers 404 alike for an unknown, expired or revoked link, with `X-Robots-Tag: noindex` and `Cache-Control: no-store`)
* GET /profiles/:id/ledger (the profile's ledger events with timestamps and separate held and spent totals; `ledgerViewSchema`)
* GET /auth/config (which sign in methods are on)
* POST /auth/register, POST /auth/login, POST /auth/magic, POST /auth/magic/use, POST /auth/verify-email, POST /auth/password/forgot, POST /auth/password/reset, POST /auth/logout
* POST /auth/recover, POST /auth/recover/confirm, POST /auth/email/confirm
* GET /auth/me, DELETE /auth/account, POST /auth/email/change, POST /auth/recovery-codes (signed in)
* GET /auth/google/start and GET /auth/google/callback (redirects; the callback is reached at `/api/auth/google/callback` on the web origin)
* GET /templates
* GET /demo (the sample people with their cards) and GET /demo/cards/:id, both signed out and read only

All routes check consent version and ownership. Share links expire, can be revoked, are read only and serve renders and card text only. The share view is built from an allow list in `SharesService`, not by trimming the person's card: renders, look names, the advice lines `shareableAdvice` allows, clothes and the shopping list. It leaves out the situation, stage, measurements, companion note, what to say, what to hold off buying, the trace, original photos and anything about the profile.

## 10. Web app

* **Workspace.** Today (`/ready/[id]`), My looks (`/looks/[id]`) and You (`/you/[id]`), with shared profile navigation and situation switching. `/update/[id]` combines optional fit-clothes selection with capture; settings and data controls live under You.
* **Pages.** Welcome, sign in, sign up, email link, forgot and reset password, link confirmation, account, language, situation, setup (tone, head covering, age), consent, ready and settings, clothes (fit templates only), then capture wizard, run progress, Stage Card, ledger view, share view (`/s/[token]`), demo (`/demo`, `/demo/cards/[id]`), privacy policy, terms.
* **Capture wizard.** Asks for what `capturePlan` in `packages/rules` says, the same rule the server applies. Uses the YouCam JS Camera Kit for the front, both sides (one hair type capture) and the top photo (its five second countdown is the timer), and a plain file input for the body photo and whenever the kit does not load or the camera is refused. Runs `photoQualityProblem` on each photo on the device and blocks upload on failure. The PWA install and camera permission flow is tested on iOS Safari and Android Chrome.
* **Run progress.** Shows the live trace in short lines, so the agent is visible. It listens to the event stream and asks every two seconds if the stream is not available.
* **Stage Card.** Preview-first layout, buttons to swap each preview with the original photo, saved clothes on the body photo, expandable changes, advice, shopping and trace, confirmation and sharing. Optional result help returns a validated topic, never model prose or tools ([llm.md](llm.md#optional-result-help)).
* **Ledger view.** Every call, its cost and the reason it was made.
* **Mobile first.** Designed and filmed on a phone. Installable as a PWA.

## 11. Access

Interim exposes no MCP server or partner API: every caller is the person, through the app. The worker calls YouCam's REST API directly and does not use YouCam's hosted MCP servers.

## 12. Security and privacy

* Secrets in environment variables on the server only.
* **Who is calling.** One cookie, `interim_session`: a signed in account's session, a random token whose keyed hash is stored, httpOnly, Secure and SameSite=Lax, 30 days and extended while in use. Every profile route needs it, and a profile's `owner_ref` is `account:<id>`, so each service check stays one comparison. The web app proxies `/api/*` so the cookie is first party and also works for server sent events.
* **Sign in.** Passwords use scrypt. Emailed links are one use hashes with short lives and are spent by a button, not on page load. Google uses the authorization code flow with PKCE, state and nonce, and the ID token is verified with Google's published keys. Cookies are SameSite=Lax and every state changing route is a JSON POST, PUT or DELETE, which a cross site form cannot send. Rules and limits are in spec section 12b.
* **Abuse limits.** Rate limits per source address and per owner token (sign in steps are counted in the `rate_limit` table; `TRUST_PROXY_HOPS` says how many proxies sit in front of the API, so the address is the person's), a bot check on profile creation, a daily unit budget per source address, a maximum upload size and type checked by file signature, and image size limits that guard against decompression bombs.
* Photos encrypted at rest with a key managed outside the code.
* Signed, short lived URLs for photo and render access.
* Consent version stored with every profile, plus a consent event history.
* Retention, deletion, export and logging follow spec section 12. In keep history mode each new check in pushes `expires_at` forward on the profile's photos and renders.
* Demo mode has no write access to real accounts.

## 13. Configuration

Server environment variables, by name:

* YOUCAM_API_KEY
* YOUCAM_BASE_URL
* DATABASE_URL
* REDIS_URL
* R2_ENDPOINT, R2_BUCKET, R2_REGION, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY
* GOOGLE_GENERATIVE_AI_API_KEY and LLM_MODEL (Gemini through the Vercel AI SDK)
* UNIT_BUDGET_PER_RUN, UNIT_BUDGET_PER_PROFILE, UNIT_BUDGET_PER_DAY, UNIT_BUDGET_PER_SOURCE_PER_DAY
* YOUCAM_MODE with values live, record or replay, and YOUCAM_FIXTURES_DIR and PLANNER_FIXTURES_DIR for what record writes and replay serves
* LIVE_CALLS_ENABLED, false unless set
* JUDGE_MODE_FORCE_REPLAY
* SESSION_SECRET, DATA_KEY (64 hex characters that encrypt reflections; back it up), MAX_UPLOAD_BYTES, TURNSTILE_SECRET_KEY
* WEB_ORIGIN (where the browser reaches the web app; emailed links and Google's return address start here) and TRUST_PROXY_HOPS
* MAIL_MODE (`log` or `brevo`; production must be `brevo`), BREVO_API_KEY, MAIL_FROM_EMAIL and MAIL_FROM_NAME
* VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (optional; notifications are off without the keys)
* GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (optional; Google sign in is off without them)

## 14. Deployment

* **Web.** Vercel.
* **API and worker.** One VPS or AWS ECS service with two processes. Not serverless.
* **Database.** Managed PostgreSQL.
* **Redis.** Managed or on the same host for the hackathon.
* **Object storage.** Cloudflare R2, one bucket. Expiry is enforced by the cleanup queue from each row's `expires_at`, because retention can slide and a bucket lifecycle rule cannot. Accessed through the S3 API, so the provider can change with env vars only.
* **Environments.** Local, and one production like environment. Demo mode is the way in on the public link.

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
