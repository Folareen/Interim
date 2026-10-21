# Interim: Product Specification

Companion documents: overview.md, ../architecture.md

## 1. Scope

This spec covers the hackathon build: what the product does, what it stores, how the agent decides, and how the work is judged done. Section 17 owns the open questions, and other docs link to it.

## 2. Users

* **Individual.** Picks a situation and a tone, captures a baseline, then adds check ins. Reads Stage Cards.

There are no admin or care team roles in this build.

## 3. Core concepts

* **Profile.** One person's ledger, created from a situation template.
* **Snapshot.** One dated set of photos with the measurements and self report taken with them. The first snapshot is the baseline.
* **Measurement.** One value from one YouCam tool, with the tool name and the snapshot it came from. Its cost is found in the unit ledger through the task id.
* **Self report.** What the person tells Interim at a check in: whether anything changed (none, some, a lot) and, for fit templates, their current size.
* **Tone.** How the companion talks to this profile: practical, warm (the default) or light. Stored on the profile with the language, the body photo setting, the head covering setting and the words for today choice.
* **Head covering.** A profile setting: the person covers their hair. It turns off every tool that changes or removes what is on the head (rule 4 of section 7). Asked once at setup in neutral words, off by default, changeable at any time.
* **Language.** The profile's language, from the live languages (section 13). English by default.
* **Moment.** What the person is getting ready for, from a fixed list: back_to_work, family_event, date, photos, video_call, going_out, everyday. Optional on any snapshot, the baseline included.
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
* weight_change: usual_size, one_size_away, two_sizes_away, settled (either direction, from the reported size)
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
* **body.** Full body or chest up, as the clothes tool requires. One photo serves fit renders. Required only for templates that use fit, and only while body photos are on.

What each snapshot needs:

* Baseline: front, left, right, top where possible, and body for fit templates.
* Check in: front, plus top when density is tracked and body when the template uses fit.

Each check is run on the device. A photo that fails a check is rejected with a plain instruction and nothing is uploaded or charged. The light and angle checks are calibrated on a panel that spans skin tones and hair types (section 17). Framing limits per tool are in [integrations/youcam.md](../integrations/youcam.md).

Device checks are advisory. The server runs them again before any YouCam call.

### Upload handling

* Accepted: JPEG, PNG and HEIC, up to 12 MB, verified by file signature and not by file name.
* The server converts HEIC to JPEG, applies the orientation, strips all EXIF and location data, caps the long side at 1000 px and rejects a short side under 480 px (the strictest YouCam limits).
* The photo hash used for dedupe is taken after this normalisation, so the same picture uploaded twice matches.

### Self report

At each check in the person answers "Has anything changed since last time?" with none, some or a lot. Fit templates also ask for the current size, chosen from the size ladder in the sample catalog. An optional "Anything coming up?" picks one moment from the fixed list. These are not health fields, and none of them is free text.

## 6. Measurements taken

At baseline, once per profile:

* Hair type detection
* Hair density detection
* Hair length detection
* Face attributes: face aspect ratio and face shape (one call, 10 units). The ratio is the number tracked for fullness.
* Skin colour (facial colour tones, 20 units), once only because of its cost. Only the skin colour is used.
* Body photo stored for fit renders

At each check in, measurements are taken when any of these is true:

* the self report says some or a lot of change
* the stage model expects a change
* `remeasure_every` check ins have passed without a measurement

What is measured then: density when the stage model expects change, length when the template tracks length, face aspect ratio for face_fullness, skin colour for skin_colour.

Density is placed by comparing `mapping` with the same person's baseline, never by the grade label, which is not comparable across people. A change smaller than about 0.7 is treated as noise unless the capture check passed the light.

The face tools run at the loosest angle setting (`flexible`, within 30 degrees) because the on device capture check is the gate. YouCam returns its own read of the photo (`face_quality`: area, frontal, lighting, face angle). A result whose quality is not all "good" is stored as unreliable and is not used to place a stage.

When nothing is measured, stage placement uses the last measurements and the card shows the date they were taken ("last measured on"). A card never presents an old value as new.

## 7. Tool eligibility rules

Eligibility is decided in code. The model reads the result and never overrides it.

Rules, in order of evaluation:

1. No live call is made when live calls are off (section 10) or the mode is replay. In replay a missing fixture fails closed with an error. It never falls through to the network.
2. A tool is blocked if the snapshot failed its capture check for that tool, on the device or on the server.
3. When a recorded success exists for the same normalised photo hash, tool, API version and parameters, the recorded result is returned and no new call is made. This is a reuse, not a block.
4. Hair transfer (hairstyle v2.1) is allowed whatever hair is present. It worked on bald, shaved, very short and covered heads in the spike, so a person with no hair can preview a hairstyle or wig, labelled as a preview. It replaces whatever is on the head, including a hijab or head wrap, so it is never run for a profile with head covering on. Hair length cannot tell a covered head from a bald one (both read "above the ears"), so the setting, not a measurement, decides.
5. Hair transfer is marked blocked for the snapshot, and cached as blocked, when the API returns error_hair_too_short or error_bald_image. The spike never produced either, but the handling stays.
6. Fallback order when hair transfer is blocked or off: brow makeup try on, then renders from the baseline photos labelled as earlier looks. The last step works only while those photos are still retained (section 12). If they have expired, the card says so and offers to keep history for future check ins. Hat and scarf try on are not used: the hat tool makes a new picture of a styled person in another scene, so the result is not recognisably the person.
7. Beard style is allowed only in the beard template, or when the user marks beard as a goal.
8. Hair volume previews are allowed only when density is present and are always labelled as visual previews.
9. Clothes try on is allowed only when the body photo passes capture checks.
10. A tool is blocked when its estimated cost would exceed any remaining cap (run, profile, day, source).

Short or shaved hair and no hair are normal inputs. A head covering turns hair try on off with neutral wording and never an error tone, and the face and clothes flows still run.

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
* If model text fails the language scan, the companion phrase scan or the placeholder check, it is retried once. A second failure uses the fixed text for the profile's tone from template config, and the trace records it.

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
* Caps, all in config: per run, per profile, per day (global) and per source address per day. Caps are checked at reserve time.
* A global switch (`LIVE_CALLS_ENABLED`) turns off all live calls at once. It is off unless set. When the YouCam account reports that it is out of units, the switch is turned off automatically and an alert is raised.
* A failed task settles at zero: the errors seen so far (face angle, face too small) cost nothing. Moderation rejections and timeouts are unverified, so settlement uses the actual charge observed.
* There is no idempotency key. Every call writes a task row in the state `intent` before it is sent and moves it to `created` with the YouCam task id once the response arrives.
* A create call is never repeated unless the earlier task is known to have failed. A task left in `intent` after a crash, a timeout or a 5xx is `unknown`. It is reconciled (to verify whether YouCam lists tasks) and its reservation is held until it is resolved. It is never created again automatically.
* A 429 means the task was not created, so it is the one create failure that is safe to retry.
* The unit ledger view shows each call, its cost and why it was made.
* Unit cost in money is tracked in config, and the plan must keep cost per active member inside the price (section 18).

Prices, as Get_Feature_Cost lists them:

* Hair type detection: 2 units
* Hair density detection: 1 unit
* Hair length detection: 2 units
* Hair volume: 2 units
* Hair transfer v2.1 (hairstyle): 2 units, preset or custom
* Hair color: 1 unit
* Beard style: 2 units
* Fitzpatrick skin type: 10 units, charged only when the task succeeds.
* Facial colour tones (skin_colour template): 20 units, charged only when the task succeeds.
* Face shape (face_fullness template): 10 units for 1 to 5 features, charged only when the task succeeds. Interim asks for face shape only.
* Skin analysis: 9 to 22 units. SD is 9, 12, 14, 16 and HD is 12, 16, 20, 22 for 1 to 4, 5 to 8, 9 to 12, 13 to 16 concerns.
* Makeup try on (brows): 1 unit, charged only when the task succeeds
* Clothes v4: 2 units

## 11. Error mapping

Each YouCam error maps to a plain sentence for the user and a next action for the agent.

* error_hair_too_short and error_bald_image: tell the user this tool cannot work on this photo, mark it blocked, use the fallback order.
* error_face_angle_invalid and error_insufficient_lighting: ask for a new photo with a specific instruction. No retry.
* error_no_face and error_large_face_angle: ask for a new photo. No retry.
* The face tools' specific angle errors (face_not_forward_facing, angle_upward, angle_downward, angle_leftward, angle_rightward, angle_left_tilt, angle_right_tilt) and multi_person: ask for a new photo with the matching instruction (for example "tilt your head down a little"). No retry.
* error_apply_region_mismatch and error_editing_failed (clothes): this garment cannot be shown on this photo. Mark the combination blocked and offer another garment. error_invalid_src (only the lower body or feet shown): ask for a new photo. error_invalid_ref: a catalog image is unusable, an Interim fault.
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

