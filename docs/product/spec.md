# Interim: Product Specification

Version 1, October 18, 2026
Companion documents: overview.md, ../architecture.md

## 1. Scope

This spec covers the hackathon build. It defines what the product does, what it stores, how the agent decides, and how the work is judged done. Items marked "to verify" depend on facts about the YouCam API that are not confirmed yet and are settled in the first 48 hours (section 17).

## 2. Users

* **Individual.** Picks a situation, captures a baseline, then adds check ins. Reads Stage Cards.
* **Judge or visitor.** Opens a sample profile with one tap and no signup. Runs on recorded fixtures only.
* **Partner agent.** Another agent calling Interim over MCP.

There are no admin or care team roles in this build.

## 3. Core concepts

* **Profile.** One person's ledger, created from a situation template.
* **Snapshot.** One dated set of photos with the measurements taken from them. The first snapshot is the baseline.
* **Measurement.** One value from one YouCam tool, with the tool name, the cost in units and the snapshot it came from.
* **Stage.** A named point on the template path. Each template defines its own stages.
* **Render.** One generated image from a YouCam try on tool, linked to its inputs.
* **Stage Card.** The final output of a run.
* **Run.** One execution of the agent for one snapshot.
* **Unit ledger.** An append only record of estimated and settled unit costs.

## 4. Templates

A template is configuration, not code. Each template defines:

* key and display label (neutral wording, see section 13)
* ordered list of stages with the measurement thresholds that place a person in each one
* check in cadence and a minimum gap between runs
* per stage list of allowed tools and the fallback order when one is not allowed
* a hold or buy rule for garments, where the template uses fit
* a unit budget per run

Template keys: weight_change, midlife_change, after_a_baby, going_grey, textured_growth, beard_growth, hair_loss_ahead.

### Stage examples

* hair_loss_ahead: full, thinning, short, none, regrowing
* weight_change: baseline size, size down one, size down two, stable
* beard_growth: clean, stubble, short, full
* going_grey: mostly coloured, mixed, mostly grey

Exact stage thresholds are tuned during the spike. They live in template config and can change without code changes.

## 5. Capture requirements

Guided capture in the browser, with checks before any upload.

* Front face photo: face visible, yaw within 10 degrees, even light, resolution above the YouCam minimum.
* Left and right side photos for hair type: yaw above 15 degrees, same size as the front photo.
* Top of head photo at a 45 degree downward angle for density.
* Full length photo for hair length and for body fit.
* Full body or chest up photo for garments, as the clothes tool requires.

Each check is run on the device. A photo that fails a check is rejected with a plain instruction and nothing is uploaded or charged. Exact framing requirements come from the YouCam docs and are confirmed in the spike.

## 6. Measurements taken

At baseline, once per profile:

* Hair type detection
* Hair density detection
* Hair length detection
* Face attributes (face shape)
* Skin tone analysis, once only because of its cost
* Full body photo stored for fit renders

At each check in, only what the stage model says is worth measuring:

* Density when the stage model expects a change
* Length when the template tracks length
* Nothing at all when the stage model expects no change and the user reports none

## 7. Tool eligibility rules

Eligibility is decided in code. The model reads the result and never overrides it.

Rules, in order of evaluation:

1. A tool is blocked if the snapshot failed its on device capture check for that tool.
2. A tool is blocked if a recorded result for the same photo hash, tool and parameters already exists. The recorded result is returned instead and no new call is made.
3. Hair transfer (hairstyle v2.1) is allowed only when the snapshot shows hair present. Preflight uses the density grade and length stage measured for this snapshot, against thresholds in template config (to verify).
4. Hair transfer is marked blocked for the snapshot, and cached as blocked, when the API returns error_hair_too_short or error_bald_image. The agent then moves to the fallback order.
5. Fallback order when hair transfer is blocked: hat try on, brow makeup try on, then renders from the baseline hair photos labelled as earlier looks.
6. Beard style is allowed only in the beard template, or when the user marks beard as a goal.
7. Hair volume previews are allowed only when density is present and are always labelled as visual previews.
8. Clothes try on is allowed only when the full body or chest up photo passes capture checks.
9. A tool is blocked when its estimated cost would exceed the remaining run budget.

The eligibility table is published in the project readme, built from the spike results.

## 8. Agent loop

Each run follows this loop. The model chooses steps inside it. Code enforces the rules.

1. **Observe.** Load the profile, template, previous snapshot and the new snapshot. Run capture checks again on the server.
2. **Measure.** Ask the planner which measurements are worth taking, filtered by eligibility. Take them. Add each to the ledger.
3. **Place.** Compute the stage from measurements and the template thresholds. If the stage changed since the last snapshot, record the change.
4. **Decide.** The planner picks a strategy for this stage from the template's allowed list: cut, volume, colour, cover or hold. It must name the measurement that supports the choice.
5. **Act.** Render two to four options within budget. Render saved garments again on the new photo if the template uses fit.
6. **Compose.** Build the Stage Card from tool outputs. The model writes the explanations. Every number on the card must come from a measurement record.
7. **Stop.** Stop when the budget is spent, when two strategies in a row fail eligibility, or when the card is complete. Record why it stopped.

Every step is stored as a trace entry with the tool, inputs, outputs, cost and a one line reason. The trace is shown on the card in short form.

### Planner rules

* The planner may only call tools that eligibility allows.
* The planner may not state a number that is not in a measurement record.
* If the planner asks for something not possible (for example a render with no valid photo), the run records the refusal and tries the fallback.
* The planner never mentions causes, medication or health findings.

## 9. Stage Card

Fields:

