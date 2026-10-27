# Frontend rules

Next.js App Router PWA in `apps/web`, mobile first. Pages and flows: [architecture.md](../architecture.md) section 10. Visual rules: [design-system.md](design-system.md). Code style: [../typescript.md](../typescript.md).

## Conventions
- Server components by default. Add `'use client'` only for state, effects, camera or browser APIs, and keep those components small.
- The browser only calls `/api/*`, which the web server forwards to the API (`API_ORIGIN`, server side only), so the session and owner cookies are first party. No YouCam or LLM keys or calls from the browser.
- Validate API responses with the zod schemas from `@interim/types` at the fetch boundary; pass typed data down.
- Capture checks (angle, light, resolution) run on the device and block upload on failure. They are advisory; the server checks again.
- Photos upload straight to storage through presigned links from the API.
- Test the camera and install flow on iOS Safari and Android Chrome.

## Screens and state
A new person goes welcome, sign up, then situation, setup (tone, head covering, age), consent and ready; the three steps after sign up show a progress line. Someone signed in who opens `/` goes straight to where they left off: situation with no profile, consent or ready with one, `/account` with several. Language is not a step: it follows the browser until the person uses the globe in the header. Sign in lives at `/signin`, `/signup`, `/magic`, `/forgot`, `/recover`, `/reset` and `/auth/confirm`, the signed in person's page is `/account`, and `/settings/[id]` changes tone and head covering after setup. The API sets the `interim_session` cookie; the web app only checks it exists before asking `/auth/me`, so a signed out visit makes no extra call. An emailed link opens `/auth/confirm` or `/reset`, and a link is spent only when its button is tapped, never on load. Google sign in is a plain link to `/api/auth/google/start`, shown only when the API reports it is on. Every screen after sign up redirects to sign in when there is no session. The language and theme live in cookies (`interim_locale`, `interim_theme`) that the server reads, so pages render in the right language and theme from the first paint. Before a language is chosen, the browser's `Accept-Language` picks one the app offers, else English, and nothing is stored until the person chooses. A globe button in the header opens the language screen from any page and brings the person back to where they were. The situation travels in the address of the setup step. The profile is created, under the signed in account, when setup is submitted, and later screens read it by id on the server with the person's cookie. The language and situation screens are plain forms and work without JavaScript.

From the ready screen, "Start a check in" opens `/capture/[id]`: the capture wizard asks for what `capturePlan` says (front, both sides and a body photo only where needed, top optional), checks each photo on the device and sends them straight to storage. It then starts a run and moves to `/runs/[id]`, which follows the run's event stream and moves to `/cards/[id]` when the card is ready. A client component can only read the namespaces that `app/layout.tsx` passes to `NextIntlClientProvider`, so a new island needs its namespace added there. The Camera Kit script is loaded only on the capture screen; if it fails to load or the camera is refused the wizard offers the file input instead, and it must stay that way.

From the ready screen of a situation that uses fit, "Choose clothes to try on" opens `/clothes/[id]`: the sample catalog with a save or remove button on each piece. Saved pieces are shown on the body photo at each check in, and the Stage Card lists them with a shopping list and what to hold off buying (docs/agent.md). A card with nothing saved links here.

The ready screen has a plain link to `/api/profiles/[id]/export.zip`, which downloads the person's data with their renders. It is a link and not a script, so it works without JavaScript.

From the ready screen, "Reflection" opens `/reflect/[id]`: one prompt, a text box, the saved reflections with a delete on each, and a permanent "Need to talk to someone?" link. The device runs the exact crisis check before it sends, so the contacts card (`CrisisContacts`, region from the browser, changeable) shows at once; the server checks again. A flagged profile also shows the card on the ready screen until the person closes it. The Stage Card offers the screen after a check in that reports a lot of change.

Words for today is chosen on the settings screen (off, or one of four sets). While it is on, the ready screen shows today's passage with its source and translation, fetched with the person's local date so it turns over at their midnight. When the set has no translation in their language the passage is English and a note says why.

The Stage Card makes share links (`ShareCard`): a new link is shown once with a copy button, because the API keeps only a hash, and later visits list the links that still work with a stop button each. `/s/[token]` is the share view for someone signed out. It calls the API without the person's cookie, answers 404 for a link that is unknown, expired or revoked, and sets `noindex` and `no-referrer`.

`/demo` is open to anyone and lists the sample people with their check ins; `/demo/cards/[id]` shows one recorded card. Both are server components that call the API without the person's cookie, and the card page renders the same `StageCardBody` as `/cards/[id]` with nothing that changes data. The welcome screen links to it.

Before a screen is done, check it in both themes at 320px and 390px wide, with the keyboard only, and with an axe audit that reports no violations.

## Copy
User facing strings follow the language rules in [../product/overview.md](../product/overview.md) and are scanned with `@interim/rules`.

The app uses [next-intl](https://next-intl.dev). The server reads the person's language in `i18n/request.ts` and every page gets that language's messages. Server components call `getTranslations('namespace')` and client components `useTranslations('namespace')`. Keys are typed from the English file (`global.d.ts`), so a key that does not exist fails the typecheck.

**Translations move with the frontend.** No text is written inline in a component. Every string lives in `packages/templates/src/messages/<locale>.json`, one file per language, with the same keys in every file. Any frontend change that adds, edits or removes text updates all ten files in the same pull request, not only English:
- Add the key to `en.json` first, then to the other nine. `copy.test.ts` fails if a language has a missing or extra key, an empty string, or different `{marks}` from English.
- The same test runs the banned word and companion phrase scans on every string in every language, so a new string is covered with no list to update.
- Put a value into a sentence with a mark such as `{current}`, never by joining fragments, so word order can differ between languages. Keep numbers, dates and sizes out of the text and pass them in. Write a curly apostrophe (’) rather than `'`, because next-intl treats a straight one before `{` as an escape.
- Every language is written with care and checked against verified sources where unsure; none is labelled a draft. Words for today live in `words/<locale>.ts`, and a set with no public domain translation falls back to English.
- The `Messages` type in `packages/templates` is what the API reads for fixed notes, situation names and the lines for what to say, so the API and the web app never keep separate copies.

## Accessibility
Every control is keyboard reachable and labelled; contrast meets WCAG AA; do not rely on color alone; respect reduced motion. The page's `lang` is the person's language, a language's own name carries its own `lang` on the language screen, a button that is off says why through `aria-describedby`, and a status line announces when a form is working. The theme and language buttons are labelled by what they do.

The screen reader pass (VoiceOver and TalkBack testing) comes after the core flow works end to end. Until then the basics above still apply to every component.

## PWA
`app/manifest.ts` defines the manifest. `public/sw.js` is the service worker; it only shows pushes, which the server writes in the person's language (spec section 12a). Icons are still to add.
