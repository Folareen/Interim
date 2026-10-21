# Frontend rules

Next.js App Router PWA in `apps/web`, mobile first. Pages and flows: [architecture.md](../architecture.md) section 10. Visual rules: [design-system.md](design-system.md). Code style: [../typescript.md](../typescript.md).

## Conventions
- Server components by default. Add `'use client'` only for state, effects, camera or browser APIs, and keep those components small.
- The browser only talks to the Interim API (`NEXT_PUBLIC_API_URL`). No YouCam or LLM keys or calls from the browser.
- Validate API responses with the zod schemas from `@interim/types` at the fetch boundary; pass typed data down.
- Capture checks (angle, light, resolution) run on the device and block upload on failure. They are advisory; the server checks again.
- Photos upload straight to storage through presigned links from the API.
- Test the camera and install flow on iOS Safari and Android Chrome.
- Call the API through the `/api/*` proxy so the owner cookie is first party.

## Copy
User facing strings follow the language rules in [../product/overview.md](../product/overview.md) and are scanned with `@interim/rules`.

**Translations move with the frontend.** No text is written inline in a component. Every string lives in a language catalog (`packages/templates/src/copy/<locale>.ts`, extending the `Copy` type; words for today in `words/<locale>.ts`). Any frontend change that adds, edits or removes text updates the catalog of every language in the same pull request, not only English:
- Add the key to `Copy` first. The catalogs are typed `Record<LiveLocale, Copy>`, so the build fails until each live language has it.
- Add the new strings to the list in `copy.test.ts`, so both language scans run on them in every language.
- A language that is not live yet has no file. Draft its text when the language is added, and turn it on only after a native speaker has reviewed the copy and its word lists ([../product/spec.md](../product/spec.md) section 13).
- Do not build text by joining fragments, and keep numbers, dates and sizes out of the sentence (pass them in) so word order can differ between languages.

## Accessibility
Every control is keyboard reachable and labelled; contrast meets WCAG AA; do not rely on color alone; respect reduced motion.

The screen reader pass (VoiceOver and TalkBack testing, the page language set to the person's language) and read aloud ([../product/spec.md](../product/spec.md) section 12b) come after the core flow works end to end. Until then the basics above still apply to every component.

## PWA
`app/manifest.ts` defines the manifest. Icons and service worker are still to add.
