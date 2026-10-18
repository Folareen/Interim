# Interim: Product Overview

Version 1, October 18, 2026
Built for the YouCam API Skin AI and eCommerce VTO Hackathon (Perfect Corp, Devpost). Submissions close Nov 2, 2026 at 11:45am EST.

## One liner

Interim is an AI agent that keeps you looking like yourself while your hair, skin and body change.

## The problem

Almost every beauty and fashion tool assumes a fixed person. The same face, the same hair, the same size. Real people change, and the change often comes faster than their wardrobe, their routine and their mirror can keep up with.

* Weight loss on a GLP 1 medication changes clothing size over months. In a PwC survey of 3,089 consumers (May 2026), 73% of current users reported a meaningful change in clothing size. ReturnPro reports 65% of users buy several sizes and return the extras.
* Hair changes during and after many life events, including midlife, a new baby, chemotherapy, going grey, growing out a relaxer or growing a beard. A 2022 single site study in Menopause found female pattern hair loss in 52.2% of 178 postmenopausal women. A 2023 review in Current Oncology says chemotherapy causes substantial hair loss in about 65% of people who receive it.
* Online stores lose money on this. NRF and Happy Returns estimate 19.3% of online sales were returned in 2025, and size and fit is the top reason sellers give for apparel returns.

Figures above come from secondary sources and should be rechecked before they appear in any public copy.

## Who it serves

People in transition. Today they guess, buy the wrong size, book the wrong cut, or stop shopping for a while because nothing fits who they are this month. Online retailers lose these shoppers during the in between months, and nobody builds for that period.

## The core idea

One engine, not seven apps.

**The Change Ledger.** A dated, measured record of how someone looks: hair density grade, hair length stage, hair type, skin tone, face shape, a full body photo, and the garments they saved. Each check in adds a snapshot.

**The stage model.** For each situation, a template defines the expected path (for example full hair, thinning, short, none, regrowing), how often to check in, which YouCam tools are valid at each stage, and what to do when a tool stops working. The stage decides the tools, not the situation.

This is how the YouCam hair APIs, which reject bald and very short hair, become part of the product logic instead of a limit. When hair transfer stops being valid, the agent switches to hat, brow or colour matching, and uses the baseline renders from earlier, fuller photos.

## Templates

Users pick a situation from a fixed list. They never type a condition, a diagnosis or a medication. Labels shown in the app are plain and neutral.

1. Weight change (GLP 1 and other weight loss). Size drops over months. Hair shedding can follow fast loss.
2. Midlife change (menopause). Density drifts down slowly. Volume and cut strategy matter most.
3. After a baby (postpartum shedding). Temporary. The agent steers away from drastic cuts during it.
4. Going grey. Plan the grow out with colour stages instead of dyeing.
5. Growing out textured hair. Length stages from very short to shoulder length, with protective style windows.
6. Growing a beard. Stubble to full beard, with a beard style render for each stage.
7. Hair loss ahead (chemotherapy). Before, during and regrowth stages. Uses the strictest language rules.

Chemo is a template and not the headline, because another Round 2 entry (Bloom) is built entirely around a chemo wig try on. Interim covers the whole timeline including regrowth and the fit changes that come with it.

## What the agent does

Interim is an agent that lives inside an app. The user never picks which YouCam API to run.

1. Checks the photo on the device first (face angle, lighting, resolution) so errors never cost units.
2. Decides which measurements are worth taking now, and skips the ones the stage model says are unlikely to have changed.
3. Looks up which tools are still valid at this stage and skips the ones that are not.
4. Picks a strategy for this stage: cut, volume, colour, cover or hold.
5. Renders two to four options within a unit budget, and renders saved garments again on the new photo.
6. Produces a Stage Card the user can act on, and stops when the budget is spent, when two strategies in a row fail the eligibility rules, or when the user approves.

The eligibility rules are plain code, built from the real error behaviour of the YouCam API. The language model plans the strategy and writes the explanation. It never invents a measurement.

## The Stage Card

The output of every check in. It shows what changed (measured, with the tool that measured it), what to wear and how to style it now, what to hold off buying, and a shopping list with sizes. Each card has a short trace of what the agent decided and why. A user can approve the list and send it to a cart, or share a link with a stylist or barber.

## Where it lives

* **The app.** A mobile first web app (PWA). The user picks a situation, takes photos at each check in and reads Stage Cards. This avoids an empty chat box for a first time user.
* **The tool layer.** The same engine is exposed as an MCP server, so a telehealth platform, a retailer or another agent can call it.

## Who pays

These prices are estimates anchored on public Shopify try on app pricing. They have not been checked with buyers.

* **Weight management and telehealth programs.** A white label appearance companion that supports retention. Roughly 0.50 to 2 dollars per active member per month.
* **Apparel retailers.** A size bridge module that tries saved items on the new photo at each check in and recommends the hold size, priced per try on or as a software tier. Public Shopify try on apps price at about 0.09 to 0.16 dollars per try on.
* **Haircare brands.** Sponsored templates for midlife and after a baby, paid per qualified lead.
* **Consumers.** About 6 dollars a month, mainly to prove pull.

## Why it fits this hackathon

* **Technological Implementation.** A stage state machine, eligibility rules driven by API errors, a unit ledger with duplicate protection, chaining across clothes, hair and makeup, and an MCP server.
* **Design.** One Stage Card per check in, a clear capture wizard, and a visible unit cost for every call.
* **Potential Impact.** A large and current audience, measurable return costs, and named business buyers.
* **Quality of Idea.** No visible Round 2 entry models change over time together with clothing fit. The hair APIs used are the newest part of the platform.

## Language and safety rules

Interim is cosmetic. It never diagnoses, never names a cause, never talks about medication and never suggests treatment.

* Product copy never uses the words patient, treatment, diagnosis, cure, heal or regrow.
* Users choose a situation from a fixed list. There are no condition fields and no medication fields.
* Density grades are described as visual categories, not health findings.
* Every card that touches a sensitive situation carries one short line suggesting a professional for health questions.
* The Body Reshape API is not used to show a future thinner person. Renders are only made on real check in photos.
* Previews are labelled as previews. They do not promise a result.
* A test in the build fails when banned words appear in user facing copy.

## Demo plan

* Two templates in full. GLP 1 first because it is timely and has hard numbers, then beard growth or chemo to show the engine switching.
* Real people only with clear consent. Stages that are simulated are labelled on screen as sample profiles.
* A recorded fixture replay so the video and the judges cost no units.
* Show the agent trace and the unit ledger on screen so the technical depth is visible.

## Risks and open questions

* Hair Density Detection returns four grades. They may be too coarse to show change over a few weeks.
* Hair transfer rejects bald and very short hair. The exact threshold is not known yet.
* Chaining a clothes render into hair transfer is unproven.
* Unit costs for density, length, volume, hair transfer v2.1 and clothes v4 are not confirmed.
* A believable demo needs dated photos of one consenting person.
* Medical and body image sensitivity needs careful wording on every screen.

The first 48 hours of the build exist to answer the first four. The plan for that is in the spec.

## Out of scope for the hackathon build

Native apps, accounts for care teams, any health data, insurance features, real checkout and payments, and live retailer catalog sync. A sample catalog is enough.
