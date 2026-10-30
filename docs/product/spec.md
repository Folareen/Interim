# Interim: Product Specification

Companion documents: overview.md, ../architecture.md

## 1. Scope

This spec covers the hackathon build: what the product does, what it stores, how the agent decides, and how the work is judged done. Section 17 owns the open questions, and other docs link to it.

## 2. Users

* **Individual.** Picks a situation and a tone, captures a baseline, then adds check ins. Reads Stage Cards. Signs up or signs in first, so a profile survives cleared browser data and opens on any device (section 12b).

There are no admin or care team roles in this build.

## 3. Core concepts

* **Account.** A sign in: an email address plus a password, a link sent by email or Google. Every profile belongs to an account.
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
* the measurements the baseline takes and the ones followed afterwards. A situation reads only what its card uses, because each costs units: after_surgery reads none, skin_colour only skin colour, face_fullness only the face aspect ratio
* per stage list of allowed tools and the fallback order when one is not allowed
* a hold or buy rule for garments, where the template uses fit: `buyStages`, the stages in which a fitted piece can be bought. In any other stage the size is still moving, so a fitted piece waits and a relaxed one can be bought at today's size
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

At baseline, once per profile, the tools the template lists (templates 2 to 5 read fewer, see section 4; the rest take all of these):

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
2. **Measure.** Code decides which measurements are worth taking, from section 6 and the template, and filters them by eligibility. Take them. Add each to the ledger. The planner is not asked, because this decision spends units.
3. **Place.** Compute the stage from measurements, self report and the template thresholds. If the stage changed since the last snapshot, record the change.
4. **Decide.** The planner picks a strategy for this stage and moment from the template's allowed list: cut, volume, colour, brow, part, neckline, frame, comfort, match, cover or hold. The last five besides cover and hold render nothing: their advice is plain code (section 9). Templates 2 to 5 each have their own: hair_patches part, brow and volume; face_fullness neckline and frame; after_surgery comfort; skin_colour match. It must name the measurement or self report that supports the choice.
5. **Act.** Render two to four options within budget. Render saved garments again on the new photo if the template uses fit.
6. **Compose.** Build the Stage Card from tool outputs. The model writes the companion note in the profile's tone and the explanations, with placeholders such as `{m:<measurement id>}`. Code fills in every number, date and size. Model text itself contains no digits and no number words.
7. **Stop.** Stop when the budget is spent, when two strategies in a row fail eligibility, or when the card is complete. Record why it stopped.

Every step is stored as a trace entry with the tool, inputs, outputs, cost and a one line reason. The trace is shown on the card in short form.

### Planner rules

* The planner may only call tools that eligibility allows.
* The planner may not state a number. Numbers come only from measurement records through placeholders.
* If the planner asks for something not possible (for example a render with no valid photo), the run records the refusal and tries the fallback.
* The planner never mentions causes, medication or health findings.
* The planner receives the situation key, stage, measurements, self report, moment and tone. It never receives photos, reflection text or the words for today choice. Reflection text reaches the model only through the safety review (section 13).
* The companion note is at most three sentences, in the order notice, normalise, one thing for today. With the practical tone it skips feelings language and keeps the change and the step.
* If model text fails the language scan, the companion phrase scan or the placeholder check, it is retried once. A second failure uses the fixed text for the profile's tone from template config, and the trace records it.

## 9. Stage Card

Fields:

* title and date
* companion note, with the tone it was written in and the moment it plans for
* situation label and current stage
* what changed, each line with the measurement and tool that produced it, or the word "reported" for self reported size, and the date it was last measured
* options, each with a render, a short reason and a label saying preview
* advice only this situation gives, as codes the app writes in the person's language: a parting, brow and volume for hair_patches (and a line saying the stage comes from the person's own report when density did not place it); necklines, a soft collar while the size moves and glasses frames for face_fullness; soft, loose and front opening pieces first for after_surgery, and a line saying body photos are off while they are; colours for clothes and makeup from the skin colour reading for skin_colour. A person who covers their hair is never advised a parting
* what to hold off buying, with the reason
* shopping list with sizes. The size comes from the reported size and the catalog size chart. A render is a preview and never a fit guarantee. A piece with no reported size yet, or that the catalog does not make in that size, goes under what to hold off buying instead, with that reason
* the saved clothes shown on this check in's body photo, for templates that use fit
* trace summary (what the agent decided and why)
* what to say, two or three fixed lines, shown only for moments with other people
* one line suggesting a professional for health questions and a link to someone to talk to, shown only on sensitive situations
* actions: approve list, share link, change tone, delete

