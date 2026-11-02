# Agent module

Behaviour (loop, planner rules, stop conditions): [product/spec.md](product/spec.md) sections 7 and 8. Component split and guardrails: [architecture.md](architecture.md) section 7.

Code: `apps/api/src/agent` (the loop, the planner and its prompt, the trace writer) and `apps/api/src/catalog` (the sample catalog and the saved pieces). Eligibility, stage placement, the re-measure rule and the model text check are pure functions in `packages/rules`; templates (tracked tools, placement thresholds, strategies per stage, looks) are configuration in `packages/templates`.

## How a run goes
`AgentService.run` is started by the `run` queue and is safe to deliver twice: measurements, renders and the card are written once, and the YouCam gateway reuses recorded results and never repeats a create.

- **Measure** is decided in code (`measurementsDue`), then filtered by `toolEligibility` and the ledger. The planner is never asked, because the choice spends units.
- **Place** uses the newest reliable reading of each tool, falling back to the self report and then the last stage. A reading is reliable when YouCam's own `face_quality` is all good.
- **Decide** gives the planner the situation key, stage, facts and moment only. Facts are named `m1`, `m2` and `r1` so a recorded plan replays. The planner returns a strategy, the fact it cites and a note; anything that fails `modelTextProblem` twice is replaced by `copy[locale].companionFallback[tone]`.
- **Act** renders up to three looks of the chosen strategy, then brow makeup if hair transfer or volume could not be used, then earlier looks from retained renders. A preview with no recorded answer is skipped and noted once, because the card rests on the measurements; a measurement with no recorded answer ends the run.
- **Clothes** are shown after the looks, on the body photo, for a template that uses fit. Each saved piece (up to four) is one `cloth_v4` call of 2 units, named by the body photo, the piece's picture and its category, so it is reused on a redelivery. A piece YouCam cannot show on the photo is skipped alone and noted as `blocked_tool`; the tool stays open for the next piece. With no body photo, or too little budget, none is made and the trace says why.
- **Advice** is `templateAdvice` in `packages/rules`, from the template, stage, chosen strategy, how the stage was placed, the body photo setting and the newest skin colour reading. Part, neckline, frame, comfort and match render nothing (`adviceStrategies`); `part` is dropped for a covered head. The model picks the strategy and never writes the advice. Each situation reads only the tools in its `baseline` list.
- **Shopping list and hold off buying** are plain code (`shoppingAdvice` in `packages/rules`), from the stage, the reported size and the catalog's size chart, never from a render. A relaxed piece is listed at the size the chart gives the reported size. A fitted piece waits (`size_moving`) while the stage is not one of the template's `buyStages`. A piece with no reported size (`size_unknown`) or no chart entry for it (`size_not_offered`) waits too.
- **Trace lines** are codes (`TraceReason`), never sentences; the web app writes them in the person's language. A head covering shows in the trace of the person's own card, so a share view carries no trace at all.

## Not built yet
- Photos of the sample personas edited for templates 2 to 5 (a fuller face, a changed skin colour). The persona tests use the existing hair stage edits and their recorded answers, so the face and skin readings come from the unedited stage, and no stage change by measurement is exercised for those two.
- The cover strategy: hat and scarf try on are not used (spec section 7, rule 6), so `cover` has no tool.
- Live confirmation of clothes for the sample catalog, whose pictures are YouCam generated stand-ins. Some `cloth_v4` answers are recorded (`packages/fixtures/youcam/cloth_v4`), and a run in replay notes `not_recorded` for each piece without one. The skin colour situation does not use fit, so it asks for no body photo and shows no clothes.
- Live confirmation of the looks. Their ids come from YouCam's hair transfer and beard style template lists, but only `male_short_curly` and `female_blunt_bob` have been rendered live.
- Stage thresholds are provisional until the spike (spec section 17, item 2).
