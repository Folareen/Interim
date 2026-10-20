# Interim: Product Specification

Version 1.2, October 20, 2026
Companion documents: overview.md, ../architecture.md

## 1. Scope

This spec covers the hackathon build. It defines what the product does, what it stores, how the agent decides, and how the work is judged done. Items marked "to verify" depend on facts about the YouCam API that are not confirmed yet and are settled in the first 48 hours (section 17). Section 17 is the single owner of open questions; other docs link to it.

## 2. Users

* **Individual.** Picks a situation and a tone, captures a baseline, then adds check ins. Reads Stage Cards.
* **Partner agent.** Another agent calling Interim over MCP with a partner key. It never sees photos and cannot give consent for a person (section 15).

There are no admin or care team roles in this build.

## 3. Core concepts

* **Profile.** One person's ledger, created from a situation template.
* **Snapshot.** One dated set of photos with the measurements and self report taken with them. The first snapshot is the baseline.
* **Measurement.** One value from one YouCam tool, with the tool name and the snapshot it came from. Its cost is found in the unit ledger through the task id.
* **Self report.** What the person tells Interim at a check in: whether anything changed (none, some, a lot), for fit templates their current size, and optionally the moment coming up.
* **Tone.** How the companion talks to this profile: practical, warm (the default) or light. Stored on the profile.
* **Moment.** What the person is getting ready for, from a fixed list: back_to_work, family_event, date, photos, video_call, going_out, everyday.
* **Companion note.** The first block of a Stage Card. Rules in [overview.md](overview.md#the-companion).
* **Words for today.** One passage a day from a fixed library, from the set the person chose (off by default).
* **Stage.** A named point on the template path. Each template defines its own stages.
* **Render.** One generated image from a YouCam try on tool, linked to its inputs.
* **Stage Card.** The final output of a run.
* **Run.** One execution of the agent for one snapshot.
* **Unit ledger.** An append only record of reserved, settled and released unit costs. It holds no personal data and survives profile deletion.

## 4. Templates

A template is configuration, not code. Each template defines:

* key, version and display label (neutral wording, see section 13)
* ordered list of stages with the measurement thresholds that place a person in each one
* check in cadence, a minimum gap between runs, and how many check ins may pass before measurements are taken again (`remeasure_every`, default 3)
* per stage list of allowed tools and the fallback order when one is not allowed
* a hold or buy rule for garments, where the template uses fit
* a unit budget per run
* whether the situation is sensitive (drives the professional line, the link to someone to talk to and the body image rules)
* whether body photos are on by default (off for after_surgery until the person turns them on)

Template keys: hair_loss_ahead, hair_patches, face_fullness, after_surgery, skin_colour, weight_change, midlife_change, after_a_baby, going_grey, textured_growth, beard_growth.

Sensitive templates: hair_loss_ahead, hair_patches, face_fullness, after_surgery, skin_colour, weight_change, midlife_change, after_a_baby.

Every run stores the template key and version it used, so an old card can be explained after thresholds change.

### Stage examples

* hair_loss_ahead: full, thinning, short, none, growing_in
* hair_patches: full, patchy, widespread, growing_in
* face_fullness: usual, fuller, settling
* after_surgery: recovering, settling, settled
* skin_colour: usual, changing, settled
* after_a_baby: full, shedding, growing_in
* weight_change: baseline size, size down one, size down two, stable
* beard_growth: clean, stubble, short, full
* going_grey: mostly coloured, mixed, mostly grey

Stage keys are internal and never shown. Display labels are written separately in template config and pass the language scan. Exact stage thresholds are tuned during the spike. They live in template config and can change without code changes.

For weight_change, face_fullness and after_surgery the stage is placed from the self report, not from a measurement. The card says "reported".

## 5. Capture requirements

Guided capture in the browser, with checks before any upload.

Photo kinds: front, left, right, top, body.

* **front.** Face visible, yaw within 10 degrees, even light, resolution above the YouCam minimum.
* **left and right.** For hair type, baseline only. Yaw above 15 degrees, same size as the front photo.
* **top.** Top of head at a 45 degree downward angle, for density. A person cannot hold this alone, so the wizard offers a five second timer with an on screen guide, or asks someone to take it. Skipping it is allowed and means density is not measured.
* **body.** Full body or chest up, as the clothes tool requires. One photo serves fit renders and, if the spike confirms, hair length. Required only for templates that use fit.

What each snapshot needs:

* Baseline: front, left, right, top where possible, and body for fit templates.
* Check in: front, plus top when density is tracked and body when the template uses fit.

Each check is run on the device. A photo that fails a check is rejected with a plain instruction and nothing is uploaded or charged. The light and angle checks are calibrated on a panel that spans skin tones and hair types (section 17). Exact framing requirements come from the YouCam docs and are confirmed in the spike.

Device checks are advisory. The server runs them again before any YouCam call.

### Upload handling

* Accepted: JPEG, PNG and HEIC, up to 12 MB, verified by file signature and not by file name.
* The server converts HEIC to JPEG, applies the orientation, strips all EXIF and location data, and resizes to the YouCam limits (to verify).
* The photo hash used for dedupe is taken after this normalisation, so the same picture uploaded twice matches.

### Self report

At each check in the person answers "Has anything changed since last time?" with none, some or a lot. Fit templates also ask for the current size, chosen from the size ladder in the sample catalog. An optional "Anything coming up?" picks one moment from the fixed list. These are not health fields, and none of them is free text.

## 6. Measurements taken

At baseline, once per profile:

* Hair type detection
* Hair density detection
* Hair length detection
* Face attributes (face shape)
* Skin tone analysis, once only because of its cost
* Body photo stored for fit renders

At each check in, measurements are taken when any of these is true:

* the self report says some or a lot of change
* the stage model expects a change
* `remeasure_every` check ins have passed without a measurement

What is measured then: density when the stage model expects change, length when the template tracks length.

When nothing is measured, stage placement uses the last measurements and the card shows the date they were taken ("last measured on"). A card never presents an old value as new.

## 7. Tool eligibility rules

Eligibility is decided in code. The model reads the result and never overrides it.

Rules, in order of evaluation:

1. No live call is made when live calls are off (section 10) or the mode is replay. In replay a missing fixture fails closed with an error. It never falls through to the network.
2. A tool is blocked if the snapshot failed its capture check for that tool, on the device or on the server.
3. When a recorded success exists for the same normalised photo hash, tool, API version and parameters, the recorded result is returned and no new call is made. This is a reuse, not a block.
4. Hair transfer (hairstyle v2.1) is allowed only when the snapshot shows hair present. Preflight uses the density grade and length stage measured for this snapshot, against thresholds in template config (to verify).
5. Hair transfer is marked blocked for the snapshot, and cached as blocked, when the API returns error_hair_too_short or error_bald_image. The agent then moves to the fallback order.
6. Fallback order when hair transfer is blocked: hat try on, brow makeup try on, then renders from the baseline hair photos labelled as earlier looks. The last step works only while those photos are still retained (section 12). If they have expired, the card says so and offers to keep history for future check ins.
7. Beard style is allowed only in the beard template, or when the user marks beard as a goal.
8. Hair volume previews are allowed only when density is present and are always labelled as visual previews.
9. Clothes try on is allowed only when the body photo passes capture checks.
10. A tool is blocked when its estimated cost would exceed any remaining cap (run, profile, day, source, partner).

Short or shaved hair, head coverings and no hair are normal inputs. They block hair tools with neutral wording and never an error tone, and the face based flows still run.

The eligibility table is published in the project readme, built from the spike results.

## 8. Agent loop

Each run follows this loop. The model chooses steps inside it. Code enforces the rules.

1. **Observe.** Load the profile, template, previous snapshot and the new snapshot. Run capture checks again on the server.
2. **Measure.** Ask the planner which measurements are worth taking, filtered by eligibility. Take them. Add each to the ledger.
3. **Place.** Compute the stage from measurements, self report and the template thresholds. If the stage changed since the last snapshot, record the change.
4. **Decide.** The planner picks a strategy for this stage and moment from the template's allowed list: cut, volume, colour, cover or hold. It must name the measurement or self report that supports the choice.
5. **Act.** Render two to four options within budget. Render saved garments again on the new photo if the template uses fit.
6. **Compose.** Build the Stage Card from tool outputs. The model writes the companion note in the profile's tone and the explanations, with placeholders such as `{m:<measurement id>}`. Code fills in every number, date and size. Model text itself contains no digits and no number words.
7. **Stop.** Stop when the budget is spent, when two strategies in a row fail eligibility, or when the card is complete. Record why it stopped.

Every step is stored as a trace entry with the tool, inputs, outputs, cost and a one line reason. The trace is shown on the card in short form.

### Planner rules

* The planner may only call tools that eligibility allows.
* The planner may not state a number. Numbers come only from measurement records through placeholders.
* If the planner asks for something not possible (for example a render with no valid photo), the run records the refusal and tries the fallback.
* The planner never mentions causes, medication or health findings.
* The planner receives the situation key, stage, measurements, self report, moment and tone. It never receives photos, reflection text or the words for today choice.
* The companion note is at most three sentences, in the order notice, normalise, one thing for today. With the practical tone it skips feelings language and keeps the change and the step.
* If model text fails the language scan, the companion phrase scan or the placeholder check, it is retried once. A second failure uses the fixed text for that stage and tone from template config, and the trace records it.

## 9. Stage Card

Fields:

* title and date
* companion note, with the tone it was written in and the moment it plans for
* situation label and current stage
* what changed, each line with the measurement and tool that produced it, or the word "reported" for self reported size, and the date it was last measured
* options, each with a render, a short reason and a label saying preview
* what to hold off buying, with the reason
* shopping list with sizes. The size comes from the reported size and the catalog size chart. A render is a preview and never a fit guarantee.
* trace summary (what the agent decided and why)
* what to say, two or three fixed lines, shown only for moments with other people
* one line suggesting a professional for health questions and a link to someone to talk to, shown only on sensitive situations
* actions: approve list, share link, change tone, delete

Words for today is shown on the home screen, not on the card, so a shared card never reveals the person's faith.

## 10. Unit ledger and budgets

* Every YouCam call first reserves its estimated cost, from Get_Feature_Cost where available. After the task ends the reservation is settled at the actual cost or released.
* The reserve step runs in one database transaction against a budget counter row per scope, so two runs cannot both spend the last units.
* Caps, all in config: per run, per profile, per day (global), per source address per day, and per partner. Caps are checked at reserve time.
* A global switch (`LIVE_CALLS_ENABLED`) turns off all live calls at once. It is off unless set. When the YouCam account reports that it is out of units, the switch is turned off automatically and an alert is raised.
* Units are expected to be charged only on success and a failed task to settle at zero. This is to verify in the spike, including moderation and error cases. Until verified, settlement uses the actual charge observed.
* Errors can arrive as HTTP 200 with a task status of error. The client must treat those as failures.
* There is no idempotency key. Every call writes a task row in the state `intent` before it is sent and moves it to `created` with the YouCam task id once the response arrives.
* A create call is never repeated unless the earlier task is known to have failed. A task left in `intent` after a crash, a timeout or a 5xx is `unknown`. It is reconciled (to verify whether YouCam lists tasks) and its reservation is held until it is resolved. It is never created again automatically.
* A 429 means the task was not created, so it is the one create failure that is safe to retry.
* The unit ledger view shows each call, its cost and why it was made.
* Unit cost in money is tracked in config. The spike computes units and money per baseline and per check in, and the plan must keep cost per active member inside the price (section 18).

Cost table, from the YouCam docs (read 2026-10-20). Still to verify in the spike against Get_Feature_Cost:

* Hair type detection: 2 units
* Hair density detection: 1 unit
* Hair length detection: 2 units
* Hair volume: 2 units
* Hair transfer v2.1 (hairstyle): 2 units, preset or custom
* Hair color: 1 unit
* Beard style: 2 units
* Skin tone (Fitzpatrick skin type): 10 units, charged only when the task succeeds. The earlier figure of about 20 units is not in the docs.
* Skin analysis: 9 to 22 units. SD is 9, 12, 14, 16 and HD is 12, 16, 20, 22 for 1 to 4, 5 to 8, 9 to 12, 13 to 16 concerns.
* Makeup try on: 1 unit, page not read
* Clothes v4: not confirmed (the docs list clothes v2.0 and v3.0 at 2 units)

## 11. Error mapping

Each YouCam error maps to a plain sentence for the user and a next action for the agent.

* error_hair_too_short and error_bald_image: tell the user this tool cannot work on this photo, mark it blocked, use the fallback order.
* error_face_angle_invalid and error_insufficient_lighting: ask for a new photo with a specific instruction. No retry.
* error_no_face and error_large_face_angle: ask for a new photo. No retry.
* HTTP 429: wait with growing delay and random jitter, because there is no Retry After header. The limit is 250 requests per 300 seconds, shared by every caller of the key.
* Any task with a status of error inside an HTTP 200: treat as failed, log, release the reservation unless a charge is observed.
* Out of units or credits: stop the run, switch live calls off, raise an alert, tell the user to try later.
* 401 or 403: configuration fault. Stop live calls, alert, no retry. The user sees a generic try later message.
* Timeout or 5xx on create: task is `unknown`, see section 10. Timeout or 5xx while polling or uploading: retry with growing delay.
* Uploaded file expired on the YouCam side (24 hours): upload again from Interim's copy. If the copy has expired, ask for a new photo.
* Unsupported or oversized file: should not happen after normalisation. Treat as an Interim fault and alert.
* Content moderation rejection: tell the user the photo cannot be used, ask for a new one. No retry.

## 12. Privacy and consent

Photos of a face and body are biometric data, and the situation a person picks can imply something about their health. Interim treats both as sensitive.

* People must confirm they are 18 or older before the first upload.
* Consent screen before the first upload, in plain language. It says what is stored, for how long and who processes it: Perfect Corp (YouCam) receives photos to run tools, and Google (Gemini) receives measurements, the situation key, the moment and the tone, never photos. Each is a separate line the person accepts.
* Interim does not ask for health information. Because the chosen situation can still imply it, that choice is stored with the profile, never shared, never used for advertising, and deleted with the profile.
* The words for today choice can imply a person's religion. It is stored on the profile, never sent to the model or a partner, never shown on a share link, and deleted with the profile.
* Reflection text stays on the device. It is never uploaded, logged or sent to the model.
* Retention has two modes, and the person chooses on the consent screen with neither preselected. Standard: photos and renders are deleted 30 days after capture. Keep my history: photos and renders are kept until the person deletes them, or until 24 months after the last check in, whichever comes first. Every new check in restarts the 24 months. The setting can be switched off at any time, and then the 30 days count from each photo's capture date. For the templates that run over months (weight_change, hair_loss_ahead, textured_growth) the screen explains that keeping history is what makes comparisons and earlier looks possible. In both modes measurements, stage, self report and card text stay until the profile is deleted.
* Photos are stored encrypted. A render that expires keeps its card text and trace but not its image.
* YouCam deletes uploaded files after 24 hours, so Interim keeps its own copy and uploads again when needed.
* One tap to delete a profile and everything in it. One tap to export the profile as a file (measurements, cards, photos). Deletion completes within 24 hours, and backups age out within 7 days.
* The unit ledger keeps no personal data, so it is not deleted with a profile. It records only tool, units and time under a random reference.
* Only the person in the photo can be photographed. The consent text says so.
* Share links show renders and card text, never original photos. They expire, can be revoked by the person, and are not indexed by search engines. Opening one gives no access to the profile.
* No data is sold or used for advertising. No lead generation from profiles. No health records are collected.
* A privacy policy and terms page are part of the app. A suspected breach is reported to affected people within 72 hours.
* Logs hold ids only, never photo contents or personal text, and are kept for 14 days.

## 12a. Notifications

* Web push from the PWA, through a service worker. On iPhone it works only once the app is added to the home screen (iOS 16.4 or later), so the setup screen explains that step.
* Two opt-in kinds per profile: words for today at a local time the person picks (default 08:00), and a check in reminder when the template's cadence is due. Each has its own switch. Neither is on by default.
* Default text is neutral: "Your words for today are ready" and "Time for a check in when you're ready". Showing the passage itself on the lock screen is a separate opt-in. No notification names the situation, a stage or a count of days.
* A push subscription is stored per profile with the person's time zone. It is deleted with the profile, when the person turns notifications off, and when the push service reports it expired.
* A worker job runs every hour and sends to subscriptions whose local time matches. The passage comes from the same fixed library as the app.
* Notification text passes both language scans in every language it is sent in.

## 13. Language and safety rules

The rules themselves (banned words, labels, previews, professional line, body image rules) are owned by [overview.md](overview.md). This section is how they are enforced.

* **The scan.** The banned list lives in `packages/rules`. It matches whole words and their usual inflections, case insensitive, on user facing strings only: app copy, template display labels, fixed stage text, model output and the landing page. Internal keys such as stage names are not scanned. "Health" is allowed, "heal" and "healing" are not.
* The planner prompt embeds the same list and a test checks outputs against it.
* **The companion phrase scan.** The forced-positivity phrases and battle words from overview.md also live in `packages/rules`, as a second whole-word scan. It runs on model output, fixed companion text, what to say lines and the words for today library.
* A test scans all user facing strings in the app, templates and words for today library, and fails the build on a banned word or companion phrase.
* Which cards carry the professional line and the someone to talk to link is decided by the template's sensitive flag (section 4).
* **Distress handoff.** `packages/rules` holds a plain phrase check for crisis or self-harm language and a table of crisis contacts by region (US, Canada, UK, Ireland, Australia, with findahelpline.com for everywhere else). The device runs it on reflection text before anything else. A match replaces the screen with the contacts. The region comes from the browser locale and the person can change it.
* Words for today passages are quoted exactly from public domain translations, with the source and reference stored beside each one. Trailing punctuation of an excerpt may become a full stop. Nothing else is edited.
* **Languages.** Each language has its own banned word and companion phrase lists in `packages/rules`, reviewed by a native speaker. A language without both lists is not offered. The scans run on text in the language it is shown in. Model output is checked in the person's language, and the fallback is that language's fixed text.
* Body Reshape is not called. Renders only use real photos from check ins.
* Fit templates never show or ask for weight, BMI or a target. Cards show no goal, streak or progress score. A person can turn off body photos at any time and still use the hair features.

## 14. Judge mode

* One tap opens a sample profile. No signup.
* Judge mode runs only on recorded fixtures, including recorded planner output (architecture section 6). A visible stamp reads "Recorded on" with the date.
* Recorded responses are saved from real runs during the build. Fixtures hold only synthetic data or data from people who gave written consent for this use. Anything else stays out of the repository.
* There is no switch for live mode in judge mode. Judges cannot spend units.
* Sample profiles are labelled as demo profiles, with simulated stages marked as such.

## 15. MCP tools

The same engine is exposed over MCP, with a partner key per caller.

* create_profile(template): returns a profile id and a consent link. The profile cannot be used until the person has opened the link and consented.
* create_upload(profile_id, kind): returns an upload link for one photo. The photo goes from the person to Interim. The partner agent never receives image data.
* add_snapshot(profile_id, upload_ids)
* run_checkin(profile_id, snapshot_id)
* get_stage_card(run_id): returns card text and render links with the same trace and measurement references as the app.
* eligible_tools(snapshot_id)
* unit_ledger(profile_id)

A partner agent cannot bypass eligibility, consent or budgets. Each partner has its own cap and its own share of the YouCam rate limit.

## 16. Acceptance tests

1. A blurry or badly angled photo is rejected on the device and costs zero units. A bad photo that reaches the server is rejected there before any YouCam call.
2. Uploading the same picture twice, including after re-encoding or as HEIC, does not create a second paid call.
3. When hair transfer returns error_hair_too_short, the agent switches to the fallback order and the card says why.
4. Every number on a Stage Card matches a measurement record.
5. The banned word scan passes on the whole app, fails on a test string, and does not flag "health" or the stage keys.
6. Judge mode makes no live YouCam calls and has no switch to enable them. A replay fixture miss fails without a network call.
7. Deleting a profile removes photos, measurements, renders and cards. Ledger rows remain with no personal data.
8. A 429 response leads to a delayed retry, not a failure.
9. A task that returns an error inside HTTP 200 is not charged.
10. All eleven templates load from config and run through the same code path.
10a. Every fixed companion text, what to say line and words for today passage passes both scans. A test string with "stay positive" or "battle" fails.
10b. A reflection containing crisis language shows the crisis contacts for the region, and nothing from it reaches the server.
10c. Words for today returns nothing when it is off, the same passage for everyone on the same day and set, and never appears on a share link.
11. Standard retention: photos and renders are gone after 30 days, the card still shows its text, and it says an earlier look is unavailable.
11a. Keep my history: photos remain past 30 days, a new check in restarts the 24 months, and 24 months after the last check in they are deleted. The consent screen cannot be passed without choosing a mode.
12. Two concurrent runs cannot spend more than the remaining daily cap.
13. A worker crash between sending a create call and storing the task id does not send a second create call. The task becomes `unknown` and holds its reservation.
14. Model text containing a digit, a number word or an unknown placeholder is rejected.
15. A HEIC photo is accepted, converted, and stored without EXIF data.
16. A profile made by a partner agent cannot take a snapshot before consent, and no MCP tool returns image data.
17. Profile creation and uploads are rate limited per source address.
18. The capture checks pass photos of the same quality across the skin tone and hair type panel at a similar rate.

## 17. First 48 hours: spike plan

This section owns every open question. Answer these before building the rest.

1. Call Get_Feature_Cost for density, length, volume, hair transfer v2.1 and clothes v4. Fill the cost table with real numbers. Compute units and money per baseline and per check in.
2. Run density detection on six top of head photos of different fullness at 45 degrees. If the grade never moves, stop using density as a trigger and use length plus self report.
3. Run hair transfer v2.1 with hair_color set to src on photos with less and less hair. Record exactly where the two errors start. This becomes the eligibility table.
4. Test chaining. Pass a clothes render into hair transfer, then into makeup. If face detection fails on generated images, render hair on the original photo and composite, or change the order.
5. Render one saved garment on two different body photos to confirm the size bridge moment looks believable.
6. Record every response into fixtures from the first call.
7. Check what is billed on failed, moderated and timed out tasks, and whether YouCam lists tasks for reconciliation.
8. Confirm accepted formats, size limits, the framing for clothes (full body or chest up), which photo hair length needs, and whether Camera Kit gives enough angle control for the top photo.
9. Run the capture checks and the tools on a panel of at least twelve consenting people covering a range of skin tones, hair textures, short and shaved hair, locs, head coverings and facial hair. Record failure rates per group and tune the thresholds until they are close.
10. For the illness-first templates: check whether hair density and length detection place patchy hair (hair_patches), whether face attributes notice fullness (face_fullness, else self report only), and whether skin tone analysis is stable enough over check ins to track a colour change (skin_colour). Drop a template from the demo if its tools cannot support it.

Kill criterion: if density does not move and hair transfer rejects most thinning hair, switch to the runner up idea (a hair catalog agent for wig and extension sellers). It reuses the same YouCam client, ledger and hair transfer work.

## 18. Numbers and measures

In the style of the Round 1 winners, publish measured results.

* median render time per tool
* error rate per tool across about 20 test runs
* units per baseline and units per check in, and the money cost of each
* how often the eligibility rules prevented a paid failure

Product measures, tracked in the build and reported in the readme:

* baseline completion rate
* share of people who start a second check in
* share of cards approved
* time from first photo to first card
* cost per check in against the plan price
* tone chosen at setup and how often it is changed
* share of people who turn on words for today, by set

Before submission, talk to at least five people in two of the situations, at least three of them with lived experience of serious illness. Ask whether they would photograph themselves at this cadence, which tone they would pick, and show the card both ways (note first and note last). Record what they said.

## 19. Out of scope

Native apps, voice, accounts for care teams, any health data, real checkout, insurance features and live catalog sync.
