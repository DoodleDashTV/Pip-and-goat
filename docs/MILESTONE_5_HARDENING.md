# Milestone 5 hardening

Protected checkpoint: `ec8d1ed` (Draft PR #27) stays unmerged.

This branch fail-closes the real launch paths that Milestone 5 only documented.

## Enforced paths

- `generateFinal()` calls `assertProductionLaunchSafe` before any queue
- `queueEpisode(FINAL_1080P)` calls the same hook
- `PublishingService.createRelease()` refuses publishing
- create-episode / generate-final routes pass env paid flags
- `PROXY_PAID_LAUNCH_REFUSED` is inside `requiredForReady`

Unmarked `generate-final` is `FINAL_RENDER_REFUSED` while the theatrical gate is closed.

## Persistence

Statuses: `PERSISTED` | `EPHEMERAL_TEST_ONLY` | `PERSISTENCE_FAILED`.
`optionalDelegate` missing is never reported as a durable write.
`durableRequired: true` throws on failure.

## Executed media

`pnpm validate:milestone5` / `pnpm validate:hardening` executes visual holds,
synthetic non-voice audio, mux, and ffprobe checks. Evidence:
`artifacts/milestone-5-workflow/proxy-draft.mp4`.
