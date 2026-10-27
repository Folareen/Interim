# Development

## Requirements
Node 22, pnpm 10, Docker (Postgres and Redis), and a Cloudflare R2 bucket with an API token.

## First run
```bash
pnpm install
cp .env.example .env        # fill in the R2 and other keys; the defaults run in replay mode
pnpm db:up                  # Postgres and Redis
pnpm build                  # builds shared packages once
pnpm db:migrate
pnpm dev                    # web :3000, api :4000 and the worker
```
The worker is its own process that takes runs and safety reviews off the queue. `pnpm dev` starts it with the others, restarting it when the API rebuilds, so only one compiler runs. `pnpm dev:worker` runs it alone, with its own compiler, and must not run beside `pnpm dev`: both write the same `dist`.

## Signing in locally
`MAIL_MODE=log` (the default) prints every email, with its link, in the API's console, so nothing is sent. To send real mail set `MAIL_MODE=brevo`, `BREVO_API_KEY` and `MAIL_FROM_EMAIL` (a sender verified in Brevo). Google sign in is off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; create an OAuth web client in Google Cloud and register `<WEB_ORIGIN>/api/auth/google/callback` as its redirect address.

## Commands
`pnpm build | lint | typecheck | test | format` run through Turborepo across all workspaces, and `pnpm check` runs lint, typecheck and test together. Use `--filter @interim/<name>` for one.

| Script | Does |
| --- | --- |
| `pnpm db:up`, `pnpm db:down` | Start or stop Postgres and Redis in Docker |
| `pnpm db:generate` | Write a migration from changes to `packages/db/src/schema.ts` |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` from `.env` |
| `pnpm db:studio` | Open Drizzle Studio on the database |
| `pnpm dev`, `dev:api`, `dev:web`, `dev:worker` | Run everything (web, api and worker), or one process |

## Environment
Variables are listed in `.env.example`. The API validates them once at startup (`apps/api/src/config/env.ts`). Only `NEXT_PUBLIC_*` reaches the browser. Never put the YouCam or Gemini keys there.

## Replay and the capture flow
With the default `YOUCAM_MODE=replay` there are no recorded YouCam responses for your own photos, so a run you start from the app ends in "no recorded answer for these photos". That is the safe default, not a fault. Tests write synthetic fixtures into a temporary directory (`apps/api/src/test/youcam-fixtures.ts`) and run the whole loop in replay. Recording fixtures for the sample personas is a live batch: state its cost, agree a cap and run it with `--max-units` first.

## Demo data
The demo copies profiles that were recorded through the app: `pnpm --filter @interim/api seed-demo <profile id>...` replaces every sample with a fresh copy of those profiles, their photos and renders. Run it in replay mode, so it never calls YouCam. Recording a profile is a live batch, so it follows the cost rules in [integrations/youcam.md](integrations/youcam.md).

## Testing
Vitest. Unit tests sit next to the code (`*.test.ts`). Tests for the lock, rate limit and live switch need Redis (`pnpm db:up`, or `REDIS_TEST_URL`); without one they skip locally and fail in CI. YouCam-facing tests run against recorded fixtures, never live. Required tests are listed in spec section 16 and architecture section 16.

## CI
`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck` and `pnpm test` on every pull request. Branch protection on `master` requires it to pass and requires a pull request. Enable this in the repository settings; the workflow alone does not enforce it.

## Fixtures and personal data
Fixtures hold synthetic data or data from people who gave written consent for this use. Check before committing: no real photos, no names, no tokens.

Git workflow: [git.md](git.md).
