# Design system

The app is for people who may be tired, unwell or low on patience, often on a phone and sometimes with blurred vision. The look is calm and text led: one column, large type and tap targets, quiet colour, one main action per screen. It avoids anything that competes for attention.

Tailwind CSS v4 only; no component library. Colours are CSS variables in `apps/web/app/globals.css`. Change a value there, never hardcode it in a component.

## Colour
Cool, muted and low in saturation: slate ink on a pale mist background, with one teal accent. Each theme sets the variables; `@theme inline` maps them to Tailwind utilities (`bg-bg`, `text-muted`, `border-outline`, `bg-accent`).

| Token | Purpose | Light | Dark |
| --- | --- | --- | --- |
| `bg`, `surface` | Page, and rows and cards | `#f1f5f6`, `#fafcfc` | `#0d161b`, `#141f25` |
| `tint` | Selected and highlighted backgrounds | `#dcebed` | `#173840` |
| `text`, `muted` | Body and secondary text | `#13232b`, `#47595f` | `#e3edf0`, `#9fb2ba` |
| `border`, `outline` | Dividers, and the outline of controls | `#c9d5da`, `#71868e` | `#2a3b43`, `#5f7884` |
| `accent`, `accent-hover`, `on-accent` | Buttons, selection, focus | `#1b6872`, `#14535b`, `#fff` | `#7fc6ce`, `#9cd5db`, `#07161a` |
| `danger` | Errors and irreversible actions | `#a02d3b` | `#f2a0a8` |

Contrast, measured: body text on the page is 14.7:1 in light and 15.4:1 in dark, secondary text 6.7:1 and 8.3:1, accent text 5.9:1 and 9.5:1, button text on accent 6.4:1 and 9.6:1, and control outlines 3.5:1 and 3.9:1. Keep body text at 7:1 or more, secondary text at 4.5:1 or more and control outlines at 3:1 or more, and recompute before changing a colour.

## Theme
The device's setting applies until the person uses the toggle, which stores `interim_theme` (`light` or `dark`) in a cookie. The server reads it and renders `data-theme` on `<html>`, so there is no flash. A `prefers-color-scheme` rule covers the default.

## Type
Newsreader (a soft serif) for headings and Source Sans 3 for text, both loaded with `next/font`. Both cover the extended Latin and Vietnamese letters that Yoruba, Igbo and Hausa need, so a language added later does not fall back to another font. Arabic will need its own font and right to left layout.

The root size is 18px and everything is in rem. Headings balance their lines. Do not set text smaller than 0.9rem.

## Layout
Mobile first: a single column, `max-w-md` (28rem), 20px side gutters, centred on larger screens. The main action sits in a sticky bar at the bottom, where a thumb reaches it, with the safe area respected. Tap targets are at least 44px (buttons 56px, rows about 72px). Rows and buttons use the card radius (0.875rem) and 0.75rem.

## Components
| Component | Use |
| --- | --- |
| `Shell` | The page frame: header, back link, theme toggle, optional step progress |
| `Actions` | The sticky bottom bar |
| `Button` | Primary (one per screen), secondary and danger |
| `ChoiceRow` | A large radio or checkbox row. The input stays real, so it works with a keyboard, a screen reader and without JavaScript |
| `PageHeading`, `Notice`, `ThemeToggle`, `StageDots` | Title, error message, theme switch, and the decorative line of five dots |

Still to build: the capture wizard step, the run progress line, the Stage Card and the ledger row. Each should be small, take typed props from `@interim/types` and need no extra dependency.

## Keep it plain
No gradients, glow, blur, heavy shadows, emoji, or icon-in-a-circle cards. Colour is not the only signal: a selected row also changes its marker and border. Motion is limited to colour changes and is off for people who ask for reduced motion. Errors use `role="alert"` and say what to do.
