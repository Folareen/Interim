# Instructions for coding agents

Read [docs/README.md](docs/README.md) to find the owning doc before changing anything.

- Follow [docs/typescript.md](docs/typescript.md). Validate at boundaries with zod; keep internal code simple and typed. Comments explain why, never what, and exported code gets short JSDoc.
- Only `apps/api/src/youcam` calls YouCam. API keys never reach the browser.
- Eligibility, budgets and consent are plain code in `packages/rules`; the model only plans and explains.
- User facing copy must pass the banned-word scan (see docs/product/overview.md).
- Frontend work updates the translation catalogs for every language in the same change (docs/frontend/README.md, Copy).
- Default `YOUCAM_MODE` is `replay`. Never run live calls without being asked.
- Live calls cost real money (500 units cost 27.50 dollars). Before any live batch, state its cost in units and dollars, agree a cap with the user, and run it with `--max-units`. Never go past the cap, or start another batch, without asking again.
- Follow [docs/git.md](docs/git.md) for branches, commits and PRs.
- Run `pnpm lint && pnpm typecheck && pnpm test` before finishing.
