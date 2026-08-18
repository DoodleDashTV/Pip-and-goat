# TivvleJoy RunPod template readiness

Checkpoint: `TIVVLEJOY_RUNPOD_TEMPLATE_READINESS_V1`

This is a **read-only** audit of whether the RunPod account already has exactly one compatible private Pod template for the verified immutable TivvleJoy worker image.

Do **NOT** create, patch, or delete a RunPod template from this path.  
Do **NOT** create a Pod. Do **NOT** launch a GPU.

Helper: `scripts/cloud/tivvlejoy-runpod-template-readiness.mjs`  
Workflow: `.github/workflows/tivvlejoy-runpod-template-readiness.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-template-readiness-73f1` only.

## Authoritative image

The only acceptable `imageName` is the digest-pinned worker image recorded in `scripts/cloud/acceptance-1080p/common.ts`.

Mutable tags (`latest`, `production`, `stable`) and the superseded digest `8204d4bf…` are incompatible.

The image Dockerfile CMD is `["node", "./src/worker.js"]`. A compatible template must leave `dockerEntrypoint` and `dockerStartCmd` as `[]` so RunPod does not override that CMD. No shell wrapper, SSH, Jupyter, or web UI startup.

## Allowed network

- `GET /v1/templates`
- `GET /v1/templates/{templateId}`

Anything else is refused by the mutation tripwire, including:

- POST /v1/templates (must not POST)
- PATCH or DELETE `/v1/templates/*`
- POST / PATCH / DELETE `/v1/pods`
- GraphQL mutation

`RUNPOD_RENDER_TEMPLATE_ID` is launcher-only. It may appear in a sanitized audit summary. It must never be copied into Pod env, worker env, Blender env, FFmpeg env, a manifest, R2, or a render package.

## Audit paths

If `RUNPOD_RENDER_TEMPLATE_ID` is set, GET that ID only. A mismatch is `INCOMPATIBLE` or `NOT_FOUND`. There is no silent fallback.

If the ID is missing, GET the caller's templates and count compatible candidates:

- 0 → `TEMPLATE_REQUIRED`
- 1 → `TEMPLATE_CANDIDATE_FOUND`
- >1 → `AMBIGUOUS_TEMPLATE_MATCH` (stop; do not guess)

## Compatible template

- `imageName` = the verified immutable digest
- `category` = `NVIDIA`
- `isServerless` = false, or the field is absent and a trusted creation receipt proves `isServerless=false`
- `isPublic` = false, or the field is absent and a trusted creation receipt proves `isPublic=false`
- `dockerEntrypoint` = `[]`
- `dockerStartCmd` = `[]`
- `ports` = `[]`
- `env` = `{}`

Runtime worker credentials belong on the guarded Pod-create payload, not on a reusable template.

`PERSISTENT_VOLUME_REQUIRED = false`. The worker uses R2 for durable input/output. Default RunPod disk numbers are recorded, not used as a compatibility veto.

## Desired plan

If no compatible template exists, the helper prints a **non-mutating** plan:

- name: `TivvleJoy Blender Worker - d791981a`
- private NVIDIA Pod template
- empty env, ports, entrypoint, and start command
- `containerDiskInGb: 50`
- `volumeInGb: 0` (smallest no-persistent-volume request)

That plan must not POST.