* title and date
* situation label and current stage
* what changed, each line with the measurement and tool that produced it
* options, each with a render, a short reason and a label saying preview
* what to hold off buying, with the reason
* shopping list with sizes (from the sample catalog)
* trace summary (what the agent decided and why)
* one line suggesting a professional for health questions, shown only on sensitive situations
* actions: approve list, share link, delete

## 10. Unit ledger and budgets

* Every YouCam call writes an estimate before it is made, from Get_Feature_Cost where available, and a settled cost after the task succeeds.
* Units are charged only on success. A failed task settles at zero.
* Errors can arrive as HTTP 200 with a task status of error. The client must treat those as failures.
* There is no idempotency key, so a create call is never repeated unless the earlier task is known to have failed.
* Budgets: a per run cap, a per profile cap and a global daily cap, all in config.
* The unit ledger view shows each call, its cost and why it was made.

Cost table, to verify in the spike:

* Hair type detection: 2 units
* Beard style: 2 units
* Hair color: 1 unit
* Makeup try on: 1 unit
* Skin analysis: 9 to 22 units depending on tier
* Skin tone analysis: about 20 units, baseline only
* Hairstyle render: about 2 units, from a public repo, unconfirmed
* Hair density, hair length, hair volume, clothes v4: not confirmed

## 11. Error mapping

Each YouCam error maps to a plain sentence for the user and a next action for the agent.

* error_hair_too_short and error_bald_image: tell the user this tool cannot work on this photo, mark it blocked, use the fallback order.
* error_face_angle_invalid and error_insufficient_lighting: ask for a new photo with a specific instruction. No retry.
* error_no_face and error_large_face_angle: ask for a new photo. No retry.
* HTTP 429: wait with growing delay and random jitter, because there is no Retry After header. The limit is 250 requests per 300 seconds.
* Any task with a status of error inside an HTTP 200: treat as failed, log, do not charge the ledger.

## 12. Privacy and consent

* Consent screen before the first upload, in plain language, saying what is stored and for how long.
* Photos stored encrypted, deleted automatically after 30 days or on request.
* YouCam deletes uploaded files after 24 hours, so Interim keeps its own copy and uploads again when needed.
* One tap to delete a profile and everything in it.
* Only the person in the photo can be photographed. The consent text says so.
* No data is sold or shared. No health records are collected.

## 13. Language and safety rules

Applies to the app, the agent output, the landing page and the video.

* Banned in user facing text: patient, treatment, diagnosis, cure, heal, regrow, medication names, and any wording that names a cause of a change.
* Situation labels shown to users: Weight change, Midlife change, After a baby, Going grey, Growing out textured hair, Growing a beard, Hair loss ahead.
* The planner prompt contains the same banned list. A test checks outputs against it.
* A test scans all strings in the app and templates and fails the build on a banned word.
* Previews are labelled "preview" and never promise a result.
* Body Reshape is not called. Renders only use real photos from check ins.
* On sensitive situations, one line on every card suggests speaking to a professional for health questions.

## 14. Judge mode

* One tap opens a sample profile. No signup.
* Judge mode runs only on recorded fixtures. A visible stamp reads "Recorded on" with the date.
* Recorded responses are saved from real runs during the build.
* A toggle for live mode exists but is off by default, so judges cannot spend units.
* Sample profiles are labelled as demo profiles, with simulated stages marked as such.

## 15. MCP tools

The same engine is exposed over MCP.

* create_profile(template)
* add_snapshot(profile_id, photos)
* run_checkin(profile_id, snapshot_id)
* get_stage_card(run_id)
* eligible_tools(snapshot_id)
* unit_ledger(profile_id)

Tool results carry the same trace and measurement references as the app. A partner agent cannot bypass eligibility or budgets.

## 16. Acceptance tests

1. A blurry or badly angled photo is rejected on the device and costs zero units.
2. Uploading the same photo twice does not create a second paid call.
3. When hair transfer returns error_hair_too_short, the agent switches to the fallback order and the card says why.
4. Every number on a Stage Card matches a measurement record.
5. The banned word scan passes on the whole app, and fails on a test string.
6. Judge mode makes no live YouCam calls.
7. Deleting a profile removes photos, measurements and renders.
8. A 429 response leads to a delayed retry, not a failure.
9. A task that returns an error inside HTTP 200 is not charged.
10. All seven templates load from config and run through the same code path.

## 17. First 48 hours: spike plan

Answer these before building the rest.

1. Call Get_Feature_Cost for density, length, volume, hair transfer v2.1 and clothes v4. Fill the cost table with real numbers.
2. Run density detection on six top of head photos of different fullness at 45 degrees. If the grade never moves, stop using density as a trigger and use length plus user report.
3. Run hair transfer v2.1 with hair_color set to src on photos with less and less hair. Record exactly where the two errors start. This becomes the eligibility table.
4. Test chaining. Pass a clothes render into hair transfer, then into makeup. If face detection fails on generated images, render hair on the original photo and composite, or change the order.
5. Render one saved garment on two different body photos to confirm the size bridge moment looks believable.
6. Record every response into fixtures from the first call.

Kill criterion: if density does not move and hair transfer rejects most thinning hair, switch to the runner up idea (a hair catalog agent for wig and extension sellers). It reuses the same YouCam client, ledger and hair transfer work.

## 18. Numbers to publish in the readme and video

In the style of the Round 1 winners, publish measured results.

* median render time per tool
* error rate per tool across about 20 test runs
* units per baseline and units per check in
* how often the eligibility rules prevented a paid failure

## 19. Out of scope

Native apps, accounts for care teams, any health data, real checkout, insurance features and live catalog sync.
