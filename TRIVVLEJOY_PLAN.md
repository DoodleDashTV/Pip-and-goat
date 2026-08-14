# TrivvleJoy Studio Plan

All milestones inherit `TRIVVLEJOY_BUILD_CONTRACT.md` safety and quality requirements.

## M0 — Recovery Foundation
Dependencies: immutable baseline `1ff46d5`.
Acceptance: controlled branch descends directly from baseline; four durable files committed; setup/validation commands inventoried; safest baseline checks evaluated/run where execution environment permits; environment limitations explicit; no paid activity.
Validation inventory: `pnpm install`; `pnpm db:generate`; `pnpm db:migrate`; `pnpm db:seed`; `pnpm test`; `pnpm typecheck`; `pnpm lint`; `pnpm build`; `pnpm acceptance`; `pnpm test:blender`; `pnpm test:color`; `pnpm gates:scene`; `pnpm gates:faults`; `pnpm gates:local`; non-billable cloud commands only when credentials/tools are safely available.

## M1 — TrivvleJoy Presentation Integration
Dependencies: M0.
Port only display-layer branding from PR #11. Preserve internal DDP identifiers/storage/database compatibility. Consistently display `TrivvleJoy Studios`. Add resolver/legacy compatibility tests. No Blender behavior changes.
Acceptance: branding tests + relevant unit/interface tests, typecheck and lint pass; render inputs unchanged.

## M2 — Steps 1–8 Software Consolidation
Dependencies: M1.
Selectively port/review Director AI, acting planning, emotion engine, facial planning, 9:16 camera intelligence, Lighting Director, VFX registry and professional sound. Verify inputs/outputs/persistence/consumers; avoid dead planning-only code; deterministic provenance; focused tests; document render-fingerprint effects. Commit coherent subsystem groups.

## M3 — Blender Consumer Completion
Dependencies: M2.
Wire direction data into real body actions, eye/head direction, facial/viseme behavior, emotion poses/timing, camera, lighting, VFX timing and downstream sound-event metadata. Preserve character lock and chest-seam repair. Deterministic mappings; reject malformed/unsupported data; consumer/regression tests; never substitute camera motion for character motion.

## M4 — Local Integration Acceptance
Dependencies: M3.
Run all available non-billable validation: unit/integration, typecheck, lint, Prisma/schema, rig, Blender, QC, scene, color, fault injection, character/asset fingerprints, local acceptance and local FINAL_1080P when Blender exists. Repair integration regressions without weakening gates. Environmental omissions remain BLOCKED, never PASS.

## M5 — Worker Reproducibility Preparation
Dependencies: stable M4.
Calculate new render-code fingerprint; document reproducible worker build; verify Docker/build configuration without publication; prepare exact free preflight plan. Do not publish/push/deploy worker images or invoke paid resources.

## M6 — Usable Studio Expansion
Dependencies: M0–M4 locally correct, with environmental gaps explicitly bounded.
Polish phone workflow; verify 15/30/45/60 controls; simple adjustable monthly-budget UI backed by existing limits; pre-authorization cost estimates; fail-closed paid controls; progress/failure reporting; cache visibility; mobile and budget tests. No public deployment.

## M7 — Longer Episode Productization
Dependencies: stable short-form workflow.
Add 2/3/5-minute options using shot composition, projected cost/runtime checks, cache/dirty-shot reuse, migrations/validation/regression tests. No paid validation renders.

## M8 — Multi-Episode Batch Production
Dependencies: M7.
Add multi-select + Build All, bounded concurrency, aggregate daily/monthly budget enforcement, pause/cancel/retry/failure isolation, double-dispatch prevention, authoritative reconciliation and recovery/concurrency tests. Real paid dispatch stays disabled.

## M9 — Remaining Professional Studio Roadmap
Dependencies: prior milestones stable.
Extend Story Brain/canon, hook/retention, storyboard/animatic, visual/motion/audio QC, targeted repair, asset intelligence, pixel-level temporal quality, versioning/rollback/crash recovery, security/audit/backup/vulnerability scanning, golden scenes, rights/provenance, kids safety, Studio Health Dashboard and platform export validation—only within no-paid/no-deploy/no-secret boundaries.
