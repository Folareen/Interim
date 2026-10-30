# Design system

The app is for people who may be tired, unwell or low on patience, often on a phone and sometimes with blurred vision. The look is calm and text led: a single task column on phones, large type and tap targets, quiet colour, one main action per screen. It avoids anything that competes for attention.

Tailwind CSS v4 only; no component library. Colours are CSS variables in `apps/web/app/globals.css`. Change a value there, never hardcode it in a component.

## Colour
Warm beige surfaces, sage grey dividers and a deep green accent. Dark mode keeps the same relationships with pale sage controls. Each theme sets the variables; `@theme inline` maps them to Tailwind utilities (`bg-bg`, `text-muted`, `border-outline`, `bg-accent`).

| Token | Purpose | Light | Dark |
| --- | --- | --- | --- |
| `bg`, `surface` | Page, and rows and cards | `#f4f0e8`, `#fffcf6` | `#19221e`, `#202e26` |
| `tint` | Selected and highlighted backgrounds | `#e4e9df` | `#2d4034` |
| `text`, `muted` | Body and secondary text | `#26372f`, `#526057` | `#f3efe4`, `#b9c4b8` |
| `border`, `outline` | Dividers, and the outline of controls | `#cbd0c3`, `#758275` | `#435348`, `#819482` |
| `accent`, `accent-hover`, `on-accent` | Buttons, selection, focus | `#405b49`, `#314b3a`, `#fffcf6` | `#c0d0b4`, `#d4e0ca`, `#1b2c20` |
| `danger` | Errors and irreversible actions | `#a23e35` | `#ffb4a7` |

Contrast against the page, measured: body text 11.06:1 light and 14.18:1 dark; secondary text 5.83:1 and 9.04:1; accent text 6.57:1 and 10.03:1; button text on accent 7.30:1 and 9.05:1; control outlines 3.55:1 and 5.04:1. Secondary text on tint is 5.37:1 and 6.15:1. Keep body text at least 7:1, secondary text 4.5:1 and control outlines 3:1, and recompute before changing a colour.

## Theme
The device's setting applies until the person uses the toggle, which stores `interim_theme` (`light` or `dark`) in a cookie. The server reads it and renders `data-theme` on `<html>`, so there is no flash. A `prefers-color-scheme` rule covers the default.

## Type
Newsreader (a soft serif) for headings and Source Sans 3 for text, both loaded with `next/font`. Both cover the extended Latin and Vietnamese letters that Yoruba, Igbo and Hausa need, so a language added later does not fall back to another font. Arabic will need its own font and right to left layout.

The root size is 18px and everything is in rem. Headings balance their lines. Do not set text smaller than 0.9rem.

## Layout
Mobile first, with 20px gutters and one task column. Forms stay within `max-w-xl`; the workspace extends to 76rem, with a desktop sidebar and two-column dashboard or result where useful. Mobile navigation stays at the bottom, and a capture action bar sits above it with safe-area padding. Desktop navigation occupies its own column. Tap targets are at least 44px (main buttons at least 56px); buttons can grow for long translations. Cards use a 0.875rem radius.

The welcome pair uses resized synthetic fixtures from `packages/fixtures/sample/persona-f-stage-0.jpg` and `persona-f-stage-3.jpg` in `apps/web/public/demo`. Labels identify two simulated moments; this is not a claimed generated outcome. No personal photos are bundled.

## Components
| Component | Use |
| --- | --- |
| `Shell` | Responsive page frame, header, back link, theme toggle, workspace navigation and optional setup progress |
| `WorkspaceNav`, `ProfileSwitcher` | Three destinations and owned-situation switching |
| `Actions` | Sticky task bar, offset above mobile navigation |
| `Button` | Primary (one per screen), secondary and danger |
| `ChoiceRow` | A large radio or checkbox row. The input stays real, so it works with a keyboard, a screen reader and without JavaScript |
| `PageHeading`, `Notice`, `ThemeToggle`, `StageDots` | Title, error message, theme switch, and the decorative line of five dots |

The capture wizard, the run progress list and the Stage Card (with `OptionImage`, whose button swaps a preview and the person's own photo) are built as screen components under `app/capture`, `app/runs` and `app/cards`. The ledger screen uses the same bordered rows with the tool, purpose, units and date, and a separate definition list for held and spent totals. It reads typed data from `@interim/types` and needs no extra dependency.

## Keep it plain
No gradients, glow, blur, heavy shadows, emoji, or icon-in-a-circle cards. Colour is not the only signal: a selected row also changes its marker and border. Motion is limited to colour changes and is off for people who ask for reduced motion. Errors use `role="alert"` and say what to do.
