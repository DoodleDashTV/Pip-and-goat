# TrivvleJoy Studio Architectural Decisions

## D-001 — Accepted baseline is immutable
Use `1ff46d595023ede5a33aa9e7f12cbbebe5ec9ed1` on `cursor/canonical-ddp-baseline-ba2f` as recovery root; never implement from stale `main`.

## D-002 — Integration branch is additive
All work occurs on `codex/trivvlejoy-recovery-integration` with focused reversible commits.

## D-003 — PR #11 is source material, not a merge unit
Selectively port from `cursor/ddp-steps-1-8-production-excellence-6b40`. It shares exact merge-base `1ff46d5` but mixes presentation, software planning and render changes. Blind merge/cherry-pick is rejected.

## D-004 — Presentation rebrand preserves DDP internals
User-facing brand is `TrivvleJoy Studios`; persisted identifiers, package/storage/schema/worker names and historical provenance remain DDP where compatibility requires it. Legacy names resolve at presentation time.

## D-005 — Paid cloud remains fail-closed
No paid activity under this contract; preserve `CLOUD_RENDER_ENABLED=false` and `ALLOW_PAID_GPU_LAUNCH=false` posture.

## D-006 — Environment limitations are BLOCKED, not PASS
Unavailable Blender, local checkout, credentials or external services are explicit gaps and never successful validation.

## D-007 — Milestone boundaries prevent accidental coupling
M1 excluded Direction UI/render changes. M2 software consolidation excludes `assemble_scene.py`; actual Blender consumption is reserved for M3 and must be consumer-tested.

## D-008 — Legacy brand resolution is non-destructive
Recognized historical names map to `TrivvleJoy Studios` only when displayed; unknown custom names pass through unchanged.

## D-009 — Direction planning core remains pure
Port PR #11's `@doodle-dash/direction` package as a deterministic planning library before persistence/render consumers. Its design prohibits DB/filesystem/network/clock dependencies, keeping planning offline-testable and side-effect free.

## D-010 — Render-code changes are delayed until consumer milestone
Do not port PR #11's Blender hook as part of M2. Software planning stabilizes first; M3 will intentionally connect consumers and account for the render fingerprint once behavior changes.

## D-011 — Do not stack render changes on unexecuted integration code
The current connector environment can inspect and checkpoint GitHub source but has no mounted repository runtime for pnpm/Prisma/Blender execution. M1/M2 source may be preserved as checkpoints, but they are not declared validated until this branch's tests execute. M3 render-changing implementation is therefore held until executable validation is available. This is safer than using PR #11's historical test result as a substitute for testing the selectively integrated branch.

## D-012 — PR #11 camera hook is evidence, not M3 completion
Inspection confirms PR #11 adds only an opt-in explicit camera consumer to Blender. The PR itself documents acting, facial and VFX consumers as follow-up. M3 must implement those real consumers deliberately; copying the camera hook alone cannot satisfy genuine professional character-motion integration.
