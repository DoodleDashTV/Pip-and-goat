# TivvleJoy Goat V6 paid execution report

Status: **OUTPUT_CONTRACT_FAILED** after one authorized CREATE.
Authorization: `TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V6`
Execution: `goat-v6-78f1b162-20260825`
HEAD at launch: `5e45c7a8627c6fcb209896036d4b851f4acb4699`
`goatProductionReady=false`. Human visual approval remains mandatory.

## Identity

| Field | Value |
| --- | --- |
| Branch | `cursor/tivvlejoy-goat-real-paid-execution-v6-73f1` |
| Draft PR | #110 OPEN / DRAFT / UNMERGED / NOT READY |
| Image | `sha256:78f1b16286b0ffc331a787d74297593fa98c455fb24fcecf48d5be5bdeec48b6` |
| Image-source commit | `db8658c835ccb0e5a3adc3201d7ba90e9aaeaa46` |
| Pod name | `tivvlejoy-goat-v6-78f1b162` |
| Pod ID | `ojs38egllebqnu` |
| Cloud / GPU | SECURE / NVIDIA GeForce RTX 4090 |
| CREATE requests | 1 |
| Retry / second CREATE | none |

## Preflight

`pnpm cloud:goat-v6:preflight` returned `LAUNCH_AUTHORIZED` with `remainingBlockers: []`.

- Registry digest, source commit, render-code SHA, render-asset SHA, Capability V2, DISPATCH_V6, V6 authorization, Blender 4.2.2, and `ddp.character.live.blender.runtime=true` matched.
- Locked Goat source: `269512136` bytes, SHA-256 `f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5`, ZIP_SAFE.
- Quote: $0.74/hr, predicted 180-minute cost $2.22, ceiling $3.00.
- Exact planned name pods: 0. Billable pods: 0.

## Launch

`pnpm cloud:goat-v6:launch` ran exactly once.

- CREATE entered at `2026-08-25T02:01:02.884Z` (ordinal 1).
- Authorization consumed before CREATE. Local and remote ledgers written.
- Worker became `WORKER_READY` at ~6.35 minutes.
- Terminal worker status: `COMPLETE` / `LIVE_DEPARTMENT_EXECUTED_AWAITING_VISUAL_APPROVAL` at `2026-08-25T02:25:14.169Z`.
- Runtime: 24.593 minutes. Estimated cost: $0.3033. Within $3.00 ceiling.

## What the worker did

The live department ran inside Blender 4.2.2 LTS and completed all 26 stages with `--execute`.

- `authorizedDownloadInvoked=1`, streamed, hashed while streaming, ZIP_SAFE.
- Observed source size and SHA-256 matched the locked Goat archive.
- Locked source was not overwritten. Production mutation count: 0.
- Working executed blend persisted: `CHAR_GOAT_001_working_executed.blend` (298,161,606 bytes).
- QA FBX persisted: `export_qa.fbx` (5,801,980 bytes).
- Three workbench stills persisted: `render_qa.png`, `render_qa_three_quarter.png`, `render_qa_side.png`.
- Gate: `BLOCKED` / `NOT_PRODUCTION_READY` with blockers `HUMAN_APPROVAL_REQUIRED`, `VISUAL_APPROVAL_REQUIRED`, `DEFORMATION_GATE_AWAITING_HUMAN_REVIEW`, `RENDER_QA_AWAITING_HUMAN_REVIEW`.

## Why the launcher failed closed

The worker completed live execution, but the V6 output contract failed `LIVE_DEPARTMENT_PROOF`. Required files were present (`missingFiles: []`). The persisted result did not include these exact proof fields:

- `department.executionRuntime === "BLENDER_BPY"`
- `department.parsed.realGoatSourceTested === true`
- `result.capability.liveDepartmentUsesBlenderRuntime === true`

Those keys are absent from the persisted `character-result` / `goat_live_department.json`. Adjacent live facts are present (`department.ok=true`, `stageCount=26`, `executeFlagPresent=true`, `parsed.blenderExecuted=true`, `authorizedDownloadInvoked=1`). The launcher still fail-closed because the named proof fields were missing.

No retry, restart, or replacement CREATE was performed.

## Cleanup

- Exact Pod terminated.
- `cleanup.confirmed=true`
- Exact-name pods remaining: 0
- Active / billable pods remaining: 0

## QA views for human review

The stills are 512×512 Blender workbench renders. They show a tan bipedal goat on a black void with a large untextured gray plane occupying much of the frame. The character is small in the frame. These stills do not constitute visual approval.

## Preserved evidence

- `artifacts/tivvlejoy-goat-paid-execution-v6/authorization.json`
- `artifacts/tivvlejoy-goat-paid-execution-v6/preflight.json`
- `artifacts/tivvlejoy-goat-paid-execution-v6/consumption-ledger.json`
- `artifacts/tivvlejoy-goat-paid-execution-v6/launch.json`
- `artifacts/tivvlejoy-goat-paid-execution-v6/final-report.json`
- `artifacts/tivvlejoy-goat-paid-execution-v6/qa/*`
- Remote prefix: `tivvlejoy-assets/characters/CHAR_GOAT_001/executions/goat-v6-78f1b162-20260825/`
- Remote ledger: `tivvlejoy-assets/characters/CHAR_GOAT_001/executions/goat-v6-78f1b162-20260825/launcher/consumption-ledger.json`

## Unchanged protections

- Source and Production were not modified.
- ElevenLabs was not contacted.
- Draft PR #110 remains OPEN / DRAFT / UNMERGED / NOT READY.
- `goatProductionReady=false`
- Human visual approval is still required.
