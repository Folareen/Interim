# LLM

Google Gemini through the Vercel AI SDK (`ai` + `@ai-sdk/google`). Env: `GOOGLE_GENERATIVE_AI_API_KEY`, `LLM_MODEL` (default `gemini-2.5-flash`). Call the model only through the agent module so the provider stays swappable.

Guardrails (no raw photos, restricted tools, banned-word scan, placeholder validator): [architecture.md](architecture.md) section 7. Parse model output with zod like any external input ([typescript.md](typescript.md)).

## Prompts
Keep prompts in `apps/api/src/agent/prompts/` as versioned files. The planner prompt embeds the banned word list from `packages/rules` rather than a copy.

Planner input and output are recorded and replayed with the YouCam fixtures, keyed by prompt version and input hash, so replay mode never calls the model. Use the paid Gemini tier so inputs are not used for training. The model receives measurement records and the situation key, never photos.

## Open
- Confirm the model and its tool-calling reliability.
- Token and cost budget per run.
- Whether structured output is good enough for Stage Card text with placeholders.
