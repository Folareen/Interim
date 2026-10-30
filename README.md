# Interim

Interim helps you feel like yourself while your body changes. Built first for people whose appearance changes with serious illness, for the YouCam API Skin AI and eCommerce VTO Hackathon.

A mobile web app turns photos and self-reports into a Stage Card: a companion note, measured changes, eligible previews, clothing sizes, practical advice and a decision trace with unit costs. Eleven situations and ten languages share one engine. Eligibility, consent, safety and budgets are plain code; the model plans and writes, never measures or sees photos.

## Run locally

Node 22, pnpm 10, Docker and configured storage are required. Full instructions are in [development](docs/development.md).

```bash
pnpm install
cp .env.example .env
# Fill in storage and local secrets. Keep YOUCAM_MODE=replay.
pnpm db:up
pnpm build
pnpm db:migrate
pnpm dev
```

The web app runs on port 3000, the API on 4000, and a separate worker handles queued work. The privacy and terms pages include Interim’s public contact address. `SUPPORT_EMAIL` can override it for a deployment.

The signed-in workspace groups daily actions in Today, visual history in My looks, and settings and data controls in You. It adapts from bottom navigation on phones to a desktop sidebar. Translated help buttons work without typing; optional written result help has separate consent and cannot start image calls. See [frontend rules](docs/frontend/README.md) and [model limits](docs/llm.md#optional-result-help).

## Try the demo

`/demo` opens without signing in and shows recorded Stage Cards for simulated people. It only reads stored data and cannot start paid calls. A deployment needs seeded sample profiles and their stored images; see [demo data](docs/development.md#demo-data).

Interactive runs in replay require matching recorded inputs and parameters. New photos can fail with a missing recording. Synthetic inputs are described in [the fixture guide](packages/fixtures/own/README.md). A planner recording is used when it matches; otherwise replay uses the fixed note for the chosen tone.

## Measured sample costs

These are the live sample results from 23 October 2026, documented in [spec section 18](docs/product/spec.md#18-numbers-and-measures). Two synthetic people each had a front-only baseline and four check-ins, without density measurements, side photos or clothes. All ten runs produced cards. These results do not predict every template or a real-user workload.

| Run | Units | USD at $0.055 per unit |
| --- | ---: | ---: |
| Baseline, each | 38 | $2.09 |
| Check-in, each | 8 | $0.44 |
| Full set: two baselines and eight check-ins | 140 | $7.70 |
| Matching fixture replay | 0 | $0.00 |

Baseline: hair length 2, face shape 10, skin tone 20 and three hairstyle previews 6 units. Check-in: hair length 2 and three previews 6. The recording batch’s balance fell by 140 units, matching its ledger.

The following table summarizes historical spike attempts from 20–27 October 2026. It includes unsuitable test inputs and setup faults. Timing includes upload and polling, excludes photo preparation and image download, and is **not pure render time**. The samples are small and do not estimate real-user reliability. Source and calculation: [spec section 18](docs/product/spec.md#18-numbers-and-measures).

| Tool | Logged attempts | Unsuccessful | Median successful call, seconds |
| --- | ---: | ---: | ---: |
| `hair_type` | 3 | 3/3 (100.0%) | — |
| `hair_density` | 28 | 18/28 (64.3%) | 10 |
| `hair_length` | 20 | 5/20 (25.0%) | 10 |
| `face_shape` | 17 | 6/17 (35.3%) | 10 |
| `skin_tone` | 24 | 9/24 (37.5%) | 11 |
| `hairstyle` | 19 | 0/19 (0.0%) | 11 |
| `hair_volume` | 3 | 0/3 (0.0%) | 11 |
| `hair_color` | 1 | 0/1 (0.0%) | 14 |
| `beard_style` | 4 | 0/4 (0.0%) | 13 |
| `makeup_brows` | 4 | 0/4 (0.0%) | 11.5 |
| `cloth_v4` | 3 | 0/3 (0.0%) | 25 |

Hair type succeeded in other experiments, but none of those successes is in this log subset. Sample-persona runs above are also separate from these counts. Representative error rates, pure render medians and the rate at which eligibility prevented paid failures remain unmeasured. More context: [integration observations](docs/integrations/youcam.md#observed-live).

## Eligibility at a glance

These are implemented gates, not promises that an external tool will succeed. The [rules](packages/rules/src/eligibility.ts) and [spec section 7](docs/product/spec.md#7-eligibility-rules) own the detail.

| Tool or action | Required conditions |
| --- | --- |
| Any paid call | Current consent, live mode enabled, available units and all applicable budget caps; recorded results are reused first. |
| Hair measurements | Head covering off; density additionally needs its capture view. Missing or unreliable measurements fall back to self-report or the previous stage. |
| Hairstyle, volume or colour previews | Head covering off. Volume also needs a reliable density reading. |
| Beard preview | Growing a beard situation. |
| Clothes preview | A fit-enabled situation, body photos enabled, a stored body photo and saved catalog pieces. Size comes from self-report and the catalog chart. |
| Tool refused for a photo | Skip it or request a new photo according to the error; do not keep spending on the same blocked tool. |
| Hat or scarf preview | Unavailable: tested tools did not reliably preserve the person. |

Replay is the default. **A live batch needs an agreed unit and dollar cap and `--max-units`.** No command above starts one. API keys stay in the API, and only `apps/api/src/youcam` calls YouCam.

## What remains open

- Performance and fairness on consenting people’s phone selfies, including skin tones, hair textures and head coverings.
- Whether face and skin readings track real changes, rather than only generated examples or lighting tests.
- Skin analysis ZIP results are not part of the product flow. Hat and scarf previews are deliberately unavailable.
- Camera Kit privacy questions, review of privacy/consent wording, and native-speaker review.
- Manual checks of the deployed demo, authentication, phone layouts, screen readers, sharing and deletion.

The app has profile export/deletion, revocable sharing, a unit ledger screen and public privacy/terms pages. These features do not establish legal readiness or real-user validation. [Spec section 17](docs/product/spec.md#17-spike-what-is-still-open) owns the open questions.

## Project and checks

TypeScript monorepo: Next.js PWA in `apps/web`, NestJS API and worker in `apps/api`, shared rules, types, templates and fixtures in `packages/`.

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Redis-dependent tests require a local Redis instance; without it they skip locally and fail in CI. Tests and fixture replay do not make live YouCam calls. Documentation starts at [docs/README.md](docs/README.md).