Words for today is shown on the home screen, not on the card, so a shared card never reveals the person's faith. A share link shows only the looks, the advice a reader can act on, the clothes and the shopping list (architecture.md section 9).

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
* Consent screen before the first upload, in plain language. It says what is stored, for how long and who processes it: Perfect Corp (YouCam) receives photos to run tools, and Google (Gemini) receives measurements, the situation key, the moment and the tone, never photos, and, only for a reflection the safety check flags, that text and nothing else about the person. The consent screen lists them together, each naming its processor, and the person accepts all of them with one tick; the API records each acceptance.
* Interim does not ask for health information. Because the chosen situation can still imply it, that choice is stored with the profile, never shared, never used for advertising, and deleted with the profile.
* The words for today choice and the head covering setting can imply a person's religion or culture. Both are stored on the profile, never sent to the model, never shown on a share link, and deleted with the profile.
* Reflections are saved to the account, encrypted, so the person can come back to them. They are deleted with the profile, included in the export, never shown on a share link, never logged, never sold or used for advertising, and never given to the planner. The only time reflection text reaches a model is when the safety check flags it for review (section 13), and the consent screen says so.
* Retention has two modes, and the person chooses on the consent screen. Keep my history is preselected, because comparisons over months need the photos, and the person can change it. Delete after 30 days: photos and renders are deleted 30 days after capture. Keep my history: photos and renders are kept until the person deletes them, or until 24 months after the last check in, whichever comes first. Every new check in restarts the 24 months. The setting can be switched off at any time, and then the 30 days count from each photo's capture date. For the templates that run over months (weight_change, hair_loss_ahead, textured_growth) the screen explains that keeping history is what makes comparisons and earlier looks possible. In both modes measurements, stage, self report and card text stay until the profile is deleted.
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
* A push subscription is stored per device with the person's time zone, and only the push services' own addresses are accepted. It is deleted with the profile, when the person turns notifications off, and when the push service reports it expired. Check in reminders go at 10:00 local time, once for each time the cadence comes due.
* A worker job runs every hour and sends to subscriptions whose local time matches. The passage comes from the same fixed library as the app.
* Notification text passes both language scans in every language it is sent in.

## 12b. Accounts and sign in

