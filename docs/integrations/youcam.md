# YouCam integration

Design: [architecture.md](../architecture.md) section 6. Eligibility rules, error mapping and the cost table: [product/spec.md](../product/spec.md) sections 7, 10 and 11. This doc holds the API facts the client relies on and what is not built yet. Code is in `apps/api/src/youcam`.

| File | Holds |
| --- | --- |
| `youcam.client.ts` | `YoucamClient`: upload, create task, get task, balance, prices, record and replay |
| `youcam.tools.ts` | One entry per tool: version, path, request schema, result schema |
| `youcam.errors.ts` | `YoucamError` kinds and the task error to action table |
| `youcam.constants.ts` | Cost table, rate limit, base URL |
| `youcam.gateway.ts` | `YoucamGateway`: the one path every call takes (recorded result, reserve, task row, upload, create, poll, settle, cache), and `youcamFixtureKey` |
| `youcam.module.ts` | Builds the client and the gateway from env |
| `spike/` | The spike runner and its manifest schema. Not part of the build |

## Modes (`YOUCAM_MODE`)
- `live`: real calls, spends units.
- `record`: real calls, finished task responses saved to `YOUCAM_FIXTURES_DIR` (`packages/fixtures/youcam/<tool>/<fixtureKey>.json`) with signed link query strings cut.
- `replay`: no network, serves fixtures. `JUDGE_MODE_FORCE_REPLAY=true` forces this and wins over `YOUCAM_MODE`.

The default is `replay`, so a fresh checkout never spends units. `live` and `record` also need `LIVE_CALLS_ENABLED=true` and a key; otherwise the client throws before any request.

## Using the client
The client does only the YouCam steps; the gateway owns the ledger, task rows and call_cache around it, and the agent calls the gateway, never the client:

1. `uploadPhoto(photo)` returns a file id, valid 24 hours.
2. `createTask(tool, body, fixtureKey)` returns a `TaskRef`. `fixtureKey` is the call_cache key and names the fixture. Never call it twice for one logical task.
3. `getTask(ref)` returns `running`, `success` with a typed result, or `error` with the code and an action (`block_tool`, `new_photo`, `fault`). A task error inside HTTP 200 is returned, not thrown.
4. `getResultImage(ref, url)` downloads a finished render. In `record` it also saves `<fixtureKey>.jpg` beside the fixture, because the signed link expires in hours; in `replay` it reads that file and fails closed when it is missing.
5. `getFeatureCosts()` and `getSpendableUnits()` read prices and the balance. Both are free and live only. Spendable units are the credit batches whose type starts with `Api`.

Thrown `YoucamError` kinds: `live_disabled`, `replay_missing`, `auth`, `out_of_units`, `rate_limited`, `invalid_request`, `unknown_outcome` (create timed out or got a 5xx: mark the task `unknown`, do not re-send) and `transient` (poll or upload: retry later). Only a 429 is retried inside the client, up to 5 times with a doubling wait and jitter.

