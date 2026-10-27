# LLM

Google Gemini through the Vercel AI SDK (`ai` + `@ai-sdk/google`). Env: `GOOGLE_GENERATIVE_AI_API_KEY`, `LLM_MODEL` (default `gemini-3.8-flash`; `gemini-2.5-flash` is closed to new keys). Call the model only through the agent module so the provider stays swappable.

Guardrails (no raw photos, restricted tools, banned-word scan, placeholder validator): [architecture.md](architecture.md) section 7. Parse model output with zod like any external input ([typescript.md](typescript.md)).

## Prompts
Keep prompts in `apps/api/src/agent/prompts/` as versioned files (`planner.v2.ts`, `PLANNER_PROMPT_VERSION`). The planner prompt embeds the banned word list from `packages/rules` rather than a copy. The model replies with JSON (strategy, the fact it cites, the note), which is parsed with zod and checked by `modelTextProblem` before use.

Planner output is recorded to `PLANNER_FIXTURES_DIR` (`packages/fixtures/planner`) as `<prompt version>-<input hash>.json` and replayed from there, so replay mode never calls the model. A missing or stale recording is not an error: the run uses the fixed note for the tone. The model is called only in `live` or `record` mode with `LIVE_CALLS_ENABLED` and a key. Use the paid Gemini tier so inputs are not used for training. What the model receives is listed in [product/spec.md](product/spec.md) section 8.

## Safety review
The only free text the model sees is a reflection the plain check flagged (spec section 13). It gets that text and its language, nothing else, replies `concern`, `clear` or `unsure` as JSON parsed with zod, and may only raise a flag. A failure counts as `concern`. Record and replay it like the planner, so tests never call the model.

## Open
- Confirm the model and its tool-calling reliability.
- Token and cost budget per run.
- Whether structured output is good enough for Stage Card text with placeholders.