* **Account first.** A person signs up or signs in before anything else, so a profile always belongs to a person, opens on any device and survives cleared browser data. There is no anonymous profile and no device cookie. Setup after that is situation, tone and hair, then consent. The language is chosen from the header, not as a step. Someone who signs in again lands where they left off, and can change tone and head covering from the ready screen.
* **Three ways in, one session.** Email and password, a link sent by email, or Google. Any of them ends in the same kind of session.
* **What an account holds.** An email address, a password hash (never the password) and, for Google, the account's subject id. Google is asked for the `openid` and `email` scopes only, so no name or photo arrives. All of it is deleted with the account.
* **The email address is personal data** tied to profiles whose situation can imply health. It is kept in its own table, and is never sent to YouCam or Gemini, put in a log, shown on a share link or used for advertising. Two processors see it: Brevo, which sends the email, and Google, only for people who choose Google. Neither receives photos. The sign up and sign in screens say so.
* **Passwords.** 10 to 128 characters with no composition rules, hashed with scrypt. There is no check against lists of leaked passwords.
* **Confirmed email.** A password account cannot sign in until its email is confirmed by a link. A sign in link, a reset link or Google also proves the inbox, and when the address had an unconfirmed password account its password is thrown away, so someone who typed another person's address gains nothing.
* **Emailed links.** One use, stored only as a hash, and valid for 24 hours (confirm, change email, recover), 15 minutes (sign in) or 30 minutes (reset). Asking for a new one cancels the older one. A link opens a page with a button, and is used only when the button is tapped, so mail scanners that open links cannot spend it.
* **Changing the email.** A signed in person gives the new address, and the password when the account has one. A link goes to the new address and nothing changes until its button is tapped. An address that already has an account is sent the "you already have an account" email instead, so the answer never says it is taken. Using the link moves the account, confirms the address, ends every session and signs in on that browser, deletes links still out for the old address, and sends the old address a notice with no link.
* **Recovery codes.** For a lost inbox. A signed in person (with the password when there is one) makes eight single use codes of 16 letters and digits, shown once and kept only as keyed hashes. Making new ones replaces the old. Recovery at `/recover` takes the old email, one code and a new email. A code that matches and a new address with no account spends the code and sends a link to the new address; anything else sends nothing and answers the same. The link then works as a change of email. Without codes saved beforehand an account cannot be recovered; the screens say so and offer the codes after sign in. Tries are limited to 5 per email and 10 per address in an hour.
* **Sessions.** A random cookie token whose hash is stored. The cookie is httpOnly, Secure and SameSite=Lax, lasts 30 days and is extended while in use. A password reset signs out every browser. Sign out ends the one in use.
* **No account guessing.** Sign up, asking for a link and asking for a reset answer the same whether or not the address has an account; a known address gets an email saying so. A wrong email and a wrong password are not told apart, and the work is the same.
* **Limits.** Tries are counted per address and per email in the database, as hashes, and answer 429 past the limit: 8 sign in tries per email and 60 per address in 15 minutes; 5 sign ups or links per email and 10 or 20 per address in an hour.
* **Delete account.** Deletes every profile with its photos, measurements and cards, then the account, sessions and links. It asks for the password when the account has one.
* **Emails.** Fixed copy in the language on screen, scanned like every other string. They say nothing about the situation or what the app is for.
* **Demo mode** needs no account and sample profiles are never owned by one.

## 13. Language and safety rules

The rules themselves (banned words, labels, previews, professional line, body image rules) are owned by [overview.md](overview.md). This section is how they are enforced.

* **The scan.** The banned list lives in `packages/rules`. It matches whole words and their usual inflections, case insensitive, on user facing strings only: app copy, template display labels, fixed stage text, model output and the landing page. Internal keys such as stage names are not scanned. "Health" is allowed, "heal" and "healing" are not.
* The planner prompt embeds the same list and a test checks outputs against it.
* **The companion phrase scan.** The forced-positivity phrases and battle words from overview.md also live in `packages/rules`, as a second whole-word scan. It runs on model output, fixed companion text, what to say lines and the words for today library.
* A test scans all user facing strings in the app, templates and words for today library, and fails the build on a banned word or companion phrase.
* Which cards carry the professional line and the someone to talk to link is decided by the template's sensitive flag (section 4).
* **Distress handoff.** `packages/rules` holds a plain phrase check for crisis or self-harm language and a table of crisis contacts by region (US, Canada, UK, Ireland, Australia, with findahelpline.com for everywhere else). The region comes from the browser locale and the person can change it. Reflection text goes through three outcomes, all decided by plain code first:
  * **Match.** The device runs the exact check before anything else. A match replaces the screen with the contacts. The text is still saved, marked as a match.
  * **Near match.** A looser check in the same package catches spelling variants, missing or extra letters, word stems and phrases with a word between. It does not block. The reflection is saved and marked `flagged`, a gentle contacts card shows beside it, and a `safety_review` row is queued.
  * **Review.** A worker sends only the flagged text and its language to the model, which answers `concern`, `clear` or `unsure` as JSON parsed with zod. `concern` and `unsure`, and any model failure, keep the contacts card on the person's profile until they dismiss it. `clear` removes it. The model can raise a flag but can never lower a match. The review row holds no email or profile data and is deleted with the reflection.
  * Every language has an always visible link to the contacts on the reflection screen, so help does not depend on detection.
