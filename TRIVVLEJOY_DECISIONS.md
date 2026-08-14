# TrivvleJoy Studio Architectural Decisions

## D-001 — Accepted baseline is immutable
Decision: use `1ff46d595023ede5a33aa9e7f12cbbebe5ec9ed1` on `cursor/canonical-ddp-baseline-ba2f` as the recovery root and never implement from stale `main`.
Why: it contains the accepted PR #10 seam repair and recovered production foundation; preserving it provides an auditable rollback point.
Alternative rejected: rebasing recovery work onto `main`, because audit evidence shows it is stale.

## D-002 — Integration branch is additive
Decision: all work occurs on `codex/trivvlejoy-recovery-integration`, created directly from the accepted SHA, with focused reversible commits.
Why: isolates recovery while preserving accepted history and makes provenance/rollback straightforward.

## D-003 — PR #11 is source material, not a merge unit
Decision: selectively port reviewed portions from `cursor/ddp-steps-1-8-production-excellence-6b40`.
Why: PR #11 includes useful branding and professional direction systems but also changes render code and has an intentional worker fingerprint mismatch; selective integration limits regression risk.
Alternative rejected: blind merge/cherry-pick of the entire PR.

## D-004 — Presentation rebrand preserves DDP internals
Decision: user-facing brand becomes `TrivvleJoy Studios`; persisted identifiers, package names, storage prefixes, schema/version strings and historical provenance remain DDP where compatibility requires it. Legacy stored brand names resolve to the new display name rather than being mass-migrated.
Why: a presentation-layer resolver gives the desired product identity without orphaning accepted rows, assets, manifests, cache keys or worker provenance.
Alternative rejected: repository-wide DDP find/replace.

## D-005 — Paid cloud remains fail-closed
Decision: no paid activity under this contract; preserve `CLOUD_RENDER_ENABLED=false` and `ALLOW_PAID_GPU_LAUNCH=false` posture unless narrowly authorized later.
Why: the accepted architecture already has cost gates and this contract explicitly prohibits paid validation.

## D-006 — Environment limitations are BLOCKED, not PASS
Decision: unavailable Blender, local checkout, credentials or external services are recorded as environmental limitations. Their tests are never represented as successful.
Why: preserves the meaning of accepted quality gates and prevents false completion claims.
