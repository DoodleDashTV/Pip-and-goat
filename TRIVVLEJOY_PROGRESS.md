# TrivvleJoy Studio Progress

Updated: 2026-08-24

## TIVVLEJOY_CHARACTER_RIGGING_ANIMATION_DEPARTMENT_V1

Reusable Character Rigging & Animation Department. Goat is the first configured character. Pip is reserved and not rigged.

- Draft branch: `cursor/tivvlejoy-goat-production-rig-v1-73f1`
- Stacked on: `cursor/tivvlejoy-character-rig-animation-quality-gate-73f1`
- Operator surface: `/character-rigging`
- TypeScript: `apps/web/src/lib/tivvlejoy-character-rigging-department/`
- Blender package: `scripts/blender/characters/`
- Goat config: `config/characters/CHAR_GOAT_001/`
- Real asset: **GOAT_REAL_ASSET_EXECUTION_BLOCKED** until `production-library/characters/goat/SOURCE/Goat_FINN.zip` is attached
- Goat is **not** production-ready
- No paid GPU, no ElevenLabs, no Production mutation, no SOURCE overwrite
- Keep this Draft PR open and unmerged

## Repository state

Older scenery / voice / studio history below is unchanged. This section records the newest character-department increment only.

---

# TrivvleJoy Studio Progress (prior)

Updated: 2026-08-18

## Repository state