* Words for today passages are quoted exactly from public domain translations, with the source and reference stored beside each one. An excerpt may start with a capital letter and end with a full stop. Nothing else is edited.
* **Languages.** Each language has its own banned word, companion phrase and crisis phrase lists in `packages/rules`, and its own messages file in `packages/templates`. Only languages in `liveLocales` (`packages/types`) are offered, and all ten are. The lists and the messages are typed by that list, so adding a language fails the build until every list and file has it. Every language is written with care and checked against verified sources where unsure; a native speaker's review is welcome but does not gate a language. The scans fold accents and tone marks before matching, so a person who types without them is still caught. The scans run on text in the language it is shown in, and match whole words across scripts, including letters with tone marks. Model output is checked in the person's language, and the fallback is that language's fixed text. The crisis check also runs the English list, because people mix languages.
* Body Reshape is not called. Renders only use real photos from check ins.
* Fit templates never show or ask for weight, BMI or a target. Cards show no goal, streak or progress score. A person can turn off body photos at any time and still use the hair features.

## 14. Demo mode

* `/demo` opens without an account and lists the sample people, each with their check ins as a timeline of Stage Cards.
* Demo mode only reads cards that were recorded from real runs of the app (architecture section 6). A visible line on each card says "Recorded on" with the date and that the person is simulated.
* The sample people are copied from profiles recorded through the app with `pnpm --filter @interim/api seed-demo` (docs/development.md). The copy has its own rows and stored images, with check in dates a fortnight apart ending on the day it was made.
* Fixtures hold only synthetic data or data from people who gave written consent for this use. Anything else stays out of the repository.
* Demo mode has no route that writes or starts a run, so a visitor cannot spend units, and it reads only profiles owned by `sample`, so no real person's card can be reached through it.

## 15. Other agents

No MCP server and no partner keys. Every caller is the person, through the app, signed in or on their own browser, so no third party can create a profile, read a card or reach data that can imply someone's health.

## 16. Acceptance tests

1. A blurry or badly angled photo is rejected on the device and costs zero units. A bad photo that reaches the server is rejected there before any YouCam call.
2. Uploading the same picture twice, including after re-encoding or as HEIC, does not create a second paid call.
3. When hair transfer returns error_hair_too_short, the agent switches to the fallback order and the card says why.
4. Every number on a Stage Card matches a measurement record.
5. The banned word scan passes on the whole app, fails on a test string, and does not flag "health" or the stage keys.
6. Demo mode makes no live YouCam calls and has no switch to enable them. A replay fixture miss fails without a network call.
7. Deleting a profile removes photos, measurements, renders and cards. Ledger rows remain with no personal data.
8. A 429 response leads to a delayed retry, not a failure.
9. A task that returns an error inside HTTP 200 is not charged.
10. All eleven templates load from config and run through the same code path.
10a. Every fixed companion text, what to say line and words for today passage passes both scans. A test string with "stay positive" or "battle" fails.
10b. A reflection containing crisis language shows the crisis contacts for the region and is saved. A near match is saved, flagged and queued without blocking, and only that text reaches the model. An unflagged reflection never reaches the model.
10c. Words for today returns nothing when it is off, the same passage for everyone on the same day and set, and never appears on a share link.
10d. A profile with head covering on is never offered hair try on.
11. Standard retention: photos and renders are gone after 30 days, the card still shows its text, and it says an earlier look is unavailable.
11a. Keep my history: photos remain past 30 days, a new check in restarts the 24 months, and 24 months after the last check in they are deleted. The consent screen opens with this mode selected.
12. Two concurrent runs cannot spend more than the remaining daily cap.
13. A worker crash between sending a create call and storing the task id does not send a second create call. The task becomes `unknown` and holds its reservation.
14. Model text containing a digit, a number word or an unknown placeholder is rejected.
15. A HEIC photo is accepted, converted, and stored without EXIF data.
16. Profile creation and uploads are rate limited per source address.
17. The capture checks pass photos of the same quality across the skin tone and hair type panel at a similar rate.
18. A profile in an account opens in a second browser after sign in, and never for anyone else.
19. A password account cannot sign in until its email is confirmed.
20. Signing up, asking for a link and asking for a reset answer the same for a known and an unknown address.
21. An emailed link works once and not after it expires, and a link of one kind is refused for another.
22. A sign in link or Google on an address with an unconfirmed password account discards that password.
23. No profile can be created, read or changed without a signed in account, and one account never sees another's.
24. Deleting an account removes its profiles, photos, sessions and links.
25. Repeated wrong passwords for one email are answered 429.

