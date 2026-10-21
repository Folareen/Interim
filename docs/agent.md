# Agent module

Behaviour (loop, planner rules, stop conditions): [product/spec.md](product/spec.md) sections 7 and 8. Component split and guardrails: [architecture.md](architecture.md) section 7.

Code: `apps/api/src/agent`. Eligibility and banned-word logic: `packages/rules`.

## Not built yet
- Step union (`observe | measure | place | decide | act | compose | stop`) in `packages/types`.
- Hard step and budget limit constants.
- Card validator: model text must contain no digit and no number word, and every `{m:<id>}` placeholder must name an existing measurement. Retry once, then use the fixed stage text.
- Planner record and replay, so judge mode and end to end tests are deterministic.
- Self report input and the re-measure rule (`remeasure_every`) in `place`.
- Companion note in `compose`: write it in the profile's language, check it with `findBannedWord` and `findCompanionPhrase`, fall back to `copy[locale].companionFallback[tone]`, and fill `whatToSay` from `copy[locale].whatToSay[moment]`. The planner never receives the words set.
