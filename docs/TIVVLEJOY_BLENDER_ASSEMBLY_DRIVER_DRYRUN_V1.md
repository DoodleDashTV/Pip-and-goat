# TivvleJoy Blender assembly driver dry run

Checkpoint: `TIVVLEJOY_BLENDER_ASSEMBLY_DRIVER_DRYRUN_V1`

Stacked on Draft PR #75 (`TIVVLEJOY_SHOT_ASSEMBLY_MANIFEST_V1`).

This layer converts a shot assembly manifest into a deterministic Blender
assembly plan, an ordered operation graph, generated Blender Python **text**,
a static script audit, and a TypeScript dry-run receipt.

It does **not** execute Blender, import bpy, spawn a subprocess, read
commercial files, or contact RunPod.

## Safety labels

- DRY RUN ONLY
- BLENDER NOT EXECUTED
- COMMERCIAL ASSETS NOT READ
- BOTANIQ NOT PROCESSED
- GPU NOT USED
- EXECUTION AUTHORIZED = FALSE
- DO NOT EXECUTE WITHOUT A VALID EXECUTION AUTHORIZATION RECEIPT

## Plan and operations

`TIVVLEJOY_BLENDER_ASSEMBLY_PLAN_V1` hashes the same way every time for the
same manifest. Notes and display labels are excluded.

`TIVVLEJOY_BLENDER_OPERATION_GRAPH_V1` uses explicit stages 001–150. Required
unresolved dependencies are recorded as blocked operations. Nothing is skipped
silently.

## Script, audit, and source immutability

`TIVVLEJOY_BLENDER_SCRIPT_V1` is generated text around future `bpy` calls.
Sources stay immutable. Future work may link, append, instance, or
duplicate-for-derivative. It must never open, modify, or save over purchased
bytes.

`TIVVLEJOY_BLENDER_SCRIPT_AUDIT_V1` rejects subprocess, `os.system`, network
clients, secrets, signed URLs, and source overwrite. A failed audit blocks
future execution.

## Interfaces only

`TIVVLEJOY_ASSET_RESOLVER_V1` returns RESOLVED / UNRESOLVED / BLOCKED.
`localMaterializationRef` is `UNRESOLVED` or `SYNTHETIC://…` only.

`TIVVLEJOY_BOTANIQ_ASSET_PROVIDER_V1` is `NOT_ACTIVATED`. Botaniq is not read,
inspected, or queried. Geo-Scatter stays false.

PIP and GOAT stay `INSTANCE_CHARACTER` /
`BLOCKED_UNRESOLVED_PRODUCTION_RIG` until approved character, rig, animation,
version, and hash receipts exist.

## Camera, lighting, collections, metadata

Camera ops consume `TIVVLEJOY_CAMERA_BINDING_V1` and leave Pip/Goat framing
unresolved. Lighting ops consume `TIVVLEJOY_LIGHTING_BINDING_V1` with
`pluginDependency=NONE`. Collection names follow PR #75. Custom properties
use `tj_*` keys and never store secrets.

## Idempotency and simulation

`TIVVLEJOY_ASSEMBLY_IDEMPOTENCY_V1` modes are planned only:
CREATE_IF_MISSING, VERIFY_EXISTING, REPLACE_DERIVATIVE_INSTANCE,
REFUSE_SOURCE_OVERWRITE.

`TIVVLEJOY_ASSEMBLY_SIMULATION_RECEIPT_V1` is a pure TypeScript walk of the
operation graph. EP012 is expected to be
`DRY_RUN_VALID_WITH_UNRESOLVED_ASSETS`.

## Authorization

`TIVVLEJOY_BLENDER_ASSEMBLY_AUTHORIZATION_V1` is always `issued=false`,
`allowCommercialSources=false`, `allowCharacterAssets=false`. There is no
function that sets `issued=true`.

`TIVVLEJOY_BLENDER_ASSEMBLY_EXECUTION_REQUEST_V1` has no command field and no
subprocess args.

## Isolation

Does not modify Draft PRs #72 or #73, purchased-assets routes, R2
configuration, or the studio intake token.