* Interim is for adults only, as a deliberate choice. Photos of a face and body are biometric data, what a person picks can imply a health condition, and their photos go to two outside processors, so serving minors would need parental consent and legal review in each country. People confirm they are 18 or older before the first upload. This is a confirmation, not age verification.
* Consent screen before the first upload, in plain language. It says what is stored, for how long and who processes it: Perfect Corp (YouCam) receives photos to run tools, and Google (Gemini) receives measurements, the situation key, the moment and the tone, never photos. Each is a separate line the person accepts.
* Interim does not ask for health information. Because the chosen situation can still imply it, that choice is stored with the profile, never shared, never used for advertising, and deleted with the profile.
* The words for today choice and the head covering setting can imply a person's religion or culture. Both are stored on the profile, never sent to the model, never shown on a share link, and deleted with the profile.
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
* Words for today passages are quoted exactly from public domain translations, with the source and reference stored beside each one. An excerpt may start with a capital letter and end with a full stop. Nothing else is edited.
* **Languages.** Each language has its own banned word, companion phrase and crisis phrase lists in `packages/rules`, and its own messages file in `packages/templates`. Only languages in `liveLocales` (`packages/types`) are offered, and all ten are. The lists and the messages are typed by that list, so adding a language fails the build until every list and file has it. A language not in `reviewedLocales` is a draft: it is offered, labelled as a draft on every screen, and not yet checked by a native speaker (section 17). The scans fold accents and tone marks before matching, so a person who types without them is still caught. The scans run on text in the language it is shown in, and match whole words across scripts, including letters with tone marks. Model output is checked in the person's language, and the fallback is that language's fixed text. The crisis check also runs the English list, because people mix languages.
* Body Reshape is not called. Renders only use real photos from check ins.
* Fit templates never show or ask for weight, BMI or a target. Cards show no goal, streak or progress score. A person can turn off body photos at any time and still use the hair features.

## 14. Judge mode

* One tap opens a sample profile. No signup.
* Judge mode runs only on recorded fixtures, including recorded planner output (architecture section 6). A visible stamp reads "Recorded on" with the date.
* Recorded responses are saved from real runs during the build. Fixtures hold only synthetic data or data from people who gave written consent for this use. Anything else stays out of the repository.
* There is no switch for live mode in judge mode. Judges cannot spend units.
* Sample profiles are labelled as demo profiles, with simulated stages marked as such.

## 15. Other agents

No MCP server and no partner keys. Every caller is the person, through the app, so no third party can create a profile, read a card or reach data that can imply someone's health.

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
10d. A profile with head covering on is never offered hair try on.
11. Standard retention: photos and renders are gone after 30 days, the card still shows its text, and it says an earlier look is unavailable.
11a. Keep my history: photos remain past 30 days, a new check in restarts the 24 months, and 24 months after the last check in they are deleted. The consent screen cannot be passed without choosing a mode.
12. Two concurrent runs cannot spend more than the remaining daily cap.
13. A worker crash between sending a create call and storing the task id does not send a second create call. The task becomes `unknown` and holds its reservation.
14. Model text containing a digit, a number word or an unknown placeholder is rejected.
15. A HEIC photo is accepted, converted, and stored without EXIF data.
16. Profile creation and uploads are rate limited per source address.
17. The capture checks pass photos of the same quality across the skin tone and hair type panel at a similar rate.

## 17. Spike: what is still open

This section owns every open question. What the live runs settled is in [integrations/youcam.md](../integrations/youcam.md#observed-live). Those runs used professional portraits and synthetic images, so they show what the tools can do, not how people will photograph themselves.

1. Compute units and money per baseline and per check in from the cost table, using the price per unit of the real plan.
2. Hair density on at least six real top of head photos. On synthetic heads it follows fullness within one person but not across people, and drops in dim light, so stage placement compares `mapping` with the person's own baseline (section 6). Hair length is coarse and supports a stage but does not place one.
3. What is billed on moderation rejections and on timed out tasks.
4. The panel: run the capture checks and the tools on at least twelve consenting people covering a range of skin tones, hair textures, short and shaved hair, locs, head coverings and facial hair, on phone selfies. Record failure rates per group and tune the thresholds until they are close. Skin colour and Fitzpatrick ordered six synthetic people correctly and need the same check on real selfies.
5. Whether face aspect ratio and skin colour follow a real change (fullness from medicine, a colour change). Both were steady under changes of light. hair_patches depends on density (item 2). Drop a template from the demo if its tools cannot support it.
6. Head covering: only a hijab and a head wrap were tried. Check other coverings and wigs, and settle the wording of the setting with people who cover their hair.
7. YouCam groups its hairstyle templates as Male and Female and offers hair volume only as Female templates. Decide how the app shows them without asking anyone's gender, for example every style to everyone with the volume previews labelled by look.
8. Whether Camera Kit gives enough angle control for the top photo.
9. Native review of the nine draft languages: the screens and consent text (the consent wording also needs legal review per language), the banned word, companion phrase and crisis phrase lists, and the crisis contact wording. Review in this order of risk: consent text and crisis wording first, then the safety lists, then the rest. Reflection must not run in a language before its crisis list is reviewed. If a language cannot be reviewed, remove it from `liveLocales` rather than ship it unchecked; Igbo is the first to drop. The words for today sets have no public domain translation in these languages yet, so they fall back to English.

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

Native apps, accounts for care teams, any health data, real checkout, insurance features, live catalog sync and anyone under 18 (section 12). A guardian led mode for teenagers is the likely way to add them later.