- Repository: `Pip-and-goat`
- Working branch: `cursor/tivvlejoy-scenery-pipeline-hardening-73f1`
- Scenery asset intake (Draft PR #44, keep draft and unmerged): `cursor/tivvlejoy-scenery-asset-intake-73f1` @ `b7f8c6785cfef661c434e960e3bcd3ccd91ff66c`
- Scenery foundation (Draft PR #43, keep draft and unmerged): `cursor/tivvlejoy-scenery-foundation-73f1` @ `32a9e222518e2986104bff28442c5f73fca0ef16`
- Durable Preview voice ledger (Draft PR #42, keep draft and unmerged): `cursor/tivvlejoy-durable-voice-ledger-73f1` @ `f51f8753dd495ab086aa2e81e4fb98aebe895650`
- Episode line voice workflow (Draft PR #41, keep draft and unmerged): `cursor/tivvlejoy-episode-line-voice-workflow-73f1` @ `0781409f9dc7e17b1c4a97f42f1a634f27116d5e`
- Preview voice test (Draft PR #40, keep draft and unmerged): `cursor/tivvlejoy-preview-voice-test-73f1` @ `1d117582b1dd2a299731483266ba77133d0211f7`
- Confirmed script-to-voice (Draft PR #39, keep draft and unmerged): `cursor/tivvlejoy-script-to-voice-73f1` @ `d59c51a8daf7fd7b7f136df96d892cdcb52060a2`
- Voice approval lock (keep unmerged): `cursor/tivvlejoy-voice-approval-lock-73f1` @ `109ac281319f2dc8f44e52b67cd5139b76626b08`
- Voice candidate preview (Draft PR #38, keep draft and unmerged): `cursor/tivvlejoy-voice-candidate-preview-73f1` @ `109ac281319f2dc8f44e52b67cd5139b76626b08`
- Voice preview stability (Draft PR #37, keep draft and unmerged): `cursor/tivvlejoy-voice-preview-stability-73f1` @ `a9f7aa3e12a1c9888f1d085afee810143aa832a0`
- Voice preview flow (Draft PR #36, keep draft and unmerged): `cursor/tivvlejoy-voice-preview-flow-73f1` @ `35bfce6daf3ace87747ebea39cf0c79647b669cf`
- Voice generation (Draft PR #35, keep draft and unmerged): `cursor/tivvlejoy-voice-generation-73f1` @ `3d0567df0c02585c5d716973d0038a86f190136c`
- Preview database connection-ready (Draft PR #34, keep draft and unmerged): `cursor/tivvlejoy-preview-db-ready-73f1` @ `27a4caee84df14f2fe9254755e76ab29e8a2111f`
- Persistence foundation (Draft PR #33, keep draft and unmerged): `cursor/tivvlejoy-production-persistence-73f1` @ `6e2994a50aef7be16a76c8d00d8b6b05e98119eb`
- Preview UX branch (Draft PR #32, keep draft and unmerged): `cursor/tivvlejoy-welcoming-ui-73f1` @ `72614b583ca8d064bf823fe80342fe9380f7fe81`
- Base: Studio Completion 25–32 (Draft PR #31, keep draft and unmerged): `cursor/studio-completion-25-32-73f1` @ `d857a033ed8869200ec22f88cb4b8e657b7c93a6`
- Closed-gate Steps 9–16 (Draft PR #30, keep unmerged): `cursor/studio-steps-9-16-closed-73f1` @ `e3d69e22521a62693345c565289ddd03e37a5e08`
- Accepted studio hardening 17–24 (Draft PR #29, keep unmerged): `cursor/studio-hardening-17-24-73f1` @ `b4e311ac3b72d004923506b104a27cd9ccec0480`
- Accepted Milestone 5 hardening (Draft PR #28, keep unmerged): `cursor/studio-m5-hardening-73f1` @ `82f26c81fc3564321289831a95ae93468b2f1369`
- Milestone 5 checkpoint (Draft PR #27, keep unmerged): `cursor/studio-milestone-5-workflow-73f1` @ `ec8d1ed8a7699855692031894e8782e78c21e66c`
- Milestone 4 (Draft PR #26, keep unmerged): `cursor/studio-character-independent-73f1`
- Accepted studio baseline: `cursor/trivvlejoy-milestone-3-1ebc` @ `2fdac1d5783a1aaca55953214cc140eb9525085a`
- Draft PR #24 remains isolated and unmerged.

## Current milestone

Controlled ElevenLabs approved-voice Preview path, default closed. Justin
can review locked Pip and Goat samples and confirm one script line at a
time. Preview may generate one confirmed line after Justin presses
Generate once. Production stays disabled.
Playback-test chimes stay available.
Theatrical / Steps 9–16 and Steps 25–32 stay closed. Public Preview stays
browser-only. Paid ElevenLabs stays disabled. No Preview or production
database is connected.

## Completed this increment

- Joyful Adventure semantic theme tokens in the existing CSS variable system
- Deep Teal navigation, Warm Cream workspace, white production cards
- Truthful dashboard status consumed from existing gate interfaces
- Collapsible mobile navigation and visible keyboard focus
- Temporary local preview for iPhone visual review
- Public-preview safety: no database, no secrets, no production-library upload
- Vercel preview must deploy `apps/web` from `cursor/tivvlejoy-welcoming-ui-73f1`, not `main`
- Draft PR #32 stays draft and unmerged
- Persistence interface for settings, productions, episodes, assets, voices, workflow, readiness, render requests, and audit events
- Production database adapter is a disconnected boundary
- Preview JSON export/import with schema and size checks
- Explicit persistence modes: preview-localStorage, preview-database, production-database
- Preview-database adapter interface for settings, productions, episodes, assets, voices, workflow, readiness, draft renders, and sanitized audit events
- Missing Preview database configuration shows Preview database: Not connected and keeps the browser Preview workspace
- Connection-readiness panel for mode, browser storage, Preview/Production database, backup, last save, and durability
- Failed production or preview-database writes stay fail-closed and are not rewritten to localStorage
- Server-side Pip/Goat voice registry with browser Voice IDs rejected
- Original voice-guide dialogue, fixture draft audio, approve/reject/regenerate, and usage ledger
- ALLOW_PAID_VOICE_GENERATION defaults to false. No paid provider is contacted.
- Create Sample Voice Episode action when no episode exists
- Original meadow sample scene with one pip_default_v1 line and one goat_default_v1 line
- Direct stay on /voice-production after sample creation
- Fixture audio labeled Preview fixture — not the final Pip/Goat voice
- Visible progress Draft → Review → Approved → Package Ready
- Browser-durable approve/reject/package so Preview serverless memory can recycle
- Draft PR #35 stays draft and unmerged
- Draft PR #36 stays draft and unmerged
- Newest visible form values flush before generate, regenerate, approve, reject, and download
- Stale responses cannot overwrite newer pronunciation, dialogue, emotion, or direction
- Pip card stays first and Goat stays second
- Playback-test chimes replace silent fixture WAVs and are labeled Playback test only — not Pip/Goat’s voice
- Goat pronunciation note no longer uses gooaating
- Draft PR #37 stays draft and unmerged
- Locked ElevenLabs candidate-test UI with fixed Pip/Goat lines and six stock slots
- Replaced six candidate auditions with two approved-voice sample actions
- Approved Pip and Goat Voice IDs stay server-side only
- Live generation requires server-only Preview gates and a timing-safe test token
- Provider is not contacted when any gate is closed
- Production voice generation remains refused
- Draft PR #38 stays draft and unmerged
- Pip’s “Let’s Doodle-Dash!” catchphrase is removed
- Audience-facing voice text cannot include Doodle Dash or Doodle-Dash
- Prohibited legacy-brand terms cannot reach ElevenLabs
- Pip may temporarily use “Let’s explore!” until Justin approves a new catchphrase
- Final voice-identity approval lock for Pip and Goat
- Approved ElevenLabs model and sample voice settings are recorded server-side
- Checkpoint TIVVLEJOY_VOICE_IDENTITY_LOCK_V1 records the approved sample model and settings
- Pip and Goat cannot share or swap Voice IDs
- Preview-only confirmed script-to-voice converts one user-confirmed line at a time
- Automatic whole-script or batch episode voice generation is not started
- Temporary Preview testing allowance is 250 characters per line, 3 successful paid requests, and 750 paid characters
- Confirmed Preview generation uses the locked ElevenLabs model and settings only
- Failed provider requests are recorded without secrets and are not billed
- Draft PR #39 stays draft and unmerged
- Draft PR #40 stays draft and unmerged
- Draft PR #41 stays draft and unmerged
- Draft PR #42 stays draft and unmerged
- Preview paid-voice usage is no longer stored only in process memory
- The durable Preview voice ledger fails closed when PostgreSQL is not configured
- Prior Pip and Goat paid tests cannot silently reset to zero
- Paid generation stays paused until prior usage is reconciled from authoritative receipts
- Preview voice-production first paint uses the server readiness snapshot so the visible page matches the unlocked Preview gates
- Justin approved newly generated Preview dialogue for both Pip and Goat on August 17, 2026
- That approval locks the existing Pip and Goat voice identities only. It does not approve the complete episode workflow or Production
- Preview episode scripts split into individual Pip and Goat lines that each require review, confirmation, and Generate this line once
- Checkpoint TIVVLEJOY_SCENERY_FOUNDATION_V1 adds a scenery source registry, catalog schema, recipes, deterministic planner, dry-run Blender inspect/assemble entry points, and a Preview Only / No Render /scenery workspace
- Village, SkyMachine, Stylized Forest, EcoKit, and HDRI packages were not present in the workspace and were not inspected
- Purchased scenery sources remain source_unavailable with empty SHA-256 fields
- Real Blender scenery inspection and assembly were not run
- Synthetic fixture catalog records contain no commercial geometry
- Draft PR #42 stays draft and unmerged
- Draft PR #43 stays draft and unmerged
- Checkpoint TIVVLEJOY_SCENERY_ASSET_INTAKE_V1 reuses the existing private R2 / OBJECT_STORAGE configuration with prefix `tivvlejoy-assets/`
- Expected purchased inventory is 27 production files across 4 collections
- No purchased scenery bytes were uploaded, independently checksum-verified, inspected, normalized, or approved in this environment
- Independent server-side SHA-256 of stored R2 objects is unavailable in this serverless environment
- Blender 4.2 was not available and was not executed
- Intake UI and multipart session workflow are connection-ready when R2 credentials are absent
- Checkpoint TIVVLEJOY_SCENERY_ASSET_INTAKE_PREVIEW_V1 deploys Draft PR #45 as a Vercel Preview only
- Checkpoint TIVVLEJOY_SCENERY_PREVIEW_STORAGE_CONFIG sets Preview-only storage names on the `pip-and-goat` Vercel project, git-branch limited to `cursor/tivvlejoy-scenery-intake-preview-73f1`
- Draft PR #44 stayed open, draft, and unmerged
- Draft PR #45 stays open, draft, and unmerged
- Preview alias is the existing git-branch Vercel Preview for `cursor/tivvlejoy-scenery-intake-preview-73f1` (hostname omitted from git)
- Production Vercel env was not modified (`hiddenProductionEnvCount=0`, no production targets)
- Preview host now reports `storageConfiguration=configured`, `tokenConfigured=true`, prefix `tivvlejoy-assets`, and `bytesPath=client-to-signed-r2`
- `TIVVLEJOY_SCENERY_INTAKE_TOKEN` is a Vercel sensitive Preview env var; the value is not printed
- Checkpoint `TIVVLEJOY_SCENERY_PREVIEW_INTAKE_TOKEN_ROTATED` replaced that Preview-only, git-branch-limited variable in place with the identically named agent runtime secret
- Existing R2 Preview settings were not modified; Production was not modified (`hiddenProductionEnvCount=0`)
- Branch `cursor/tivvlejoy-scenery-intake-preview-73f1` was redeployed as `dpl_Btx59tpkKwLT7f57jnJ9tA2bD7uY` (READY, not production)
- Incorrect intake token returns 401 `INTAKE_UNAUTHORIZED`
- The rotated token authorizes a safe non-upload `query` of an unknown session (400 `UNKNOWN_SESSION`, `uploaded=false`)
- No credentials appeared in Preview HTML or JSON
- Purchased source object count on this Preview remains 0
- No purchased scenery bytes were uploaded, inspected, extracted, converted, normalized, or approved
- GET `/` and GET `/scenery` on the Preview returned 200
- Preview Only Scenery Asset Intake, four collection cards, multiple-file selection, the 27-file checklist, and “Upload does not mean asset approval” rendered with TivvleJoy wording
- Checkpoint TIVVLEJOY_SCENERY_ONE_TAP_UPLOAD_V1 adds a one-tap picker that matches exact inventory filenames across all four collections
- Pre-upload review lists matched, missing, unexpected, duplicate, and incorrect filenames plus sizes and collection totals
- Unexpected files are refused individually; valid matches stay eligible
- Purchased files were not present in this agent environment and were not uploaded
- Draft PR #44 and Draft PR #45 stay open, draft, and unmerged

## Tests / validation

- Focused welcoming-theme tests
- `pnpm validate:persist`
- `pnpm validate:studio-hardening`
- `pnpm validate:steps-9-16-closed`
- `pnpm validate:studio-completion`
- `pnpm validate:scenery`
- `pnpm validate:scenery-intake`
- `pnpm validate:scenery-intake-preview`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- Production frontend build
- This Preview pass: `pnpm test` 624/624 (40 files); typecheck pass; lint pass; web build pass; `validate:scenery` 15/15; `validate:scenery-intake` 16 tests + 14/14 script; `validate:scenery-intake-preview` 4 tests + 6/6 script; persist / studio-hardening / steps-9-16-closed / studio-completion 35 checks: pass
- One-tap pass: `pnpm test` 625/625 (40 files); typecheck pass; lint pass; web build pass; `validate:scenery` 15/15; `validate:scenery-intake` 17 tests + 15/15 script; `validate:scenery-intake-preview` 4 tests + 6/6 script; persist pass; studio-hardening pass; steps-9-16-closed pass; studio-completion 35/35
- Checkpoint TIVVLEJOY_SCENERY_PIPELINE_HARDENING_V1 adds recoverable multipart uploads, bounded large-file intake, complete 27-file validation, token/namespace hardening, duplicate identity cases, verification-before-inspection, non-executing inspection jobs, and redacted lifecycle events
- Draft PR #46 stays open, draft, and unmerged on `cursor/tivvlejoy-scenery-one-tap-upload-73f1`
- One-tap Preview deploy `dpl_8QhREWMqkfkQFVNdydnXka1q4h4o` is READY and not Production
- Incorrect token still returns 401 `INTAKE_UNAUTHORIZED`; rotated token authorizes a safe non-upload query
- Hardening Preview deploy `dpl_9QBsVLnpRDMVu1yjYFy1wS2vvF4j` is READY and not Production
- New git-branch-limited Preview env copies were created for `cursor/tivvlejoy-scenery-pipeline-hardening-73f1`; existing Preview R2 ids and Production were not modified
- Purchased source object count on the hardening Preview remains 0

## Protections

- Do not continue the paused Pip conversion.
- Do not modify Pip or Goat source files.
- Do not replace production-library character assets.
- Do not merge Draft PR #24, #26, #27, #28, #29, #30, #31, #32, #33, #34, #35, #36, #37, #38, #39, #40, #41, #42, #43, #44, #45, #46, or later stacked voice or scenery drafts.
- Do not declare final theatrical character binding.
- Do not use paid resources.
- `currentStage()` remains `DDP_STEPS_1_8`.
- `evaluateTheatricalGate().allowed` remains `false`.
