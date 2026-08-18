# TivvleJoy RunPod template create

Checkpoint: `TIVVLEJOY_RUNPOD_TEMPLATE_CREATE_V1`

This path may create **exactly one** private NVIDIA Pod template for the verified immutable worker image.

It must not create a Pod. Do not POST /v1/pods. It must not launch a GPU, delete a template, or store secrets on the template.

Helper: `scripts/cloud/tivvlejoy-runpod-template-create.mjs`  
Workflow: `.github/workflows/tivvlejoy-runpod-template-create.yml`  
Trigger: `push` to `cursor/tivvlejoy-runpod-template-create-73f1` only.

## Gate

Creation requires both:

- mode `create-template`
- exact phrase `CREATE_TIVVLEJOY_TEMPLATE_D791981A`

The phrase is not a secret. Wrong or missing phrase refuses the request and does not POST.

## Idempotency

Before POST, the helper `GET /v1/templates` and runs the compatibility rules, including the provenance-backed normalization for `rc8eyeqhn2`.

- 0 compatible and no intended name+image match → one `POST /v1/templates`
- 1 compatible → `ALREADY_READY`, zero POST
- intended name+image already exists but is not compatible → `CREATED_TEMPLATE_INCOMPATIBLE`, zero POST
- >1 compatible or >1 intended identity → `AMBIGUOUS_TEMPLATE_MATCH`, zero POST

A second run must not create a duplicate.

## Allowed mutation

The only allowed write is `POST /v1/templates`.

GET template list and GET template by ID remain allowed.

PATCH/DELETE templates, `POST /templates/{id}/update`, Pod mutations, GraphQL mutations, endpoint creation, and network-volume creation are refused.

## Volume fail-closed

The intended plan sends `volumeInGb: 0`. If RunPod rejects that value, the helper returns `TEMPLATE_VOLUME_CONFIGURATION_REJECTED` and does **not** silently substitute 20, 50, or another size.

## Uncertain POST

Timeouts, 408/409/429/5xx, missing IDs, and malformed success bodies are not treated as "nothing was created". The helper GETs the list and recovers by exact name plus exact image digest. It never retries POST.
