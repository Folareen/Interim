# Interim

Interim is built first for people going through body changes: hair loss, a changing face or skin tone, a new body shape after illness or surgery, weight gain or loss, a new baby, midlife, going grey, growing out hair or a beard. It helps you keep your style and feel like yourself while your body changes. Made for the YouCam API Skin AI and eCommerce VTO Hackathon.

**Style previews** are the main flow ([spec section 4a](docs/product/spec.md#4a-style-previews)): bring outfits you have worn or admire, add a photo of you now, and YouCam's clothes try on shows how each outfit could look on you. Your taste stays at the centre. Previews are ideas, never a promise of size or fit, and no model sees the photos. Every profile also has a private place to write a reflection, optional words for the day, and a link to someone to talk to. **Check in profiles** follow a change over time: photos and self-reports become a Stage Card with a companion note in a tone you choose, measured changes from YouCam's hair, skin and face analysis, hairstyle previews, clothing sizes from the size you report, and practical advice. Eleven situations and ten languages share one engine. Eligibility, consent, safety and budgets are plain code; the model plans and writes, never measures or sees photos.

Live: **https://interim.afolarin.cv** (replay only, so it cannot spend YouCam units). Open `/demo` without signing in, or follow [Testing instructions](#testing-instructions).

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

## Testing instructions

On the live site, sign up with an email (a confirmation link is sent) or use Google, then follow steps 3 and 4. To run it yourself:

1. Follow [Run locally](#run-locally). Keep `YOUCAM_MODE=replay` and `MAIL_MODE=log`, so no live call is made and no email is sent.
2. Open http://localhost:3000, choose **Get started** and sign up. With `MAIL_MODE=log` the API prints the confirmation link in its console; open it, then sign in.
3. Confirm you are an adult, accept the consent text, and on the style screen choose **Streetwear and smart casual** or **Denim, earth tones and black**. These add simulated people and outfits whose previews are recorded.
4. Choose **Show me**. Three previews appear beside the outfit and the person, each with a before and after control and a save button. Saved looks are under **Saved**.

Your own photos need a live recording to preview (see below), so in replay they end in "no recorded answer". That is the safe default, not a fault.

## Try the demo

`/demo` opens without signing in. It shows six recorded style previews (three outfits on each of two simulated people) and recorded Stage Cards for simulated people. It only reads stored data and cannot start paid calls. A deployment needs seeded sample profiles and their stored images; see [demo data](docs/development.md#demo-data).

Interactive runs in replay require matching recorded inputs and parameters. New photos can fail with a missing recording. Synthetic inputs are described in [the fixture guide](packages/fixtures/own/README.md). A planner recording is used when it matches; otherwise replay uses the fixed note for the chosen tone.

## Eligibility at a glance

These are implemented gates, not promises that an external tool will succeed. The [rules](packages/rules/src/eligibility.ts) and [spec section 7](docs/product/spec.md#7-tool-eligibility-rules) own the detail.

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
