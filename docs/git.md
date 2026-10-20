# Git rules

## Branches
- `master` is protected in the repository settings (pull request required, CI must pass, no force pushes). Everything lands through a pull request.
- Branch from an up-to-date `master`: `<type>/<short-kebab-description>`, e.g. `feat/capture-wizard`, `fix/ledger-double-charge`.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.

## Commits
- [Conventional Commits](https://www.conventionalcommits.org): `<type>(<optional scope>): <imperative summary>`, e.g. `feat(api): add ledger module`.
- Subject under 72 characters, no trailing period. Use the body to explain why when it is not obvious.
- One logical change per commit. Do not mix refactors with behaviour changes.
- Never commit secrets, `.env` files, photos or recorded fixtures containing personal data. Fixtures are synthetic or from people who gave written consent for this use. Use `.env.example` for new variables.
- Do not rewrite history that has been pushed and shared.

## Pull requests
- Keep them small and focused. Title follows the commit format.
- Description: what changed, why, and how it was tested. Link the doc or spec section when behaviour changes.
- `pnpm lint && pnpm typecheck && pnpm test` must pass before review. CI runs the same commands.
- Update the owning doc in the same PR when code and docs would otherwise disagree.
- Squash merge, then delete the branch.
