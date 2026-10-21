# Development

## Requirements
Node 22, pnpm 10, Docker (Postgres, Redis, and MinIO as a local stand-in for Cloudflare R2).

## First run
```bash
pnpm install
cp .env.example .env        # fill in keys; defaults run in replay mode
docker compose up -d
pnpm build                  # builds shared packages once
pnpm --filter @interim/db db:generate
pnpm dev                    # web :3000, api :4000
```
The worker is a separate process: `pnpm --filter @interim/api dev:worker`.

## Signing in locally
`MAIL_MODE=log` (the default) prints every email, with its link, in the API's console, so nothing is sent. To send real mail set `MAIL_MODE=brevo`, `BREVO_API_KEY` and `MAIL_FROM_EMAIL` (a sender verified in Brevo). Google sign in is off until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; create an OAuth web client in Google Cloud and register `<WEB_ORIGIN>/api/auth/google/callback` as its redirect address.

## Commands
`pnpm build | lint | typecheck | test | format` run through Turborepo across all workspaces. Use `--filter @interim/<name>` for one.

## Environment
Variables are listed in `.env.example`. The API validates them once at startup (`apps/api/src/config/env.ts`). Only `NEXT_PUBLIC_*` reaches the browser. Never put the YouCam or Gemini keys there.

## Testing
Vitest. Unit tests sit next to the code (`*.test.ts`). YouCam-facing tests run against recorded fixtures, never live. Required tests are listed in spec section 16 and architecture section 16.

## CI
`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck` and `pnpm test` on every pull request. Branch protection on `master` requires it to pass and requires a pull request. Enable this in the repository settings; the workflow alone does not enforce it.

## Fixtures and personal data
Fixtures hold synthetic data or data from people who gave written consent for this use. Check before committing: no real photos, no names, no tokens.

Git workflow: [git.md](git.md).
