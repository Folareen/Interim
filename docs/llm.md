# LLM

Google Gemini through the Vercel AI SDK (`ai` + `@ai-sdk/google`). Env: `GOOGLE_GENERATIVE_AI_API_KEY`, `LLM_MODEL` (default `gemini-3.8-flash`; `gemini-2.5-flash` is closed to new keys). Call the model only through the agent module so the provider stays swappable.

Guardrails (no raw photos, restricted tools, banned-word scan, placeholder validator): [architecture.md](architecture.md) section 7. Style previews call no model, and no photo, outfit or style reaches one; reading style from photos would change that contract and is an open question (spec section 17, item 15). Parse model output with zod like any external input ([typescript.md](typescript.md)).

## Prompts
Keep prompts in `apps/api/src/agent/prompts/` as versioned files (`planner.v2.ts`, `PLANNER_PROMPT_VERSION`). The planner prompt embeds the banned word list from `packages/rules` rather than a copy. The model replies with JSON (strategy, the fact it cites, the note), which is parsed with zod and checked by `modelTextProblem` before use.

Planner output is recorded to `PLANNER_FIXTURES_DIR` (`packages/fixtures/planner`) as `<prompt version>-<input hash>.json` and replayed from there, so replay mode never calls the model. A missing or stale recording is not an error: the run uses the fixed note for the tone. The model is called only in `live` or `record` mode with `LIVE_CALLS_ENABLED` and a key. Use the paid Gemini tier so inputs are not used for training. What the model receives is listed in [product/spec.md](product/spec.md) section 8.

## Safety review
For reflection review, the model sees only a reflection the plain check flagged (spec section 13). It gets that text and its language, nothing else, replies `concern`, `clear` or `unsure` as JSON parsed with zod, and may only raise a flag. A failure counts as `concern`. Record and replay it like the planner, so tests never call the model.

## Optional result help
`AssistantService` is separate from the planner and safety reviewer. Translated topic buttons work entirely in the browser. Written questions appear only with a configured key and permitted live/record model mode; replay never calls a provider. Before each message the person sees a Google disclosure and separately accepts sending that question and interface language. No profile, card contents, measurements, photos, reflection or history accompany it. The question is neither logged nor stored as a transcript or replay fixture.

The model classifies one of six supported topics (changes, previews, sizes, photos, tone, sharing). Zod rejects any other shape; model prose and links are ignored. The UI supplies reviewed translated explanations and recorded values. Ambiguity asks the person to choose a topic; provider failure falls back to buttons. This path has no tools and cannot change data or start YouCam. It uses a separate model adapter with a 512-token output limit, a ten-second timeout and an account-wide cap of 20 calls per day. Only a hashed rate-limit counter is stored.

Both browser and server run the existing crisis rules across all supported languages before any question reaches Gemini. A match or near match returns the existing contacts view without a model call or stored question. These checks do not guarantee recognition of every language variation. Availability does not imply a free-tier quota or verified multilingual model quality; evaluate those with explicit live-call authorization.

## Open
- Confirm the model and its tool-calling reliability.
- Token and cost budget per run.
- Whether structured output is good enough for Stage Card text with placeholders.
