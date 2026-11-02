# YouCam integration

Design: [architecture.md](../architecture.md) section 6. Eligibility rules, error mapping and the cost table: [product/spec.md](../product/spec.md) sections 7, 10 and 11. This doc holds the API facts the client relies on and what is not built yet. Code is in `apps/api/src/youcam`.

| File | Holds |
| --- | --- |
| `youcam.client.ts` | `YoucamClient`: upload, create task, get task, balance, prices, record and replay |
| `youcam.tools.ts` | One entry per tool: version, path, request schema, result schema |
| `youcam.errors.ts` | `YoucamError` kinds and the task error to action table |
| `youcam.constants.ts` | Cost table, rate limit, base URL |
| `youcam.gateway.ts` | `YoucamGateway`: the one path every call takes (recorded result, reserve, task row, upload, create, poll, settle, cache), and `youcamFixtureKey` |
| `youcam.redis.ts` | `YoucamRedis`: the token bucket and the live switch every process shares |
| `task-reconciler.ts` | `TaskReconciler`: settles tasks left open for a day |
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

Every request to YouCam's API first takes a slot from a Redis token bucket shared by all workers (a burst of 5, then one every 1.225 seconds, so no 300 second window passes 250). A caller that would queue for over a minute gets `rate_limited` before anything is sent. A 401 or 403, or `CreditInsufficiency`, sets `youcam:live-off` in Redis: uploads and creates then throw `live_disabled` in every process, while polls and downloads stay open so existing tasks can finish. After fixing the cause, run `redis-cli del youcam:live-off`.

A task left in `intent`, `created` or `unknown` for 24 hours is settled at its full price by the cleanup sweep. YouCam has no way to list tasks, so whether the create happened cannot be learned; counting it keeps the caps on the safe side. The row stays `unknown`, so it is never sent again.

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
| `skin_analysis` | v2.1 `skin-analysis` | one tight, near frontal face, `dst_actions` (1 to 4 SD concerns) | `url` of a zip: masks and `score_info.json` | 9 |
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
- **Full outfit transfer works from a reference photo.** `garment_category: full_body` with `change_shoes: false` and `filter_multi_person: strict` carried a jacket, shirt and trousers from a reference onto a waist-up photo in one call, for 6 of 6 tries on 2 synthetic people (15 units with three generated references; clothes tasks took 18 to 25 seconds). Faces, pose and background held and body fullness stayed visibly different between the two people, judged by eye. Accessories were inconsistent (a chain was dropped once and kept once), sleeves, shirt length and drape changed, and shoes and head to toe were not tested because the photos end at the thighs. Real photos and head coverings are untested (spec section 17, items 13 and 14).
- **Chaining works.** Clothes into hair transfer into brow makeup kept every earlier change and found the face each time.
- **Brow makeup works** on bald and shaved heads. The change is subtle.
- **Hat try on is not usable.** It returns a new picture of a styled person in another scene. The face is not reliably the person's, and the required `gender` (`female` or `male`) changes who is generated. The scarf tool is assumed to behave the same.
- **Image generator.** `text_to_image` and `image_to_image` (`youcam-image-v2`, 1 unit each) make synthetic test photos for the spike. The product never calls them. Text to image takes five sizes, such as `1104*1472`. Image to image kept the same face, clothes and background across five hair stages (`packages/fixtures/sample`). Tasks take 8 to 15 seconds. Set `prompt_extend: false` for tight control, and say "wearing a plain t-shirt" or a person can come out bare shouldered.

- **Later live run, 35 units.** Succeeded: hair colour (Honey Blonde), four beard styles (`all_goatee`, `all_circle`, `all_anchor`, `all_shaved`), six hair transfer looks (`all_buzz_cut`, `all_pixie`, `all_crewcut`, `male_textured_crop`, `male_afro`, `all_dreadlocks`) and hair type. Errors cost nothing again.
- **Hair type** needs the three views in one size with the face large and inside the frame: full portraits failed with `error_face_position_too_small`, a tighter crop with `error_face_position_out_of_boundary`. The live grade is upper case ("4B to 4C"), where the docs use lower case. The views came from `image_to_image` on one portrait.
- **Skin analysis** is `v2.1` on the price list. A full portrait and one crop failed (`error_src_face_too_small`, `error_large_face_angle`) and a tight crop worked. It returns a zip link, not JSON.

## Not built yet
- A separate poll queue. The gateway polls inside the run job (5 to 20 seconds apart, up to 5 minutes), and a task row left in `created` is polled again on redelivery. Build it if jobs outlive their lock, or runs wait on slow tasks.
- A per profile share of the rate limit bucket. Callers queue in order.
- Nothing calls skin analysis yet, and the zip it returns is not read. Larger concern counts and HD cost more (`skinAnalysisUnits`) and are refused by the request schema.
- Wrappers for bg-replace, image-to-video, look-vto and the template lists, which only the spike runner reads.
- Clothes v4 is called with the body photo and a catalog picture as `ref_file_id`, one call per saved piece, and the fixture key hashes both pictures. Some calls are recorded in `packages/fixtures/youcam/cloth_v4`; a piece with no recording is skipped in replay. Style previews call it with the person's current photo and an uploaded reference outfit, with `garment_category: full_body`, `change_shoes: false` and `filter_multi_person: strict`, and the fixture key hashes both photos and those parameters (`StyleRenderService`). Three synthetic references (`packages/fixtures/own/style`) on `own/b/body-1.jpg` and `body-2.jpg` are recorded, and a test uploads them to prove the keys match. Live clothes calls for anything else wait on an agreed cap.
- The `cover` strategy has no tool and no template offers it: hat and scarf try on are unusable (see Observed live), and a covered head keeps brow makeup, advice and its other strategies. A test pins that no template lists it.
- The template lists were read once (116 hair transfer templates, 15 beard style ones, all unisex `all_` ids for beards) and the looks in `packages/templates/src/looks.ts` come from them.

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
