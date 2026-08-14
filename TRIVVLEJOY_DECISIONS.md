# TrivvleJoy Studio Architectural Decisions

## D-001 — Accepted baseline is immutable
Use `1ff46d595023ede5a33aa9e7f12cbbebe5ec9ed1` on `cursor/canonical-ddp-baseline-ba2f` as recovery root; never implement from stale `main`. It contains accepted PR #10 and provides the rollback point.

## D-002 — Integration branch is additive
All work occurs on `codex/trivvlejoy-recovery-integration` with focused reversible commits.

## D-003 — PR #11 is source material, not a merge unit
Selectively port from `cursor/ddp-steps-1-8-production-excellence-6b40`. It is exactly based on `1ff46d5`, but mixes safe presentation changes with direction/render changes and a worker-fingerprint impact. Blind merge/cherry-pick is rejected.

## D-004 — Presentation rebrand preserves DDP internals
User-facing brand is `TrivvleJoy Studios`; persisted identifiers, package names, storage prefixes, schema/version strings, worker image names and historical provenance remain DDP where compatibility requires it. Legacy stored names resolve at presentation time. Repository-wide replacement is rejected because it risks orphaning accepted evidence and caches.

## D-005 — Paid cloud remains fail-closed
No paid activity under this contract; preserve `CLOUD_RENDER_ENABLED=false` and `ALLOW_PAID_GPU_LAUNCH=false` posture unless narrowly authorized later.

## D-006 — Environment limitations are BLOCKED, not PASS
Unavailable Blender, local checkout, credentials or external services are explicitly recorded and never represented as successful validation.

## D-007 — Milestone boundaries prevent accidental feature coupling
M1 ports branding without PR #11's `/direction` route/nav or render changes. Direction UI and software systems wait for M2. This keeps the branding checkpoint render-neutral and reversible.

## D-008 — Legacy brand resolution is non-destructive
Recognized historical names map to `TrivvleJoy Studios` only when displayed; unknown custom names pass through unchanged. This avoids data migration and preserves deliberate custom universe names.
