# Interim: Product Overview

Built for the YouCam API Skin AI and eCommerce VTO Hackathon (Perfect Corp, Devpost). Submissions close Nov 2, 2026 at 11:45am EST.

## One liner

Interim helps you feel like yourself while your body changes.

## In short

Serious illness can change how someone looks within weeks: hair falls out, the face fills out, surgery leaves a new shape, skin changes colour. People still have to go to work, see family and be photographed, and almost nothing helps them through those months. Interim is built for them first.

At each check in it takes a few photos, measures what changed with YouCam's hair, skin and try on AI, and returns one Stage Card. The card has a short, honest note in the tone the person chose. It says what to wear and how to style hair and makeup for what is coming up, what to hold off buying, and which sizes to buy now.

The same engine helps anyone whose body is changing fast: gaining or losing weight, on purpose or not, a new baby, midlife, going grey, growing out hair or a beard. It works in ten languages and stays practical and kind, never medical.

## The problem

Almost every beauty and fashion tool assumes a fixed person: the same face, hair and size.

* Appearance change from illness is common and hard. Chemotherapy causes substantial hair loss in about 65% of people who receive it (2023 review, Current Oncology). Body image distress is reported in 31% to 67% of breast cancer survivors and up to 74% after head and neck cancer. Long-term steroids change face shape in up to 63% of people in one study.
* It changes everyday life, not only the mirror. Survivors returning to work most want to hide the change. Some delay going back or avoid meeting colleagues, and people who cannot dress the way they want go out less.
* What helps is practical and kind, not cheerful. One-off appearance workshops, a single self-compassion writing exercise (tested in a randomised trial) and practice in handling other people's reactions all reduce distress. Forced positivity and battle language can make it worse.
* Other fast changes have the same gap. 73% of current GLP 1 users reported a meaningful change in clothing size (PwC, 3,089 consumers, May 2026), and NRF and Happy Returns estimate 19.3% of online sales were returned in 2025, with size and fit the top apparel reason.

These figures come from secondary sources and were never checked against the originals. Check each one and record the date here before it appears in public copy.

## Who it serves

Built first for people whose appearance is changing because of serious illness or its care: hair loss, face and body shape changes, scars, skin colour changes. It serves anyone in a fast change just as well: weight gain or loss in either direction and for any reason, a new baby, midlife, going grey or a grow out. Today these people guess, buy the wrong size, book the wrong cut, or stop going out for a while because nothing feels like them this month. Nobody builds for the in between months.

## The core idea

One engine, one steady voice.

