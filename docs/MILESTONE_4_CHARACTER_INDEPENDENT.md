# Studio Milestone 4 — Character-independent pre-production

Parallel studio track. Not DDP Steps 9–16. Not theatrical character binding.

## Why this branch

`main` is asset-upload only. The last accepted studio-systems checkpoint is
Milestone 3 (`cursor/trivvlejoy-milestone-3-1ebc` @ `2fdac1d`). PRs #14–#25 are
character / theatrical work and stay isolated. Draft PR #24 remains draft.

## What shipped

Package `@doodle-dash/preproduction` (pure: no database, network, or clock):

| System | Role |
| --- | --- |
| Story | Deterministic child-safe episode drafts |
| Continuity | Planted / paid / dangling ledger |
| Storyboard | 9:16 panels |
| Animatic | 30 fps DRAFT timing |
| Shot plan | 9:16 camera language, caption-safe |
| Library | Reusable env / prop / lighting / VFX *planning* |
| Audio | Dialogue / music / foley; locked voices untouched |
| Orchestration | Local cache, retry, recovery; spend refuse |
| QC | Visual / motion / audio checks on drafts |
| Gates | Fail-closed proxy → final production blockers |

## Proxy characters

Used only when pipeline testing needs occupants:

- `PROXY_NONCANONICAL_BIRD_A`
- `PROXY_NONCANONICAL_QUADRUPED_A`

Label: `NONCANONICAL_PROXY`. Watermark: `PROXY — NOT FOR FINAL PRODUCTION`.
They cannot be named Pip or Goat, cannot bind `pip_default_v1` / `goat_default_v1`,
cannot emit a ScenePlan, and cannot enter FINAL / THEATRICAL / production-library.

## Canonical story path

A story that uses founding *codes* as roles (not assets) may emit a DRAFT
`ddp-scene-plan-v1` for the existing director. That is still not a theatrical
bind and not a hero render.

## Commands

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm validate:milestone4
pnpm validate:steps1-8
```

Do not run paid GPU commands.

## Rollback

Remove the `@doodle-dash/preproduction` package, the `/preproduction` route,
and `packages/production/src/proxy-output-gate.ts`. Nothing else is required.
`production-library/` is untouched.
