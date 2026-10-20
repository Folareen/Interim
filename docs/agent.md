# Agent module

Behaviour (loop, planner rules, stop conditions): [product/spec.md](product/spec.md) sections 7 and 8. Component split and guardrails: [architecture.md](architecture.md) section 7.

Code: `apps/api/src/agent`. Eligibility and banned-word logic: `packages/rules`.

## Status
`planner.ts` calls Gemini with a prompt. The loop, rules and composer are not written yet.

## TODO
- Step union (`observe | measure | place | decide | act | compose | stop`) in `packages/types`.
- Hard step and budget limit constants.
- Card validator: model text must contain no digit and no number word, and every `{m:<id>}` placeholder must name an existing measurement. Retry once, then use the fixed stage text.
- Planner record and replay, so judge mode and end to end tests are deterministic.
- Self report input and the re-measure rule (`remeasure_every`) in `place`.
- Companion note in `compose`: planner input adds the profile's tone and the snapshot's moment, never the words set. Write the note in the profile's language, check it with `findBannedWord` and `findCompanionPhrase` for that language, fall back to `copy[locale].companionFallback[tone]`, and fill `whatToSay` from `copy[locale].whatToSay[moment]`.