## API facts (from docs.perfectcorp.com)
- Base URL `https://yce-api-01.makeupar.com`. Auth: `Authorization: Bearer <key>`, no separate auth call.
- Upload: `POST /s2s/v2.0/file` with `files[{content_type, file_name, file_size}]`, then `PUT` the bytes to `data.files[0].requests[0].url` with the returned headers. Skipping the PUT gives a 500 `unknown_internal_error` or a 404 on create.
- Create: `POST /s2s/{version}/task/{path}` returns `data.task_id`. Poll: `GET /s2s/{version}/task/{path}/{task_id}` returns `data.task_status` (`running`, `success`, `error`; Makeup VTO's docs also list `queued` and `processing`, which the client treats as running), `data.error`, `data.results`.
- Results and files live 24 hours, and result links about 2 hours. Polling is required (the docs suggest every 10 seconds). Units are not consumed while `running`, but the docs say a task that times out still consumes them, so poll to a final state within 24 hours.
- Rate limit: 250 requests per 300 seconds, per IP address and per access token, both must hold; about 5 per second advised. No rate limit headers.
- HTTP errors: `{status, error, error_code}` with `CreditInsufficiency`, `InvalidParameters`, `BadRequest`; 401 is `InvalidAccessToken`.

### Tools
| Tool | Path | Input | Result | Units |
| --- | --- | --- | --- | --- |
| `hair_type` | v2.0 `hair-type-detection` | three photos: front, right, left | `hair_type.mapping`, `term` | 2 |
| `hair_density` | v2.0 `hair-density-detection` | one selfie, head lowered about 45 degrees | `hair_density.term` (4 levels), `mapping` 0 to 3 | 1 |
| `hair_length` | v2.0 `hair-length-detection` | one selfie | `hair_length.term` | 2 |
| `hair_color` | v2.0 `hair-color` | photo plus `preset` | `url` | 1 |
| `hairstyle` | v2.1 `hair-transfer` | photo plus `template_id` or `ref_file_id`, `hair_color` `ref` or `src` | `url` | 2 |
| `hair_volume` | v2.0 `hair-vol` | photo plus `template_id` | `url` | 2 |
| `beard_style` | v2.0 `beard-style` | photo plus `template_id` | `url` | 2 |
| `fitzpatrick` | v2.0 `fitzpatrick-scale-analyzer` | one jpg | `fitzpatrick_scale` I to VI | 10 |
| `skin_tone` | v2.0 `skin-tone-analysis` | one front photo | `color.skin_color` and eye, brow, lip, hair colours as hex, plus `face_quality` | 20, on success only |
| `face_shape` | v2.0 `face-attr-analysis` | one front photo, `features` from `faceShape` and `faceAspectRatio` only | `faceshape` (Triangle, Diamond, Heart, InvTriangle, Oblong, Oval, Round, Square, Unknown), `facialratio.face_aspect_ratio` as `[1, ratio]`, and `face_quality` | 10 for 1 to 5 features, on success only |
| `cloth_v4` | v2.0 `cloth-v4` | person photo, `ref_file_id`, `garment_category` (`full_body`, `lower_body`, `upper_body`, `shoes`, `auto`, `outer`) | `url` | 2 |
| `makeup_brows` | v2.0 `makeup-vto` | photo, one `eyebrows` effect (colour only, or a named shape) | `url` | 1, on success only |

Template lists: `GET /s2s/v2.1/task/template/hair-transfer`, `/s2s/v2.0/task/template/beard-style`, `/s2s/v2.0/task/template/hair-vol`.

### Photo limits
| Tool | Formats | Size | Dimensions and pose |
| --- | --- | --- | --- |
| hair type | jpg, png | under 10 MB | 320 to 4096 px, same size for all three, front within 10 degrees, sides over 15 |
| hair density, hair length | jpg, png | under 10 MB | 100 or 320 px minimum to 4096 px; density front within 10 degrees |
| hairstyle, hair volume | jpg, jpeg | under 10 MB | long side 1024 px or less, face width 128 px or more, pitch +-10, yaw +-45, roll +-15, one face |
| beard style | jpg, jpeg | under 10 MB | long side under 1024 px, face width over 256 px, yaw +-30, one face |
| hair color | jpg, jpeg, png | under 10 MB | long side under 1920 px (the page also says height under 1080), face width 100 px or more |
| fitzpatrick | jpg, jpeg | under 10 MB | 320 to 4096 px |
| skin analysis | jpg, jpeg, png | under 10 MB | short side 480 px (SD) or 1080 px (HD), face over 60 percent of width |
| skin tone, face shape | jpg, jpeg, png | under 10 MB | 320 to 4096 px, one person, face fully visible and forward-facing, face width over 60 percent of the image, hair worn down (brushed back for face shape so the forehead shows). Angle strictness is a parameter (`strict` is within 4 to 6 degrees, `high` 10, `flexible` 30) |
| clothes v4 | jpg, png | under 10 MB | 512 x 384 minimum, 4096 px long side, recommended 1024 x 768, person fills 80 percent of the frame, standing, facing forward, face visible. Chest up and waist up photos worked. `filter_multi_person` can reject other people |
| makeup VTO | jpg, jpeg, png | under 10 MB | face fully visible, front within 10 degrees. The docs give conflicting size limits (long side under 1920 or width under 1920 and height under 1080) |

Normalisation must produce a JPEG within the strictest limit a photo is sent to.

The face analysers return `face_quality` (`has_face`, `area`, `frontal`, `lighting`, `faceangle`, each such as "good"), which is YouCam's own read of the photo. It arrives with the result, so it is not a free pre-check.

## Observed live
Found by running the tools against the live API, on professional portraits and on images made with YouCam's own generator.

- **Errors cost nothing.** Face angle and face too small errors left the balance unchanged. Moderation rejections and timeouts are untested.
- **Timing.** Detections, hair transfer and brows take 10 to 20 seconds, clothes 25 to 40. Poll about every 5 seconds.
- **Result links are signed.** The fixture writer cuts the signature, so the spike runner saves each render as soon as a task finishes.
- **Prices.** Get_Feature_Cost returns `proc_unit` as a number, and every price in the docs matched.
- **Hair transfer works on any hair.** 11 of 11 photos succeeded with `hair_color: src`, including bald, shaved, very short and covered heads. On a bald head it adds the template hair. On a covered head it **replaces the covering** with hair. It keeps the face, pose, clothes and background, and matched grey hair. Templates have ids like `male_short_curly`, a title, `category_name` (Male or Female) and `keep_users_color`.
- **Hair volume works** with `template_id` on short, long and afro hair, with a visibly fuller look. Its five templates are all Female (`female_subtle`, `_natural`, `_medium`, `_high`, `_maximized`).
- **Hair length is coarse.** A covered, a bald and a shaved head all read "above the ears". On one generated man, full hair and growing back both read "ear length". It cannot place a stage on its own.
- **Hair density needs the head lowered about 45 degrees.** Ten frontal photos and three slightly tilted ones returned `error_face_angle_invalid`. The first grade is spelled "Extreme Low Density" (the docs say "Extremely"), and `mapping` can be negative.
- **Density follows fullness within one person, not across people.** The same generated man edited from thinning to thick went from -0.06 to 1.91 (Extreme Low to Medium). A thick haired woman read 2.50, sparse heads -0.06 to 0.21, and a thick curly haired man only 0.92 (Low). Dim light cut a thick reading from 1.91 to 1.28 and barely moved a sparse one.
- **Face tools reject at the default angle.** At `high` (about 10 degrees) every portrait failed with an angle or size error. At `flexible` every one succeeded. `face_quality` still flags a poor photo (`area: toosmall`, `frontal: notgood`) on a result that succeeded.
- **Skin colour follows skin tone.** Six generated women from very fair to very dark read brightness 155, 151, 146, 113, 76, 78 and Fitzpatrick II, II, III, V, VI, VI. Fitzpatrick needs `version: '1.0'` in the body, which its docs page leaves out.
- **Only `skin_color` is reliable.** It moved about 2 hex units when a photo was dimmed, brightened or warmed. Eye colour names changed with the light, and a bald man's hair colour read "Blonde".
- **Face aspect ratio is a usable number.** One face gave 1.346 to 1.361 across four lighting versions, about 1 percent. The face shape label is coarser.
- **Clothes v4 is faithful.** It keeps the face, pose and background and changes only the garment, for `garment_category` `outer` and `upper_body`, on chest up and waist up photos.
- **Chaining works.** Clothes into hair transfer into brow makeup kept every earlier change and found the face each time.
- **Brow makeup works** on bald and shaved heads. The change is subtle.
- **Hat try on is not usable.** It returns a new picture of a styled person in another scene. The face is not reliably the person's, and the required `gender` (`female` or `male`) changes who is generated. The scarf tool is assumed to behave the same.
- **Image generator.** `text_to_image` and `image_to_image` (`youcam-image-v2`, 1 unit each) make synthetic test photos for the spike. The product never calls them. Text to image takes five sizes, such as `1104*1472`. Image to image kept the same face, clothes and background across five hair stages (`packages/fixtures/sample`). Tasks take 8 to 15 seconds. Set `prompt_extend: false` for tight control, and say "wearing a plain t-shirt" or a person can come out bare shouldered.

## Not built yet
- The Redis token bucket shared by all workers (architecture.md section 6). The client only backs off on a 429.
- A separate poll queue. The gateway polls inside the run job (5 to 20 seconds apart, up to 5 minutes), and a task row left in `created` is polled again on redelivery.
- Reconciling `unknown` tasks, and switching live calls off by itself on `auth` or `out_of_units`.
- A tool entry for skin analysis (`skin-analysis`). Its prices are in `youcam.constants.ts`.
- Wrappers for bg-replace, image-to-video, look-vto and the template lists, which only the spike runner reads.
- Clothes v4 is called with the body photo and a catalog picture as `ref_file_id`, one call per saved piece, and the fixture key hashes both pictures. The spike ran it on real garment photos; the sample catalog's pictures are drawn placeholders, so none of its calls is recorded yet. Live clothes calls for the sample personas wait on a catalog with licensed pictures and an agreed cap.
- Not yet seen succeed live: hair type (needs three angle photos), hair color and beard style. The template lists were read once (116 hair transfer templates, 15 beard style ones, all unisex `all_` ids for beards) and the looks in `packages/templates/src/looks.ts` come from them.

## Spike runner
Runs the live part of the spike ([product/spec.md](../product/spec.md) section 17) from a JSON manifest of calls. It is a dry run unless `--yes` is given. Live calls cost real money (500 units cost 27.50 dollars), so spending also needs `--max-units <n>`, a cap on the whole batch. The runner refuses if the estimate is over the cap or any run has no confirmed price, and stops before a run that would pass it. It needs `YOUCAM_MODE=record`, `JUDGE_MODE_FORCE_REPLAY=false`, `LIVE_CALLS_ENABLED=true` and `YOUCAM_API_KEY` (copy `.env.example` to `.env` first).

```bash
pnpm --filter @interim/api spike credit                        # units left, free
pnpm --filter @interim/api spike costs [filter]                # Get_Feature_Cost, free
pnpm --filter @interim/api spike templates hair-transfer v2.1  # template list, free
pnpm --filter @interim/api spike renders [filter]              # save finished runs' images, free
pnpm --filter @interim/api spike batch .spike/manifest.json    # dry run: estimate and photo check, sends nothing
pnpm --filter @interim/api spike batch .spike/manifest.json --yes --max-units 40
```

Photos are processed the way the app stores them. Each run records its state, error code, units spent (balance before and after) and seconds to `apps/api/.spike/results.jsonl`, its final response to `.spike/fixtures/<tool>/<label>-<hash>.json` and its image to `.spike/renders/<label>.jpg`, so one run can feed the next. A create that times out is never repeated. `.spike/` is ignored by git. Copy a fixture to `packages/fixtures/youcam` only after checking it is synthetic or from someone who gave written consent. `spike/manifest.example.json` covers the plan's experiments.

## Recording the sample personas
`pnpm --filter @interim/api record-samples --max-units <n>` runs the real agent loop on the ten sample photos (a baseline, then four check ins, per persona) against an in-memory database, so each fixture is named by the pipeline's cache key. It serves a call from its fixture when one exists and goes live only for the rest. Without `--yes` it is a dry run that prices the missing calls and sends nothing. With it, the same env as the spike applies, and the ledger refuses any call that would pass the cap. The spike's hair length results do not match: they were taken on the full size originals, so the photo hashes differ. The measured units per run go to `.spike/samples-summary.json`.
