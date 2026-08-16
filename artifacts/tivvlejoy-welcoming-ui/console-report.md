# Browser console report

Source: headless Chrome against `http://127.0.0.1:3010` after the favicon/icon fix.

## Errors

None on the recaptured pages.

The first capture recorded one `404` for `/favicon.ico` on the dashboard only. `apps/web/src/app/icon.svg` was added so Next serves a studio icon. Recapture console no longer contains `type: "error"`.

## Info

Every page logs the standard React DevTools development hint:

`Download the React DevTools for a better development experience`

That is expected in `next dev` and is not a product defect.

## Network

No failed document, script, or stylesheet requests were recorded after the icon fix.

Google Fonts (Nunito, Fraunces) loaded. If a future offline environment blocks `fonts.googleapis.com`, the UI falls back to system sans/serif already listed in CSS.

## Local requests

Document routes checked with HTTP 200:

`/`, `/workflow`, `/preproduction`, `/direction`, `/settings`, `/new-episode`, `/production-setup`, `/voices`, `/continuity`, `/storyboards`, `/icon.svg`

No paid-provider or cloud-render calls were observed.
