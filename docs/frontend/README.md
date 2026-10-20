# Frontend rules

Next.js App Router PWA in `apps/web`, mobile first. Pages and flows: [architecture.md](architecture.md) section 10. Visual rules: [design-system.md](design-system.md). Code style: [../typescript.md](../typescript.md).

## Conventions
- Server components by default. Add `'use client'` only for state, effects, camera or browser APIs, and keep those components small.
- The browser only talks to the Interim API (`NEXT_PUBLIC_API_URL`). No YouCam or LLM keys or calls from the browser.
- Validate API responses with the zod schemas from `@interim/types` at the fetch boundary; pass typed data down.
- Capture checks (angle, light, resolution) run on the device and block upload on failure. They are advisory; the server checks again.
- Photos upload straight to storage through presigned links from the API.
- Test the camera and install flow on iOS Safari and Android Chrome.
- Shared types come from `@interim/types`; do not redefine them in the app.
- Routes: templates, consent, capture, runs/[id], cards/[id], judge, privacy, terms.
- Call the API through the `/api/*` proxy so the owner cookie is first party.

## Copy
User facing strings follow the language rules in [../product/overview.md](../product/overview.md) and are scanned with `@interim/rules`.

## Accessibility
Every control is keyboard reachable and labelled; contrast meets WCAG AA; do not rely on color alone; respect reduced motion.

## PWA
`app/manifest.ts` defines the manifest. Icons and service worker are still to add.
