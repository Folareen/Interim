# Development

## Requirements
Node 22, pnpm 10, Docker (Postgres and Redis), and a Cloudflare account for R2, which stores the photos in development as in production.

## First run
```bash
pnpm install
cp .env.example .env        # fill in the R2 values and keys; defaults run in replay mode
docker compose up -d        # Postgres and Redis
pnpm build                  # builds shared packages once
pnpm --filter @interim/db db:migrate
pnpm dev                    # web :3000, api :4000
```
The worker is a separate process: `pnpm --filter @interim/api dev:worker`.

## Object storage (Cloudflare R2)
Photos live in Cloudflare R2 everywhere, so there is no local stand-in to behave differently. Give development its own bucket so test photos never mix with real ones.

1. In the Cloudflare dashboard, open R2 and create a bucket such as `interim-dev`.
2. Create an R2 API token with Object Read and Write on that bucket. Copy the access key id and secret, which are shown once.
3. Put `R2_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`, with your account id from the R2 overview), `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in `.env`.
4. In the bucket's settings, add a CORS policy so the browser can upload straight to it from the web app:
   ```json
   [{ "AllowedOrigins": ["http://localhost:3000"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```

The API will not start until all four values are set. Unit tests use an in memory stand-in and need no Cloudflare account.

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
