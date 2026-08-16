# Public preview blocker

Recorded: 2026-08-16

## Result

No public preview URL was created. A URL will not be invented.

## Why

- No Vercel, Cloudflare Pages, Netlify, or GitHub Pages project is configured.
- This environment has no Vercel/Cloudflare/Netlify login or token.
- GitHub Pages create/enable returns 403 for the agent token.
- Tunneling the local Next.js server would expose the internal database and `.env`. That is refused.

## Prepared so Justin can finish on iPhone

- `vercel.json` — monorepo install/build at the repository root
- `.vercelignore` — excludes `.env`, `production-library`, `*.blend`, `artifacts`, RunPod worker
- Public preview mode when `DATABASE_URL` is absent: dashboard still shows real closed gates; database actions say “Not available yet”

## Provider to use

Vercel Hobby (free). Do not add environment variables.
