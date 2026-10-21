# YouCam integration

Design: [architecture.md](architecture.md) section 6. Eligibility rules, error mapping and the cost table: [product/spec.md](../product/spec.md) sections 7, 10, 11. This doc tracks implementation state, the API facts the client relies on, and open questions.

Code: `apps/api/src/youcam`.

| File | Holds |
| --- | --- |
| `youcam.client.ts` | `YoucamClient`: upload, create task, get task, feature costs, record and replay |
| `youcam.tools.ts` | One entry per tool: version, path, request schema, result schema |
| `youcam.errors.ts` | `YoucamError` kinds and the task error to action table |
| `youcam.constants.ts` | Cost table, rate limit, base URL |
| `youcam.module.ts` | Builds the client from env |
| `spike/` | The spike runner and its manifest schema. Not part of the build |

## Modes (`YOUCAM_MODE`)
- `live`: real calls, spends units.
- `record`: real calls, finished task responses saved to `YOUCAM_FIXTURES_DIR` (`packages/fixtures/youcam/<tool>/<fixtureKey>.json`). Signed link query strings are cut before saving.
- `replay`: no network, serves fixtures. `JUDGE_MODE_FORCE_REPLAY=true` forces this and wins over `YOUCAM_MODE`.

Default is `replay` so a fresh checkout never spends units. `live` and `record` also need `LIVE_CALLS_ENABLED=true` and a key; otherwise the client throws before any request.

## Using the client
The caller owns the ledger, task rows, call_cache and the poll queue. The client does only the YouCam steps:

1. `uploadPhoto(photo)` returns a file id (valid 24 hours).
2. `createTask(tool, body, fixtureKey)` returns a `TaskRef`. `fixtureKey` is the call_cache key and names the fixture. Never call it twice for one logical task.
3. `getTask(ref)` returns `running`, `success` with a typed result, or `error` with the code and an action (`block_tool`, `new_photo`, `fault`). A task error inside HTTP 200 is returned, not thrown.
4. `getFeatureCosts()` pages through Get_Feature_Cost (live only).
5. `getSpendableUnits()` reads the account balance: the sum of credit batches whose type starts with `Api` (live only, free).

Thrown `YoucamError` kinds: `live_disabled`, `replay_missing`, `auth`, `out_of_units`, `rate_limited`, `invalid_request`, `unknown_outcome` (create timed out or got a 5xx; mark the task `unknown`, do not re-send), `transient` (poll or upload; retry later). Only a 429 is retried inside the client (up to 5 times, doubling wait with jitter).

