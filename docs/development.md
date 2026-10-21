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
pnpm dev                    # web :3000, api :4000
```
The worker is a separate process: `pnpm dev:worker`.

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
| `pnpm dev`, `dev:api`, `dev:web`, `dev:worker` | Run everything, or one process |

## Environment
Variables are listed in `.env.example`. The API validates them once at startup (`apps/api/src/config/env.ts`). Only `NEXT_PUBLIC_*` reaches the browser. Never put the YouCam or Gemini keys there.

## Testing
Vitest. Unit tests sit next to the code (`*.test.ts`). YouCam-facing tests run against recorded fixtures, never live. Required tests are listed in spec section 16 and architecture section 16.

## CI
`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck` and `pnpm test` on every pull request. Branch protection on `master` requires it to pass and requires a pull request. Enable this in the repository settings; the workflow alone does not enforce it.

## Fixtures and personal data
Fixtures hold synthetic data or data from people who gave written consent for this use. Check before committing: no real photos, no names, no tokens.

Git workflow: [git.md](git.md).
