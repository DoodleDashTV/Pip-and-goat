# Accessibility report — TivvleJoy welcoming UI

Checked against WCAG AA where practical. This repository has no Playwright or axe suite; checks are source review plus rendered-page inspection.

## Contrast

| Pair | Use | Result |
| --- | --- | --- |
| `#263238` on `#FFF8E8` | Body text on Warm Cream | Passes normal text |
| `#66777C` on `#FFF8E8` | Muted text | Passes normal text |
| `#FFFFFF` on `#168C8C` | Primary button | Passes |
| `#FFFFFF` on `#173F4A` | Navigation | Passes |
| `#143322` on `#E7F5EC` | Success badge text | Passes after token fix |
| `#3D2A0A` on `#FDF3E3` | Warning badge text | Passes after token fix |
| `#3D1414` on `#FBEAEA` | Error / closed badge text | Passes after token fix |

Status badges also use a matching border color and an icon, so status is not color-only.

## Keyboard and focus

- `:focus-visible` draws a 3px Tivvle Teal ring with offset.
- Skip link “Skip to main content” targets `#studio-main`.
- Mobile Menu uses `aria-expanded` and `aria-controls="studio-navigation"`.
- Forms keep visible `<label>` / `<span>` labels on every field.

## Structure

- `html lang="en"`
- Landmark: skip link, `nav aria-label="Studio"`, `main#studio-main`
- Page headings remain `h1` then section `h2`
- Dialogs were not added; existing pages keep their current labeling

## Motion

- Hover transitions are 160ms color-only.
- `prefers-reduced-motion: reduce` collapses animation and transition duration.

## Touch

- Menu, primary buttons, and status rows use `min-h-touch` (44px).
- Cards stack on 390px. No horizontal overflow on captured pages.

## Residual limits

- There is no automated axe/Playwright accessibility suite in this repo.
- Some older pages still use remapped `text-leaf-*` / `text-sun-*` utilities. Those now resolve to semantic tokens, but their markup was not rewritten.
- Dark-mode tokens exist on `.dark` only. There is no appearance toggle because none existed before.