**The companion.** Every check in starts with the person, not the product. Interim notices what changed, says plainly that it is a normal part of this stage, and offers one small thing to do for whatever is coming up: a day back at work, a family event, a video call. Outfits, hair and makeup are the tools it uses to get there. See [The companion](#the-companion).

**The Change Ledger.** A dated, measured record of how someone looks: hair density grade, hair length stage, hair type, skin tone, face shape, a full body photo, and the garments they saved. Each check in adds a snapshot.

**The stage model.** For each situation, a template defines the expected path (for example full hair, thinning, short, none, growing in), how often to check in, which YouCam tools are valid at each stage, and what to do when a tool does not apply. The stage decides the tools, not the situation.

YouCam's hair try on works on bald, shaved and very short hair as well as full hair, so a person with no hair can preview a hairstyle or a wig on their own photo. It also replaces whatever is on the head, including a hijab or head wrap, so a person who covers their hair says so once and never sees hair try on. For them, and whenever a hair tool does not apply, the agent turns to clothes, brow and colour options and to earlier renders, for as long as the photos are kept (30 days, or up to 24 months after the last check in if the person keeps their history).

## Templates

Users pick a situation from a fixed list. They never type a condition, a diagnosis or a medication. Labels shown in the app are plain and neutral.

Built first for:

1. Hair loss ahead. Before, during and growing back in, then the fit changes that often follow. Uses the strictest language rules.
2. Hair coming out in patches. Patchy loss that comes and goes. Cover, part and brow strategies.
3. Face shape changing. Fullness that comes and goes. Neckline, frame and size choices, with size reported by the person.
4. Body changed after surgery. Fit and comfort first. Body photos are off until the person turns them on.
5. Skin colour changing. Colour matching for makeup and clothes as skin tone shifts.

Also for:

6. Weight change. Gaining or losing, on purpose or not, including GLP 1 medicines. Size moves over months in either direction, and the card plans clothes for the size the person is now. Hair shedding can follow fast loss.
7. Midlife change (menopause). Density drifts down slowly. Volume and cut strategy matter most.
8. After a baby (postpartum shedding). Temporary. The agent steers away from drastic cuts during it.
9. Going grey. Plan the grow out with colour stages instead of dyeing.
10. Growing out textured hair. Length stages from very short to shoulder length, with protective style windows.
11. Growing a beard. Stubble to full beard, with a beard style render for each stage.

Templates 2 to 5 depend on YouCam behaviour that is still being confirmed with real photos (spec section 17).

Another Round 2 entry (Bloom) is built around a chemo wig try on. Interim is not a try on. It follows the whole timeline (before, during, growing back in, fit change), covers several situations, plans for everyday moments, and speaks in a voice the person chooses.

## The companion

This section owns what the companion says and does. The spec (sections 9 and 13) describes how it is enforced.

* **The note.** Each Stage Card opens with a short companion note of up to three sentences, in this order: notice (what changed, in plain visual terms), normalise (common at this stage, with no cause named), one thing for today (one small step tied to the person's next moment). The model writes it inside the language rules. If it fails them, fixed text for the person's tone is used.
* **Tone.** The person chooses how Interim talks: *Just practical* (no feelings talk, only the change and the step), *Warm*, or *Light*. It is asked once after the situation is picked, with *Warm* preselected, and can be changed from any card.
* **Moments.** At a check in the person can name what is coming up: back at work, a family event, a date, photos, a video call, going out, or just everyday. Strategy, renders and the note plan for that moment. Moments come from a fixed list, with no free text.
* **What to say.** For moments with other people, the card can offer two or three short, fixed lines for when someone stares or asks. They are based on published social-skills approaches for visible difference.
* **Reflection.** After a check in where the person reports a lot of change, Interim offers, never pushes, one short self-compassion prompt such as "What would you say to a friend going through this?". What they write stays on their device. It is never sent to the server or the model.
* **Words for today.** Off unless the person turns it on. They pick one set: *Gentle words* (public domain quotes and lines written for Interim), *Christian* (King James Version), *Muslim* (Pickthall's translation of the Qur'an) or *Jewish* (JPS 1917 Tanakh). One passage a day, the same for everyone on that set, whatever their situation. Passages come only from a fixed, reviewed library and are never written, paraphrased or chosen by the model. More traditions are added once someone from that tradition has checked the passages.
* **Notifications.** Words for today and a check in reminder, each off until the person turns it on. By default a notification says only that something is ready, because lock screens are seen by others and a verse can reveal faith. It never names the situation or counts days (spec section 12a).
* **Someone to talk to.** Every sensitive card links to crisis contacts for the person's region. If anything the person writes on the device suggests crisis or self-harm, Interim stops and shows those contacts first. That check is plain code.

## Languages and accessibility

Free in every language, like the rest of the companion. The person picks a language at setup and can change it at any time.

* **Ten languages:** English, French, Spanish, Italian, Portuguese, Swahili, Hausa, Yoruba, Igbo and Nigerian Pidgin are all in the app. English is reviewed. The other nine ship as drafts, marked on screen, until a native speaker has checked them. Arabic follows once the app supports right to left layout. The model writes the note and explanations in the person's language, and Yoruba keeps its tone marks.
* **Safety travels with the language.** A language is offered only when it has its own banned word, companion phrase and crisis phrase lists and its fixed copy passes both scans (spec section 13). The lists and copy of a draft language are written carefully but still need a native speaker's review, and the reflection feature does not run in a language before that review (spec section 17). Words for today come only from public domain translations in that language; where a set has none, the person sees it in English, with a note saying why.
* **Large, clear choices.** Almost everything is a tap or a photo, with large, clearly labelled choices. The one free text field is the reflection.
* **Screen readers.** Pages are built for VoiceOver and TalkBack, with the page language set to the person's language and every control labelled.
* **Crisis contacts** follow the person's region, not their language.

## What the agent does

Interim is an agent that lives inside an app. The user never picks which YouCam API to run.

1. Checks the photo on the device first (face angle, lighting, resolution) so errors never cost units.
2. Decides which measurements are worth taking now, and skips the ones the stage model says are unlikely to have changed.
3. Looks up which tools are still valid at this stage and skips the ones that are not.
4. Picks a strategy for this stage and the person's next moment: cut, volume, colour, cover or hold.
5. Renders two to four options within a unit budget, and renders saved garments again on the new photo.
6. Writes the companion note in the person's tone and produces a Stage Card they can act on. It stops when the budget is spent, when two strategies in a row fail the eligibility rules, or when the user approves.

The eligibility and language rules are plain code, built from the real error behaviour of the YouCam API and from the research. The language model plans the strategy and writes the note and explanations. It never invents a measurement.

## The Stage Card

The output of every check in. It opens with the companion note, then shows what changed (measured, with the tool that measured it), what to wear and how to style it for the next moment, what to hold off buying, and a shopping list with sizes. Each card has a short trace of what the agent decided and why. A user can approve the list and share a link with a stylist, barber or friend. Handing the list to a real cart is out of scope.

## Where it lives

* **The app.** A mobile first web app (PWA). The user picks a situation and a tone, takes photos at each check in and reads Stage Cards. This avoids an empty chat box for a first time user.
* **Accounts.** Sign up or sign in comes first (email and password, a link by email, or Google), so profiles survive cleared browser data and open on any device. Rules are in spec section 12b.
* **For programs and retailers.** A white label version of the app, not an agent interface. Interim keeps one way in, the person's own app, because what it holds can imply someone's health.

## Who pays

These prices are estimates anchored on public Shopify try on app pricing. They have not been checked with buyers, and the unit cost of a baseline and a check in is not known yet (spec section 17).

* **Telehealth, weight management and supportive care programs.** A white label appearance companion that supports retention. Roughly 0.50 to 2 dollars per active member per month. A buyer like this will need data processing terms with Perfect Corp and Google, and possibly health privacy contracts. This build does not claim that compliance. It is an assumption to test with a real buyer.
* **Apparel retailers, including adaptive and post-surgery brands.** A size bridge module that shows saved items on the new photo at each check in as a preview. The size comes from the size the person reports and the retailer's size chart, not from the render. Priced per try on or as a software tier. Public Shopify try on apps price at about 0.09 to 0.16 dollars per try on.
* **Haircare, headwear and wig brands.** Sponsored content inside a template, paid per placement. Interim never sells profile data or leads, and never targets by situation.
* **Consumers.** About 6 dollars a month, mainly to prove pull.

Charities and cancer centres (for example Look Good Feel Better programs) are distribution partners, not buyers. They get it free for the people they support, because they rarely have budget and they are where these people already look for help.

## Why it fits this hackathon

* **Technological Implementation.** A stage state machine, eligibility rules driven by API errors, language and safety rules in code, a unit ledger with duplicate protection, chaining across clothes, hair and makeup.
* **Design.** One Stage Card per check in that opens with a human note, a clear capture wizard, and a visible unit cost for every call.
* **Potential Impact.** 18.6 million cancer survivors in the US alone, evidence that practical appearance support reduces distress, measurable return costs, and named business buyers.
* **Quality of Idea.** No visible Round 2 entry follows a person's appearance through illness over time, together with clothing fit and the moments they are dressing for. The hair APIs used are the newest part of the platform.

## Language and safety rules

Interim is cosmetic and practical. It is not therapy and never says or implies it is. It never diagnoses, never names a cause, never talks about medication, never suggests treatment and never gives mental health advice. This section owns these rules. The spec (section 13) describes how they are enforced.

* Product copy never uses the words patient, treatment, diagnosis, cure, heal or regrow, or their usual forms. The scan matches whole words, so "health" is fine. Internal stage keys are not user facing and are not scanned.
* No forced positivity: never "stay positive", "be strong", "you've got this", "everything happens for a reason" or "look on the bright side".
* No battle words: never fight, battle, beat, warrior or survivor, and no journey framing.
* Earlier photos are a reference, never a goal. Interim never describes a change as a loss or the person's earlier look as better.
* No body is the goal. Interim never calls clothes slimming, never offers to hide or disguise part of the body, and never talks about problem areas. Weight gain and weight loss get the same tone.
* Users choose a situation from a fixed list. There are no condition fields and no medication fields.
* Density grades are described as visual categories, not health findings.
* Every card for a sensitive situation (templates 1 to 8) carries one short line suggesting a professional for health questions, and a link to someone to talk to.
* Head coverings are respected. A person who covers their hair is never shown a render without it, and the card never suggests removing a covering.
* Body image: Interim never shows or asks for weight, BMI or a target, and never shows a goal, streak or progress score. Fit templates show saved clothes on the person as they are today. A person can turn off body photos at any time.
* The Body Reshape API is not used to show a future thinner person. Renders are only made on real check in photos.
* Previews are labelled as previews. They do not promise a result.
* A test in the build fails when banned words or companion phrases appear in user facing copy, including the words for today library.

## Demo plan

* Lead with Hair loss ahead across its whole timeline: hair thinning, a bald stage where the person previews hairstyles or a wig on their own photo, growing back in, and a fit change at the end. Show the companion note changing with each stage and a moment such as a first day back at work.
* Then weight change, to show the same engine working for a different situation, with its hard numbers.
* Real people only with clear consent. The sample profiles are two synthetic people in five hair stages (`packages/fixtures/sample`), labelled on screen as simulated.
* A recorded fixture replay so the video and the judges cost no units.
* Show the agent trace and the unit ledger on screen so the technical depth is visible.

## Risks and open questions

* Technical unknowns (hair density on real photos, fairness across skin tones and hair types, whether skin colour and face fullness follow real change, and support for templates 2 to 5) are tracked in spec section 17, which owns them.
* No user research yet. The plan is in spec section 18.
* Some US states (Illinois and Nevada from 2025) ban AI mental health care. Interim stays a cosmetic tool with a kind voice. The language rules and the on-device reflection keep it there.
* Photographing yourself six ways at every check in may be too much, especially when unwell. The check in set is kept small for that reason.
* A demo with a real person needs dated photos of one consenting person, which is harder for illness than for weight change, so the demo uses the synthetic sample profiles and shows real photos only with consent.
* Medical and body image sensitivity needs careful wording on every screen.

## Out of scope for the hackathon build

Native apps, accounts for care teams, any health data, insurance features, real checkout and payments, live retailer catalog sync, and anyone under 18 (spec section 12). A sample catalog is enough.
