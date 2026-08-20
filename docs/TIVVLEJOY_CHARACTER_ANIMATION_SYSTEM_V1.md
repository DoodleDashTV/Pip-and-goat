# TIVVLEJOY_CHARACTER_ANIMATION_SYSTEM_V1

Software layer between **script / voice / story beats** and **future Blender character animation assembly**.

This increment does **not** admit real Pip or Goat production rigs. It does not execute Blender, mutate character geometry, synthesize paid voices, or approve animation.

## What this is

A complete planning, admission, continuity, QC, cache, and batching contract so that when Michael returns the real rigs, TivvleJoy can:

- admit exact rig versions by hash, not filename
- validate required semantic controls
- map story actions to capability families
- plan acting, gaze, blinks, visemes, locomotion, and props
- generate deterministic shot animation manifests
- stale only the animation that actually depends on a change

## What this is not

- A substitute production rig
- Auto-approval of synthetic fixtures
- Executed animation data
- Accurate lip sync without phoneme receipts
- A claim that the studio is `PRODUCTION_READY`

## Current studio readiness

`WAITING_FOR_CHARACTER_RIGS`

The software layer itself is `CHARACTER_ANIMATION_PIPELINE_OPERATIONAL`.

## Operator surface

`/animation-control` plus a link from `/production-control`.

Friendly status example: **Waiting for approved Pip production rig**.

## Safety

`blenderExecuted=false`, `pipGeometryMutated=false`, `goatGeometryMutated=false`, `productionRigModified=false`, `voiceIdentityMutated=false`, `commercialBytesRead=false`, `runPodMutation=false`, `gpuLaunched=false`, `paidComputeUsd=0`, `productionMutation=false`.
