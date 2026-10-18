# Instructions for coding agents

Read [docs/README.md](docs/README.md) to find the owning doc before changing anything.

- Follow [docs/typescript.md](docs/typescript.md). Validate at boundaries with zod; keep internal code simple and typed.
- Only `apps/api/src/youcam` calls YouCam. API keys never reach the browser.
- Eligibility, budgets and consent are plain code in `packages/rules`; the model only plans and explains.
- User facing copy must pass the banned-word scan (see docs/product/overview.md).
- Default `YOUCAM_MODE` is `replay`. Never run live calls without being asked.
- Follow [docs/git.md](docs/git.md) for branches, commits and PRs.
- Run `pnpm lint && pnpm typecheck && pnpm test` before finishing.
