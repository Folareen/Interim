# Agent module

Behaviour (loop, planner rules, stop conditions): [product/spec.md](product/spec.md) sections 7 and 8. Component split and guardrails: [architecture.md](architecture.md) section 7.

Code: `apps/api/src/agent`. Eligibility and banned-word logic: `packages/rules`.

## Status
`planner.ts` calls Gemini with a prompt. The loop, rules and composer are not written yet.

## TODO
- Step union (`observe | measure | place | decide | act | compose | stop`) in `packages/types`.
- Hard step and budget limit constants.
- Card validator: reject any number not found in measurement records.