## API facts (from docs.perfectcorp.com, read 2026-10-20)
- Base URL `https://yce-api-01.makeupar.com`. Auth: `Authorization: Bearer <key>`, no separate auth call.
- Upload: `POST /s2s/v2.0/file` with `files[{content_type, file_name, file_size}]`, then `PUT` the bytes to `data.files[0].requests[0].url` with the returned headers. Skipping the PUT gives a 500 `unknown_internal_error` or a 404 on create.
- Create: `POST /s2s/{version}/task/{path}` returns `data.task_id`. Poll: `GET /s2s/{version}/task/{path}/{task_id}` returns `data.task_status` (`running`, `success`, `error`; Makeup VTO's docs also list `queued` and `processing`, which the client treats as running), `data.error`, `data.results`.
- Results and files live 24 hours. Download links in results are valid about 2 hours. Polling is required; the docs suggest about every 10 seconds.
- Units are not consumed while `running`. The docs say a task that times out still consumes units, so poll to a final state within 24 hours.
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

Template lists: `GET /s2s/v2.1/task/template/hair-transfer`, `/s2s/v2.0/task/template/beard-style`, `/s2s/v2.0/task/template/hair-vol`. Not wrapped yet.

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
| clothes v4 | jpg, png | under 10 MB | 512 x 384 minimum, 4096 px long side, recommended 1024 x 768, person fills 80 percent of the frame, standing, facing forward, face visible. Chest up and waist up photos worked in the spike. `filter_multi_person` can reject other people |
| makeup VTO | jpg, jpeg, png | under 10 MB | face fully visible, front within 10 degrees. The docs give conflicting size limits (long side under 1920 or width under 1920 and height under 1080) |

Normalisation must produce a JPEG within the strictest limit a photo is sent to.

The face analysers return `face_quality` (`has_face`, `area`, `frontal`, `lighting`, `faceangle`, each such as "good"), which is YouCam's own read of the photo. It arrives with the result, so it is not a free pre-check.

## Status
Done: transport, tool registry for the tools above, error mapping, record and replay, live switch, 429 handling, tests with a mocked `fetch`, and the spike runner. Confirmed against the live API on 2026-10-21: upload with `content_type` `image/jpg`, hair length, hairstyle with `template_id` and `hair_color: src`, hair volume with `template_id`, skin tone, face shape and ratio, clothes v4, brow makeup, Get_Feature_Cost and the credit balance.

Not done:
- The Redis token bucket shared by all workers (architecture.md section 6). `YoucamClient` only backs off on 429.
- The reserve, task row, call_cache and poll queue steps that wrap the client.
- Skin analysis (`skin-analysis`, SD and HD, with `dst_actions`) has a cost table in `youcam.constants.ts` but no tool entry; add it when a template needs it.
- Not wrapped: bg-replace, image-to-video, look-vto, hat and scarf (generative scenes, see below), and the template list endpoints, which only the spike runner reads.
- Not yet seen succeed live: hair density (needs the head lowered pose), hair type (needs three angle photos), hair color, beard style and Fitzpatrick.

## Observed live
From about 160 runs on 2026-10-21 (about 600 units): 18 freely licensed portraits and 2 product photos, then 31 synthetic images made with the YouCam image generator. The portraits are professional photos, not selfies.

- **Errors cost nothing.** Face angle (`error_face_angle_invalid`, `_downward`, `_leftward`, `_rightward`) and `error_face_position_too_small` changed the balance by 0. Moderation and timeouts are untested.
- **Timing.** Detections, hair transfer and brows took about 10 to 20 seconds, clothes 25 to 40 seconds. Poll about every 5 seconds.
- **Result links are signed** and last about two hours. The fixture writer cuts the signature, so the runner saves each render as soon as a task finishes (`.spike/renders`).
- **Get_Feature_Cost** returns `proc_unit` as a number. Every price in the docs matched.
- **Hair transfer works on any hair.** 11 of 11 succeeded with `hair_color: src`: two bald men, two shaved women, a very short grey haired woman, short, long and afro hair, and a hijab and a head wrap. On a bald head it adds the template hair. On a covered head it **replaces the covering** with hair. The result keeps the person's face, pose, clothes and background. It matched grey hair colour. Templates have ids like `male_short_curly` and `female_blunt_bob`, a title, `category_name` (Male or Female) and `keep_users_color`.
- **Hair volume works** with `template_id` on short, long and afro hair, and shows a visibly fuller look. Its five templates are all Female (`female_subtle`, `_natural`, `_medium`, `_high`, `_maximized`).
- **Hair length is coarse.** It reads a covered head, a bald head and a shaved head all as "above the ears". On a generated man, full hair and growing back both read "ear length"; on a generated woman it separated long, ear length and above the ears. It cannot place a stage on its own.
- **Hair density needs the head lowered about 45 degrees.** It returned `error_face_angle_invalid` on all ten frontal photos, and on three generated photos where the tilt was too slight. The grade is spelled "Extreme Low Density" (the docs say "Extremely"), and `mapping` can be negative.
- **Hair density follows fullness within one person.** One generated man, edited from thinning to thick at the same pose, went from -0.06 to 1.91 (Extreme Low to Medium). A thick haired woman read 2.50 (High). Sparse heads read -0.06 to 0.21. It is not comparable across people: a thick curly haired man read 0.92 (Low). So compare a person with their own baseline, not the label.
- **Density depends on light.** The same photos gave -0.06, -0.04 and 0.01 for a sparse head (dim, original, bright), but 1.28, 1.91 and 1.92 for a thick one. Dim light cost 0.6, so a change smaller than about 0.7 is not trustworthy unless the light is checked.
- **Face tools reject at the default angle.** At the default strictness (`high`, about 10 degrees) all six portraits tried, and three lighting copies of one, failed with an angle or size error. At `flexible` every one succeeded. `face_quality` still flags a poor photo (`area: toosmall`, `frontal: notgood`) on a result that succeeded.
- **Skin colour follows skin tone.** Six generated women, from very fair to very dark, read brightness 155, 151, 146, 113, 76 and 78 and Fitzpatrick II, II, III, V, VI, VI, in the right order. Fitzpatrick needs `version: '1.0'` in the body, which its docs page leaves out.
- **Skin colour is steady, other colours are not.** `skin_color` moved about 2 hex units when a photo was dimmed, brightened or warmed. Eye colour names changed with the light, and hair colour was wrong for bald heads ("Blonde"). Use only `skin_color`.
- **Face aspect ratio is a usable number.** The same face gave 1.346 to 1.361 across four lighting versions, about 1 percent. The face shape label is coarser.
- **Clothes v4 is faithful.** It keeps the face, pose and background and changes the garment, with `garment_category` `outer` and `upper_body`. It works on chest up and waist up photos, and costs 2 units.
- **Chaining works.** A clothes render fed to hair transfer, and that render fed to brow makeup, each kept the earlier changes and found the face.
- **Brow makeup works** on bald and shaved heads. The change is subtle.
- **Hat try on is not usable.** It returns a new picture of a styled person in a different scene, wearing the hat. The face is not reliably the person's, and `gender` (required, `female` or `male`) changes who is generated. The scarf tool is assumed to behave the same.

## Safety rules for calls
- Nothing is sent unless `LIVE_CALLS_ENABLED=true`. Replay never touches the network, and a missing fixture is an error.
- Reserve units first, write the task row as `intent`, then send. Never re-send a create call; only a 429 is retried.
- The rate limit bucket lives in Redis and is shared by all workers.

## Open questions
Owned by [product/spec.md](../product/spec.md) section 17. Record answers in the spec and update the cost table.

## Image generator
`text_to_image` and `image_to_image` (`youcam-image-v2`, 1 unit each) make synthetic test photos for the spike. The product never calls them. Text to image takes five sizes (for example `1104*1472`). Image to image edits one to three photos from a prompt, and kept the same face, clothes and background across five hair stages (`packages/fixtures/sample`). Results come back in about 8 to 15 seconds. Set `prompt_extend: false` for tight control. Without a clothing instruction a person can come out bare shouldered, so say "wearing a plain t-shirt".

## Spike runner
Runs the live part of the spike plan ([product/spec.md](../product/spec.md) section 17) from a JSON manifest of calls. It is a dry run unless `--yes` is given. Live calls cost real money (500 units cost 27.50 dollars), so spending also needs `--max-units <n>`, a cap on the whole batch: the runner refuses if the estimate is over the cap or any run has no confirmed price, and stops mid batch before a run that would pass it. It needs all three switches: `YOUCAM_MODE=record`, `JUDGE_MODE_FORCE_REPLAY=false`, `LIVE_CALLS_ENABLED=true`, plus `YOUCAM_API_KEY`. Copy `.env.example` to `.env` first.

```bash
pnpm --filter @interim/api spike credit                      # units left, free
pnpm --filter @interim/api spike costs [filter]              # Get_Feature_Cost, free
pnpm --filter @interim/api spike templates hair-transfer v2.1  # template list, free
pnpm --filter @interim/api spike renders [filter]             # save the image of finished runs, free (tasks last 24 hours)
pnpm --filter @interim/api spike batch .spike/manifest.json  # dry run: estimate, checks photos, sends nothing
pnpm --filter @interim/api spike batch .spike/manifest.json --yes --max-units 40
```

Photos are processed the way the app stores them (orientation applied, EXIF removed, long side capped). Each run records the task state, error code, units spent (balance before and after) and seconds to `apps/api/.spike/results.jsonl`, and the final response to `.spike/fixtures/<tool>/<label>-<hash>.json`. Each success also saves its render to `.spike/renders/<label>.jpg`, so a run can be fed another run's output. A create that times out is never repeated. `.spike/` is ignored by git. Copy a fixture to `packages/fixtures/youcam` only after checking it is synthetic or from someone who gave written consent. `spike/manifest.example.json` covers the plan's experiments.
