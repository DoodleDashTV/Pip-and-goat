# TivvleJoy RunPod worker startup-watchdog scope

Checkpoint: `TIVVLEJOY_RUNPOD_WORKER_STARTUP_WATCHDOG_FIX_V1`

`StartupWatchdog` owns BOOT only:

`PROCESS_STARTED` → `healthGate` → `WORKER_READY`

The authoritative successful transition is:

`startupWatchdog.reached('WORKER_READY')`

That cancels the timer. `milestone('WORKER_READY')` is a regression.

After `WORKER_READY`, the single-shot runtime/cost guard owns:

manifest load, asset download, Blender preflight, render, encode, upload, readback.

Paid-smoke `STARTUP_WATCHDOG_MS` is a genuine 5-minute startup budget, not the
20-minute render ceiling. Template `rc8eyeqhn2` and digest `d791981a…` remain
historical provenance for paid smoke attempt #1. They are not patched or deleted
here.

This PR does not create a Pod and does not authorize paid GPU spend.
