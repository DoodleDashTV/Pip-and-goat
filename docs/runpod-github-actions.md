# TivvleJoy RunPod GitHub Actions

Checkpoint: `TIVVLEJOY_RUNPOD_GITHUB_ACTIONS_V1`

This is a **manual-only** GitHub Actions safety foundation for later TivvleJoy RunPod rendering. It does not launch pods, start serverless jobs, or create, update, terminate, or delete RunPod resources.

Workflow: `.github/workflows/tivvlejoy-runpod.yml`  
Name: **TivvleJoy RunPod**  
Trigger: `workflow_dispatch` only. There is no `push`, `pull_request`, or `schedule` trigger.

## Modes

`validate` is the zero-cost default. It does not contact RunPod and does not consume paid resources. It only checks that the GitHub Actions secret is present and prints:

`RUNPOD_API_KEY secret is configured.`

`connectivity` performs a non-GPU authenticated identity request only. It records a sanitized PASS/FAIL result. The HTTP response body is discarded. It does not launch compute.

## Secret handling

`RUNPOD_API_KEY` must remain a GitHub Actions repository secret. The workflow reads it only as `${{ secrets.RUNPOD_API_KEY }}`. Do not put the value in source, `.env` files, workflow output, artifacts, logs, or commit messages.

## Paid GPU

Paid GPU execution is intentionally disabled. If `confirm_paid_gpu` is set to true, the workflow prints:

`Paid GPU execution is not enabled in this workflow.`

and exits without launching compute.

## How Justin can run it

1. Open GitHub → Pip-and-goat → Actions → TivvleJoy RunPod → Run workflow.
2. Select `validate` first.
3. Leave `confirm_paid_gpu` set to false.
4. After validate passes, `connectivity` may be used later as a non-GPU API check only.

Do not run this on Production settings. Do not expect this workflow to start a render.
