# TivvleJoy Blender execution readiness gate

Checkpoint: `TIVVLEJOY_BLENDER_EXECUTION_READINESS_GATE_V1`

Stacked on Draft PR #76 (`TIVVLEJOY_BLENDER_ASSEMBLY_DRIVER_DRYRUN_V1`).

This is a fail-closed admission controller. It answers whether an exact shot
assembly package is ready to be executed. It does **not** execute Blender,
evaluate generated Python, read commercial files, or contact a worker.

## Contract

`TIVVLEJOY_BLENDER_EXECUTION_READINESS_V1` records the hash chain, script
audit, asset/character/provenance summaries, worker and Blender compatibility,
`readinessState`, and `blockingReasons`.

`executionAuthorizationRequired=true` and `executionAuthorizationIssued=false`
always. `blenderExecuted`, `providerContacted`, `gpuLaunched`, and `paidCompute`
stay false.

There is no RUNNING, EXECUTING, or COMPLETED state.

## Hash chain and script audit

`TIVVLEJOY_ASSEMBLY_HASH_CHAIN_V1` requires exact
shot → assembly → plan → script hashes. Any mismatch is
`BLOCKED_HASH_MISMATCH`.

The PR #76 script audit is not weakened. Unsafe scripts are
`BLOCKED_SCRIPT_AUDIT`.

## Assets, purchased adapter, Botaniq

Required slots need exact id, version, sha256, approval, provenance, and
receipts. Filename-only approval is refused. `RESOLVED_RESTRICTED` is allowed
only when policy is explicit.

`TIVVLEJOY_PURCHASED_TOOL_SOURCE_RECEIPT_V1` is schema-only and does not import
PR #73. Stored/uploaded is not approved.

`TIVVLEJOY_BOTANIQ_EXECUTION_READINESS_V1` stays `executionReady=false`. A
Botaniq upload receipt alone cannot approve an asset. Geo-Scatter stays
disabled.

## Characters, materialization, worker

PIP and GOAT need exact character, rig, and animation receipts. The current
fixture reports `BLOCKED_MISSING_RIG` when those characters are visible.
Capabilities are required only for the planned shot. No rig measurements.

Commercial materialization is not performed. Synthetic refs are test-only.

Blender 4.2.x compatibility uses fixture metadata only. Worker identity must
be an immutable digest and commit. Tags `latest`, `stable`, and `production`
do not satisfy identity. Cost class stays `UNSELECTED`.

## Authorization and intent

`TIVVLEJOY_BLENDER_EXECUTION_AUTHORIZATION_V1` is always unissued. There is no
function that issues it.

`TIVVLEJOY_BLENDER_EXECUTION_INTENT_V1` is not an execution request. No
command, endpoint, subprocess args, or provider ID.

When every prerequisite passes, the state is
`READY_FOR_EXECUTION_AUTHORIZATION` and authorization remains false.

## EP012

All 11 shots evaluate. Planning/dry-run can remain valid. Real execution stays
blocked because production rigs and commercial vegetation are unresolved.
That is expected.

## Isolation

Does not modify Draft PRs #72 or #73, purchased-assets routes, R2 settings, or
the studio intake token.
