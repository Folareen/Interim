# Agent module

Behaviour (loop, planner rules, stop conditions): [product/spec.md](product/spec.md) sections 7 and 8. Component split and guardrails: [architecture.md](architecture.md) section 7.

Code: `apps/api/src/agent` (the loop, the planner and its prompt, the trace writer). Eligibility, stage placement, the re-measure rule and the model text check are pure functions in `packages/rules`; templates (tracked tools, placement thresholds, strategies per stage, looks) are configuration in `packages/templates`.

## How a run goes
`AgentService.run` is started by the `run` queue and is safe to deliver twice: measurements, renders and the card are written once, and the YouCam gateway reuses recorded results and never repeats a create.

- **Measure** is decided in code (`measurementsDue`), then filtered by `toolEligibility` and the ledger. The planner is never asked, because the choice spends units.
- **Place** uses the newest reliable reading of each tool, falling back to the self report and then the last stage. A reading is reliable when YouCam's own `face_quality` is all good.
- **Decide** gives the planner the situation key, stage, facts and moment only. Facts are named `m1`, `m2` and `r1` so a recorded plan replays. The planner returns a strategy, the fact it cites and a note; anything that fails `modelTextProblem` twice is replaced by `copy[locale].companionFallback[tone]`.
- **Act** renders up to three looks of the chosen strategy, then brow makeup if hair transfer or volume could not be used, then earlier looks from retained renders. A preview with no recorded answer is skipped and noted once, because the card rests on the measurements; a measurement with no recorded answer ends the run.
- **Trace lines** are codes (`TraceReason`), never sentences; the web app writes them in the person's language. A head covering shows in the trace of the person's own card, so a share view must leave `blocked_head_covering` out.

## Not built yet
- Clothes try on, the sample catalog, the shopping list and what to hold off buying (`holdOffBuying` is always empty).
- Share links (`POST /cards/:id/share`, `DELETE /shares/:id`) and the share view, and the export of renders.
- The cover strategy: hat and scarf try on are not used (spec section 7, rule 6), so `cover` has no tool.
- A per profile lock. The `run` worker takes one run at a time, which holds while there is one worker.
- Reconciling `unknown` tasks and switching live calls off when YouCam reports no units or rejects the key. Both leave the reservation held and log.
- Live confirmation of the looks. Their ids come from YouCam's hair transfer and beard style template lists, but only `male_short_curly` and `female_blunt_bob` have been rendered live.
- Stage thresholds are provisional until the spike (spec section 17, item 2).
