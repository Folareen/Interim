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

Thrown `YoucamError` kinds: `live_disabled`, `replay_missing`, `auth`, `out_of_units`, `rate_limited`, `invalid_request`, `unknown_outcome` (create timed out or got a 5xx; mark the task `unknown`, do not re-send), `transient` (poll or upload; retry later). Only a 429 is retried inside the client (up to 5 times, doubling wait with jitter).

## API facts (from docs.perfectcorp.com, read 2026-10-20)
- Base URL `https://yce-api-01.makeupar.com`. Auth: `Authorization: Bearer <key>`, no separate auth call.
- Upload: `POST /s2s/v2.0/file` with `files[{content_type, file_name, file_size}]`, then `PUT` the bytes to `data.files[0].requests[0].url` with the returned headers. Skipping the PUT gives a 500 `unknown_internal_error` or a 404 on create.
- Create: `POST /s2s/{version}/task/{path}` returns `data.task_id`. Poll: `GET /s2s/{version}/task/{path}/{task_id}` returns `data.task_status` (`running`, `success`, `error`), `data.error`, `data.results`.
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

Normalisation must produce a JPEG within the strictest limit a photo is sent to.

## Status
Done: transport, tool registry for the eight tools above, error mapping, record and replay, live switch, 429 handling, tests with a mocked `fetch`.

Not done:
- The Redis token bucket shared by all workers (architecture.md section 6). `YoucamClient` only backs off on 429.
- The reserve, task row, call_cache and poll queue steps that wrap the client.
- Skin analysis (`skin-analysis`, SD and HD, with `dst_actions`) has a cost table in `youcam.constants.ts` but no tool entry; add it when a template needs it.
- Makeup try on, clothes v4, face attributes and face tone have no tool entries yet. Their paths, from YouCam's own [agent skills](https://github.com/YouCam-API/skills) (API snapshot of 2026-10-01) and the Markdown docs (append `.md` to a `docs.perfectcorp.com/reference/…` page), read 2026-10-20:
  - `skin-tone-analysis` v2.0 (Facial Color Tones Analyzer): one front photo, returns `data.results.color` with hex `skin_color`, `eye_color`, `eyebrow_color`, `lip_color`, `hair_color`, plus eye and hair colour names. 20 units, charged only on success. The skin_colour template's measurement.
  - `face-attr-analysis` v2.0: face shape, features and ratios, selected through `features`. It can also return age and gender. Interim never requests those.
  - `cloth-v4` v2.0: `src_file_id`, `ref_file_id` or `template_id`, and `garment_category` (`full_body`, `lower_body`, and others not listed). Cost not in the docs table. The doc contradicts itself on framing (full body in the steps, chest up in the file specs).
  - `makeup-vto` and `look-vto` v2.0 for brow and makeup fallbacks.
  - Free account calls: `/s2s/v1.0/client/credit` (balance) and `/s2s/v2.0/credit/feature-cost`.
- Error codes in those docs that `youcamErrorCodes` does not list yet: `error_face_not_forward_facing`, `error_face_angle_upward`, `error_face_angle_downward`, `error_face_angle_leftward`, `error_face_angle_rightward`, `error_face_angle_left_tilt`, `error_face_angle_right_tilt`, `error_invalid_ref`, `error_apply_region_mismatch`, `error_invalid_src`, `error_editing_failed`, `error_multi_person`. Add them with their mapping before these tools are called.
- No call has been made against the live API. Request and result schemas follow the docs and must be checked in the spike. Items marked unconfirmed: the `hair_volume` request fields, `content_type` spelling (`image/jpg` follows the examples), the Get_Feature_Cost response types, and whether `fitzpatrick` accepts a single `src_file_id`.

## Safety rules for calls
- Nothing is sent unless `LIVE_CALLS_ENABLED=true`. Replay never touches the network, and a missing fixture is an error.
- Reserve units first, write the task row as `intent`, then send. Never re-send a create call; only a 429 is retried.
- The rate limit bucket lives in Redis and is shared by all workers.

## Open questions
Owned by [product/spec.md](../product/spec.md) section 17. Record answers in the spec and update the cost table.
