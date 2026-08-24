# TIVVLEJOY_GOAT_CHARACTER_SOURCE_INTAKE_AND_EXECUTION_BRIDGE_V1

Preview-only bridge from `Goat_FINN.zip` to the existing Character Rigging & Animation Department.

This does **not** rebuild the 26-stage pipeline. It does **not** make Goat production-ready.

## One operator action

On `/character-rigging`:

1. Choose `Goat_FINN.zip`
2. Tap **Upload Goat Source**

TivvleJoy then hashes, uploads through signed private R2 multipart URLs, verifies, and locks SOURCE.

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

This increment is dry-run only. RunPod is not launched. Future paid materialization still requires the existing paid-execution authorization gate, SECURE GPU, cost estimation, cleanup, single-launch protection, and watchdogs.

## Git

`Goat_FINN.zip` must never enter ordinary Git history. Git stores hashes, receipts, manifests, and the object key only.
