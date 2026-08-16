# Studio hardening 17–24

Stacked on the accepted Milestone 5 hardening tip
`82f26c81fc3564321289831a95ae93468b2f1369` (`cursor/studio-m5-hardening-73f1`,
Draft PR #28). Draft PRs #24, #26, #27, and #28 stay unmerged.

This is a character-independent studio track. It is not DDP Steps 9–16 and
does not flip the theatrical gate.

## Persistence close-out

`pnpm validate:persist` creates a disposable local database
`doodle_dash_persist_validate`, generates the Prisma client, migrates, writes a
real `PERSISTED` Episode 1 draft run, reloads it with a fresh client, proves
idempotent reuse, keeps fixtures `EPHEMERAL_TEST_ONLY`, and fail-closes
`PERSISTENCE_FAILED` / `durableRequired`. The disposable database is dropped
afterward. Evidence never records a password.

## Hardening modules

| # | Module | Safety |
| --- | --- | --- |
| 17 | `versioning/` | Rollback stays `DRAFT_NONCANONICAL` |
| 18 | `dependencies/` | Invalidation never authorizes paid rerender |
| 19 | `cache/` | Restore must re-evaluate QC and safety |
| 20 | `profile/` | Local planner timing only |
| 21 / 23 | `provenance/` | Commit, versions, inputs, hashes; no Pip/Goat assets |
| 22 | `analytics/` | Cost estimate is always $0 |
| 24 | `recovery/` | Resume re-evaluates current gates |

## Episode 1 draft

`buildEpisode1DraftPackage()` remains `DRAFT_NONCANONICAL`. Continuity and shot
dependencies are validated. Camera, lighting, environment, prop, VFX, and audio
cue manifests are planning-only. The revised proxy animatic is assembled locally
when ffmpeg is present.

## Commands

```bash
pnpm db:generate
pnpm validate:persist
pnpm validate:studio-hardening
pnpm test
pnpm typecheck
pnpm lint
```

Do not merge Draft PRs #24, #26, #27, or #28. Do not use paid resources.
