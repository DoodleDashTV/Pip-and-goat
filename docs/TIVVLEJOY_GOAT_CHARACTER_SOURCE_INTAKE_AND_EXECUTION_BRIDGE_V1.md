# TIVVLEJOY_GOAT_CHARACTER_SOURCE_INTAKE_AND_EXECUTION_BRIDGE_V1

Preview-only bridge from `Goat_FINN.zip` to the existing Character Rigging & Animation Department.

This does **not** rebuild the 26-stage pipeline. It does **not** make Goat production-ready.

## One operator action

On `/character-rigging`:

1. Choose `Goat_FINN.zip`
2. Tap **Upload Goat Source**

TivvleJoy then hashes, uploads through signed private R2 multipart URLs, verifies, and locks SOURCE.

On the public Preview host, the existing scenery studio session token is required in the same `x-tivvlejoy-scenery-intake-token` header already used by scenery intake. The value is never printed. Production stays refused.

## 35% session-open stall

Checkpoint: `TIVVLEJOY_GOAT_SOURCE_UPLOAD_35_PERCENT_BLOCKER_FIX_V1`

Hashing the 257 MiB ZIP reports progress up to 35%, then the browser opens a session. If the studio token is missing from the approved header, or does not match, session-open fails with `INTAKE_UNAUTHORIZED`. The UI must show that code and stop, not remain on "Opening upload session".

Goat intake reuses the authenticated asset-intake primitive. It does not make the endpoint public. Scenery intake messages stay on the scenery routes.

## Preview storage configuration

Checkpoint: `TIVVLEJOY_GOAT_SOURCE_INTAKE_PREVIEW_STORAGE_CONFIG`

These names are set on the Vercel `pip-and-goat` project for **Preview only**, git-branch limited to `cursor/tivvlejoy-goat-character-source-intake-73f1`. Production was not modified (`hiddenProductionEnvCount=0`).

- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `TIVVLEJOY_SCENERY_ASSET_PREFIX=tivvlejoy-assets`
- `TIVVLEJOY_SCENERY_INTAKE_TOKEN` (server-only, not printed)

Verified after Preview storage-config redeploy `dpl_Hg7dpPYUufN8bj1fF5pChnwm2kYr` (READY, not Production):

- `/character-rigging` returns 200
- `/api/character-source-intake` reports `storage.state=configured`, prefix `tivvlejoy-assets`, `tokenConfigured=true`, `goatProductionReady=false`
- Missing or wrong intake token returns 401 `INTAKE_UNAUTHORIZED`
- No credentials appear in Preview HTML or JSON
- Hostname omitted from git

## Exact R2 object key

`tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.zip`

Receipt sidecar (hashes / provenance only, no credentials, no ZIP bytes):

`tivvlejoy-assets/characters/CHAR_GOAT_001/source/Goat_FINN.receipt.json`

Interrupted multipart session metadata:

`tivvlejoy-assets/characters/CHAR_GOAT_001/source/sessions/<sessionId>.json`

Same existing Cloudflare R2 bucket / credentials / prefix family as scenery intake (`tivvlejoy-assets/`). Character source lives under `characters/CHAR_GOAT_001/` so scenery collection keys stay untouched.

If Preview serverless memory recycles, status rediscovers the locked object by HEAD + receipt sidecar. A matching stored object is reused. A wrong-size object at the locked key fails closed and is never overwritten.

## Locked identity

- Filename: `Goat_FINN.zip`
- Size: `269512136` bytes
- SHA-256: `f5e85122f5af476e07df58c884b16a9663e05aaeef668f4d218fb7a410162ea5`

Any other file fails closed. SOURCE_INTAKE does not advance.

## Copies

| Copy | Path | Rule |
| --- | --- | --- |
| R2 SOURCE | object key above | Immutable after hash lock |
| Local SOURCE | `production-library/characters/goat/SOURCE/Goat_FINN.zip` | Worker materialization target. Not a Git binary. |
| WORKING | `production-library/characters/goat/WORKING/goat_working_4_2_2.blend` | Conversion copy only. Never overwrite SOURCE. |
| PRODUCTION | existing department master path | Locked until CHARACTER_MASTER_GATE |

Blender 4.3 → 4.2.2 is **not claimed**. If 4.2.2 cannot safely open the 4.3 source, conversion fails closed. FBX is interchange only and is never treated as the Blender master.

## Paid execution

Checkpoint: `TIVVLEJOY_GOAT_REAL_PAID_EXECUTION_AUTHORIZATION_V1`

Explicit one-launch authorization was received and evaluated `FAIL_CLOSED_DO_NOT_LAUNCH`. Launch count remains 0. Cost remains $0. `goatProductionReady` remains false.

Do not launch unless every condition is true:

- `RUNPOD_WORKER_IMAGE` is a positively resolved immutable `ghcr.io` `@sha256` pin
- that image bakes `CHARACTER_SOURCE_MATERIALIZE` plus the existing 26-stage department
- GPU is SECURE `NVIDIA GeForce RTX 4090`
- predicted 180-minute cost is at or under $3.00
- single-launch, startup watchdog, cleanup/delete, and paid-mutation tripwire stay intact

The checkout 1080p pin (`sha256:8204d4bf…`) is stale and must not be substituted. The current TivvleJoy render pin (`sha256:b53fcbf5…` from `1ea2cf58`) is a FINAL_1080P worker, not a Goat department worker.

Live preflight (no Pod created): locked R2 Goat hash matched, ZIP_SAFE, SECURE RTX 4090 quoted $0.74/hr, zero billable pods. Evidence: `artifacts/tivvlejoy-goat-paid-execution/`.

## Git

`Goat_FINN.zip` must never enter ordinary Git history. Git stores hashes, receipts, manifests, and the object key only.