## 17. Spike: what is still open

This section owns every open question. What the live runs settled is in [integrations/youcam.md](../integrations/youcam.md#observed-live). Those runs used professional portraits and synthetic images, so they show what the tools can do, not how people will photograph themselves.

1. Sample baseline and check-in costs are measured in section 18. Costs across the other templates and a real-user workload remain to be measured.
2. Hair density on at least six real top of head photos. On synthetic heads it follows fullness within one person but not across people, and drops in dim light, so stage placement compares `mapping` with the person's own baseline (section 6). Hair length is coarse and supports a stage but does not place one.
3. What is billed on moderation rejections and on timed out tasks.
4. The panel: run the capture checks and the tools on at least twelve consenting people covering a range of skin tones, hair textures, short and shaved hair, locs, head coverings and facial hair, on phone selfies. Record failure rates per group and tune the thresholds until they are close. Skin colour and Fitzpatrick ordered six synthetic people correctly and need the same check on real selfies.
5. Whether face aspect ratio and skin colour follow a real change (fullness from medicine, a colour change). Both were steady under changes of light. hair_patches depends on density (item 2). Drop a template from the demo if its tools cannot support it.
6. Head covering: only a hijab and a head wrap were tried. Check other coverings and wigs, and settle the wording of the setting with people who cover their hair.
7. YouCam groups its hairstyle templates as Male and Female and offers hair volume only as Female templates. Settled: every style is offered to everyone and each preview is named by its look (for example natural volume), never by who it is for. Still to check with people who would use them.
8. Whether Camera Kit gives enough angle control for the top photo.
9. Legal review of the consent, privacy and terms wording per language, and a native speaker's read of the crisis wording and safety lists when one is available. The public contact address must be configured before publishing the policy pages. A native-speaker review does not block a language, since the check flags near matches for model review (section 13). The words for today sets have no public domain translation in these languages yet, so they fall back to English.
10. YouCam's Camera Kit (`plugins-media.makeupar.com`) runs on the capture screen with camera access. Its documentation does not say what it sends to Perfect Corp's servers, whether frames leave the device, or how it behaves on iOS Safari, and the consent text names Perfect Corp only as the processor of uploaded photos. Settle this and the wording before launch. The file input stays as the way to avoid the kit.
11. Accounts (section 12b): legal review of the sign up wording where it names Brevo and Google.
12. Whether a person at Interim ever looks at reflections the model rates `concern`, and the legal wording for sending flagged text to Gemini.

## 18. Numbers and measures

In the style of the Round 1 winners, publish measured results.

* median render time per tool
* error rate per tool across about 20 test runs
* units per baseline and units per check in, and the money cost of each
* how often the eligibility rules prevented a paid failure

Measured on the sample personas (front photo only, no density), live on 2026-10-23: a baseline cost 38 units (2.09 dollars: hair length 2, face shape 10, skin tone 20, three hair style previews 6), and a check in cost 8 units (0.44 dollars: hair length 2, three previews 6). Ten runs cost 140 units (7.70 dollars), and the balance fell by exactly that.

Exploratory spike log summary, 20–27 October 2026, for the tools used in the product. These are historical development attempts, including deliberately unsuitable portraits, generated inputs and setup faults, not a representative user test. The source is the local, ignored `apps/api/.spike/results.jsonl`; raw task ids and signed links are not published. Sample-persona runs and other experiments outside this log are not in these denominators. Recompute by grouping log rows by `tool`, counting every non-`success` row as unsuccessful, and taking the median non-null `seconds` among successful rows.

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

Timing starts before upload and ends at the final poll, rounded to whole seconds. It excludes photo preparation and result-image download and is not pure render time. Some tools have only a handful of attempts; do not treat a zero observed failure count as reliability evidence. Hair type succeeded in other experiments (integration notes), but no success appears in this log subset. Representative per-tool error rates, pure render medians and the share of paid failures prevented by eligibility remain unmeasured.

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
