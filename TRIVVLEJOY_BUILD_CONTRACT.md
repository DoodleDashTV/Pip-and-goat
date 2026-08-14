# TrivvleJoy Studio Autonomous Build Contract

## Primary outcome
Continue TrivvleJoy Studio milestone-by-milestone as a professional, phone-friendly children's animation studio centered on Pip and Goat while preserving the accepted Blender/EEVEE production foundation.

Roadmap: genuine 3D animation; professional directing, acting, emotion, facial performance, camera, lighting, VFX and sound; locked character/voice identities; 1080x1920 vertical 30 FPS production; verified 15/30/45/60-second episodes followed by 2/3/5-minute production; multi-episode batch production; adjustable monthly budgets; R2, RunPod and local Blender fallback; automated visual/motion/audio/character/cost/safety QC; usable web UI throughout development.

## Immutable recovery baseline
- Repository: `DoodleDashTV/Pip-and-goat`
- Baseline branch: `cursor/canonical-ddp-baseline-ba2f`
- Baseline commit: `1ff46d595023ede5a33aa9e7f12cbbebe5ec9ed1`
- PR #10: merged and accepted.

Never rewrite, reset, force-push, delete, or directly modify the baseline branch/commit. Never use stale `main` as the implementation base.

## Controlled branch
All implementation work under this contract belongs on `codex/trivvlejoy-recovery-integration`, created directly from the immutable baseline. Resume it only while its ancestry remains safe.

## Safety prohibitions
Without new explicit user approval, never: launch paid GPU/RunPod/billable renders; enable `CLOUD_RENDER_ENABLED` or `ALLOW_PAID_GPU_LAUNCH`; increase/bypass spending limits; merge PRs or merge into main/canonical; deploy/publish publicly; rotate/print/reveal/move/modify secrets; delete branches/tags/releases/storage/production data/assets; force-push/rewrite history; weaken/skip/lower quality gates to pass; change locked Pip/Goat identity; replace accepted assets with approximations; claim unavailable validation passed; blindly merge PR #9 or #11.

`CLOUD_RENDER_ENABLED=false` and `ALLOW_PAID_GPU_LAUNCH=false` remain the protected posture. This contract authorizes no paid operation.

## Quality requirements
A milestone is done only when behavior is implemented, consumers are wired, focused tests exist, all available relevant tests pass, accepted quality/safety gates remain intact, documentation/progress are current, a recoverable checkpoint exists, environmental validation gaps are explicit, and no prohibited activity occurred.

Preserve the accepted FINAL_1080P Blender/EEVEE architecture, Pip/Goat assets and chest-seam repair, real basic motion, R2/RunPod/local fallback architecture, pinned worker verification, cost/authorization/runaway controls, render/voice caches, dirty-shot rerendering, QC gates, Prisma state, and 15/30/45/60 workflow.

## Character and voice lock
Pip: girl chick; yellow body; red crest; orange beak and three-toed feet; purple backpack; curious, cheerful, kind, enthusiastic; youthful bright sweet medium-high voice, never squeaky.

Goat: boy goat; cream body; horns; pink nose; collar and `Goat` tag; warm, playful, adventurous; youthful warm medium voice, never deep or babyish.

Do not invent replacement production voices and call them locked. If approved reference voice assets are unavailable, preserve interfaces and mark final voice validation blocked.

## Checkpoints and testing
Use focused, reversible commits. Update `TRIVVLEJOY_PROGRESS.md` before every checkpoint and before stopping. Run the milestone's available unit/integration, type, lint, schema, Blender, QC, scene, color, fault, fingerprint and local acceptance checks as applicable. Never treat unavailable Blender/credentials as a pass. Never weaken thresholds.

After each milestone: update progress, checkpoint, read the next milestone, and continue automatically while within this contract. Do not pause for routine engineering choices.

## Genuine blockers
Stop only for: required paid activity; required unavailable credential; destructive/irreversible action; production deployment/merge; architectural ambiguity with materially different user outcomes; missing/corrupted baseline; branch ancestry conflict; evidence the accepted baseline itself is invalid; required external service unavailable after reasonable safe diagnosis; usage/system limits.

Before stopping: preserve state, run possible validations, update progress/decisions, commit a clean checkpoint when permitted, and state exact evidence and safest next action.

## Source-of-truth order
1. This contract.
2. Accepted baseline behavior at `1ff46d5`.
3. Locked Pip/Goat requirements.
4. Repository tests and fail-closed gates.
5. `TRIVVLEJOY_PLAN.md`.
6. `TRIVVLEJOY_DECISIONS.md`.
7. Existing implementation docs.
8. Historical branch notes/status messages.

Historical documents are evidence, not proof.

## PR policy
PR #11 (`cursor/ddp-steps-1-8-production-excellence-6b40`) is reviewed source material only. Port selectively, inspect diffs/fingerprint impact, preserve compatible DDP internals, test consumers, and never claim planning-only data is integrated.

PR #9 (`agent/ddp-control-center`) remains isolated until the core studio is stable.

## Resume instructions
Every future agent MUST read all four root files before modifying code: `TRIVVLEJOY_BUILD_CONTRACT.md`, `TRIVVLEJOY_PLAN.md`, `TRIVVLEJOY_PROGRESS.md`, and `TRIVVLEJOY_DECISIONS.md`. Then verify branch ancestry and working state, read progress/decisions, run the smallest state-establishing validation, and continue from the recorded next action without restarting completed milestones.
