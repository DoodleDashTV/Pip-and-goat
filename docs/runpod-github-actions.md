# TivvleJoy RunPod GitHub Actions

Checkpoint: `TIVVLEJOY_RUNPOD_GUARDED_RENDER_LAUNCH_V1`

This is a **manual-only** GitHub Actions path for TivvleJoy RunPod work. It can plan a GPU launch and, only after explicit paid approval plus every safety gate, create exactly one RunPod Pod. Accidental paid compute must remain impossible.

Workflow: `.github/workflows/tivvlejoy-runpod.yml`  
Name: **TivvleJoy RunPod**  
Trigger: `workflow_dispatch` only. There is no `push`, `pull_request`, `schedule`, `workflow_run`, or `repository_dispatch` trigger.

Helper: `scripts/cloud/tivvlejoy-guarded-render.mjs`

## Modes

### `validate`

Zero-cost local configuration validation.

It does not contact RunPod and does not consume paid resources. It only checks that the GitHub Actions secret is present and prints:

`RUNPOD_API_KEY secret is configured.`

### `connectivity`

Authenticated API check, no GPU.

It performs a non-GPU identity request only (`{ myself { id } }`). It records a sanitized PASS/FAIL result. The HTTP response body is discarded. It does not launch compute.

### `render_plan`

Live price and availability preflight, no GPU.

This mode authenticates, queries current `NVIDIA GeForce RTX 4090` Secure Cloud uninterruptible hourly price and stock for GPU count 1, calculates the maximum projected compute charge from the runtime cap, and prints a sanitized PASS/REFUSE plan. It never creates or modifies a RunPod resource.

`RUNPOD_RENDER_TEMPLATE_ID` is not required for `render_plan`.

### `render_launch`

Paid GPU-capable mode. It still refuses unless every gate below passes.

`render_plan` safety checks run immediately before any create call. If they fail, no Pod is created.

A complete remotely executable TivvleJoy scene command is **not** invoked from this workflow yet. After a successful create, the job records the Pod ID, marks scene execution as the next integration boundary, and automatically stops/deletes the Pod. Do not treat a successful launch as a finished render.

## Explicit paid approval

`render_launch` requires **all** of the following:

1. `confirm_paid_gpu` = `true`
2. `paid_approval_phrase` exactly equal to:

`LAUNCH_TIVVLEJOY_GPU`

3. Immediate `render_plan` PASS (price, stock, GPU count, parseable responses)
4. Repository secret `RUNPOD_RENDER_TEMPLATE_ID` configured

If `confirm_paid_gpu` is true in `validate`, `connectivity`, or `render_plan`, the workflow refuses paid launch in that mode and does not create a Pod.

## Hard refusal thresholds

These are hard refusal thresholds, not spending targets.

| Pin / cap | Value |
| --- | --- |
| GPU | `NVIDIA GeForce RTX 4090` |
| Cloud | Secure Cloud (`SECURE`) |
| GPU count | 1 |
| Interruptible | false |
| Maximum hourly price | `$0.75` |
| Maximum runtime | `20` minutes |
| Maximum projected compute charge | `$0.25` |

Projected compute cost is:

`hourly_price × runtime_minutes / 60`

The comparison uses exact / decimal-safe arithmetic and never rounds a price downward. The workflow refuses launch if:

- hourly price > `$0.75`
- calculated maximum compute cost > `$0.25`
- RTX 4090 Secure stock is unavailable
- GPU count 1 is unavailable
- price cannot be verified
- an API response cannot be parsed
- a required input is missing
- any safety check is ambiguous

There is no silent fallback to a more expensive GPU.

## Automatic shutdown

GitHub job timeout is `25` minutes so cleanup can still run after the 20-minute Pod runtime cap.

Once a Pod is successfully created:

- the Pod ID is persisted immediately
- an `EXIT` trap runs cleanup
- a GitHub Actions `if: always()` step also runs cleanup
- the Pod is deleted after success, after failure, and if a later render command exits nonzero
- cleanup is idempotent (`204` / `200` / `404` all confirm the resource is gone)

Prefer termination/deletion after the lifecycle completes. Do not leave a GPU running after the job. Do not rely on a human to shut it down.

If cleanup cannot be confirmed, the workflow is marked **FAILED** and prints:

`RUNPOD CLEANUP REQUIRES ATTENTION`

plus only the Pod ID needed to locate the resource. A cleanup failure is never hidden behind an earlier render failure.

## Secret handling

`RUNPOD_API_KEY` must remain a GitHub Actions repository secret. The workflow reads it only as `${{ secrets.RUNPOD_API_KEY }}`.

`RUNPOD_RENDER_TEMPLATE_ID` is also a repository secret. The workflow reads it only as `${{ secrets.RUNPOD_RENDER_TEMPLATE_ID }}`.

If the template secret is absent:

- `validate` and `connectivity` continue to work
- `render_plan` may still price and check the GPU
- `render_launch` must refuse and explain that `RUNPOD_RENDER_TEMPLATE_ID` is not configured

Do not put secret values in source, `.env` files, workflow output, artifacts, logs, or commit messages. Do not print authorization headers, raw API bodies, or the template ID.

## How Justin can run it

1. Open GitHub → Pip-and-goat → Actions → TivvleJoy RunPod → Run workflow.
2. Select `validate` first. Leave `confirm_paid_gpu` false and the approval phrase empty.
3. After validate passes, `connectivity` may be used as a non-GPU API check only.
4. `render_plan` may be used to print a live RTX 4090 Secure price/availability plan. It still creates nothing.
5. `render_launch` is the only paid-capable mode. It requires `confirm_paid_gpu`, the exact phrase `LAUNCH_TIVVLEJOY_GPU`, a configured template secret, and a PASS plan. This Cursor task must not run that mode.

Do not run this on Production settings. Do not expect this workflow to finish a theatrical scene render until the next integration lands a remote worker command.
