# TivvleJoy RunPod template normalization

Checkpoint: `TIVVLEJOY_RUNPOD_TEMPLATE_NORMALIZATION_V1`

This path classifies the already-created template `rc8eyeqhn2` using a **narrow semantic-normalization and provenance layer**.

It does **not** create another template.  
Do not POST /v1/templates.  
Do not PATCH the existing template.  
Do not DELETE the existing template.  
Do not POST /v1/pods.  
Do not launch a GPU.

Helper: `scripts/cloud/tivvlejoy-runpod-template-normalization.mjs`  
Receipt: `scripts/cloud/tivvlejoy-runpod-template-creation-receipt.mjs`  
Workflow: `.github/workflows/tivvlejoy-runpod-template-normalization.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-template-normalization-73f1` only.

## Why this exists

The guarded create request for `rc8eyeqhn2` was accepted with HTTP 201 and sent:

- `isPublic=false`
- `isServerless=false`
- `dockerEntrypoint=[]`
- `dockerStartCmd=[]`
- `ports=[]`
- `env={}`
- `containerDiskInGb=50`
- `volumeInGb=0`
- `volumeMountPath=""`

RunPod's later GET representation omitted several of those fields and returned `volumeMountPath=/workspace` plus service defaults `startSsh=true` and `startJupyter=true`.

The strict PR #57 assessor still treats a missing boolean as not-false. This layer may fill omitted fields **only** when a sanitized trusted creation receipt proves the values that were posted.

Do not treat missing booleans as false globally.

## Provenance

The trusted creation receipt is sanitized and safe to commit. It contains only:

- template ID `rc8eyeqhn2`
- expected template name
- immutable image digest
- create HTTP status `201`
- requested `isPublic=false`
- requested `isServerless=false`
- requested `volumeInGb=0`
- requested `volumeMountPath=""`
- requested empty env / ports / entrypoint / start command
- `containerDiskInGb=50`
- a deterministic hash of that sanitized create payload

It never contains `RUNPOD_API_KEY`, Authorization headers, R2 credentials, GitHub tokens, Vercel tokens, or any other secret.

## Normalization eligibility

A missing or defaulted GET field may be normalized only when **all** of the following are true:

- template ID is present
- name exactly matches `TivvleJoy Blender Worker - d791981a`
- `imageName` exactly matches the immutable required digest
- `category` is `NVIDIA`
- no unexpected environment keys exist
- no unexpected exposed ports exist
- no Docker entrypoint override exists
- no Docker start-command override exists
- `containerDiskInGb` is exactly `50`
- the template matches the sanitized trusted creation receipt

## Normalization rules

- `isPublic === false`, or the field is absent and the receipt proves `isPublic=false`
- `isServerless === false`, or the field is absent and the receipt proves `isServerless=false`
- `volumeInGb === 0`, or `volumeInGb` is absent and the receipt proves `volumeInGb=0`
- `volumeMountPath=/workspace` must not by itself imply a persistent volume
- `PERSISTENT_VOLUME_REQUIRED` remains `false`
- omitted `dockerEntrypoint`, `dockerStartCmd`, and `ports` may normalize to `[]`
- omitted `env` may normalize to `{}`

## Service defaults

`startSsh=true` and `startJupyter=true` are recorded as RunPod-default observations when:

- they were not part of the create payload
- there are no corresponding exposed ports
- there is no Docker entrypoint or start-command override launching SSH/Jupyter
- no Pod is being launched

They are not silently erased. They become unsafe when combined with exposed SSH/Jupyter/web ports or a startup command that launches those services.

## Still fail

The compatibility validator still fails for:

- wrong image
- mutable image tag
- wrong category
- explicit `isPublic=true`
- explicit `isServerless=true`
- non-empty template env
- forbidden env key
- non-empty ports
- SSH / Jupyter / web UI exposed ports
- non-empty entrypoint
- non-empty Docker start command
- shell wrappers
- unexpected persistent-volume settings that cannot be proven equivalent
- malformed responses
- ambiguous duplicate identity matches
- missing fields without trusted provenance

## Allowed network

- `GET /v1/templates`
- `GET /v1/templates/rc8eyeqhn2`

Success is `TEMPLATE_READY` only when both the list audit and the detail GET prove that `rc8eyeqhn2` is equivalent to the guarded requested configuration.

Do **not** configure `RUNPOD_RENDER_TEMPLATE_ID` from this path.
