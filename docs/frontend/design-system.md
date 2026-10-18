# Design system

Tailwind CSS v4 only; no component library. Tokens are CSS variables in `apps/web/app/globals.css` under `@theme`. Change a value there, never hardcode it in a component.

## Tokens
| Token | Purpose |
| --- | --- |
| `--color-bg`, `--color-surface` | Page and card backgrounds |
| `--color-text`, `--color-muted` | Text |
| `--color-border` | Dividers and outlines |
| `--color-accent` | Primary actions and focus |
| `--radius-card` | Card corners |

Current values are placeholders. TODO: final palette, dark mode, type scale, spacing scale.

## Layout
Designed and filmed on a phone: single column, max width about 28rem on larger screens, 16px side gutters, thumb-reachable primary actions.

## Components (to build)
- Capture wizard step (instruction, live guidance, pass/fail state)
- Run progress trace line
- Stage Card (before/after slider, preview label, shopping list)
- Ledger row (tool, cost, reason)
- Consent screen

Each should be small, take typed props from `@interim/types`, and need no extra dependency.
