# Visual review — TivvleJoy welcoming UI

Captured from the live Next.js preview at `http://127.0.0.1:3010` on 2026-08-16.

## Viewports

| Viewport | Size | Overflow |
| --- | --- | --- |
| Mobile | 390 × 844 | None on captured pages |
| Tablet | 768 × 1024 | None on captured pages |
| Desktop | 1440 × 900 | None on captured pages |

## Screens captured

| Screen | Mobile | Tablet | Desktop |
| --- | --- | --- | --- |
| Welcome / dashboard | `mobile/welcome-dashboard.png` | `tablet/welcome-dashboard.png` | `desktop/welcome-dashboard.png` |
| Navigation | `mobile/navigation-open.png` | sidebar collapsed behind Menu | `desktop/*.png` sidebar |
| Episode workflow | `mobile/workflow.png` | `tablet/workflow.png` | `desktop/workflow.png` |
| Pre-production | `mobile/preproduction.png` | `tablet/preproduction.png` | `desktop/preproduction.png` |
| Direction / production status | `mobile/direction.png` | `tablet/direction.png` | `desktop/direction.png` |
| Settings / theme | `mobile/settings-theme.png` | `tablet/settings-theme.png` | `desktop/settings-theme.png` |
| New episode form | `mobile/new-episode-form.png` | `tablet/new-episode-form.png` | `desktop/new-episode-form.png` |
| Production setup | `mobile/production-setup.png` | `tablet/production-setup.png` | `desktop/production-setup.png` |

## Color and hierarchy

- Workspace is Warm Cream, not the previous dark studio glow.
- Sidebar and mobile drawer are Deep Teal with white navigation text.
- Cards, forms, and production panels are white with Misty Teal borders and restrained shadows.
- Primary actions use Tivvle Teal with white labels.
- Sunny Yellow is limited to the Studios label and highlight accents, not large fills.
- Coral is reserved for small creative marks, not large areas.
- Success / warning / error states are distinct and include an icon plus text.

## Closed-gate labels

Every dashboard and workflow capture shows:

- Stage `DDP_STEPS_1_8`
- Theatrical gate Closed
- Steps 9–16 Closed
- Steps 25–32 Closed
- Episode 1 not canonical or production-ready
- Paid resources not authorized
- Pip/Goat theatrical binding not completed

No control on these screens implies a closed stage is operational.

## Issues found

- Tablet 768px uses the collapsible Menu header (`lg` breakpoint is 1024px). That is intentional and keeps the long nav from crowding the workspace.
- The Next.js development badge can overlay the left edge in headless captures. It is a development overlay, not a production control.
- Older catalog pages inherit the theme through CSS variables and remapped Tailwind tokens. They were not individually redesigned.

## Verdict

Professional, readable, and truthful. No toddler-game treatment, no large yellow/coral fields, no overflow on the captured pages.
