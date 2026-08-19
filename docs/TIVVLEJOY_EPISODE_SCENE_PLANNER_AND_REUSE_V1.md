# TivvleJoy episode scene planner and reuse

Checkpoint: `TIVVLEJOY_EPISODE_SCENE_PLANNER_AND_REUSE_V1`

Stacked on Draft PR #71 (`TIVVLEJOY_STORYBOOK_PREVIEW_VALIDATION_V1`).

This is a zero-cost planning layer: story beats become a deterministic episode
plan, shot packages, location blocks, and render-readiness handoff metadata.
It does not assemble Blender scenes, launch GPUs, or process commercial files.

The purchased-asset / iPhone upload workstream (Draft PRs #72 and #73) is a
separate stack and is not modified here.

## Episode plan

`TIVVLEJOY_EPISODE_SCENE_PLAN_V1` describes one episode before Blender
assembly. Primary output is 1080x1920, 9:16, 30 fps. Planning works without
Blender.

## Shot packages

`TIVVLEJOY_SHOT_PACKAGE_V1` binds each shot to a location preset, lighting
preset, camera template, unresolved character/rig versions, optional location
delta, `shotDependencySha256`, and a visual-approval receipt ref. Missing
asset versions stay `UNRESOLVED`. Hashes are never invented.

## Camera templates

Fourteen reusable 9:16 templates from establishing through over-shoulder.
Rig-dependent pixel measurements stay `UNRESOLVED`.

## Location reuse and deltas

Existing storybook location presets and `TIVVLEJOY_WORLD_GRAPH_V1` are reused,
not replaced. `TIVVLEJOY_LOCATION_BLOCK_V1` groups compatible shots for
production loads while story order stays the narrative sequence.
`TIVVLEJOY_LOCATION_DELTA_V1` stores episode-only dressing on an immutable
base location version.

## Continuity

Non-adjacent world jumps require `explicitTransition` or become a continuity
blocker. Adjacent hops such as bakery → forest exit pass.

## Change-aware rerender

Notes, labels, and unrelated shots do not change a shot hash. Camera,
lighting, visible geometry, materials, dressing, animation, story props,
environment version, location delta, and render-critical settings do.

## Visual gate and render handoff

Consumes `TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1` without weakening score >= 90
and zero hard blockers. Stale dependency hashes are
`BLOCKED_APPROVAL_STALE`. Fixture reviewer mode cannot become production
human approval.

The handoff fixture lists fields later needed by
`TIVVLEJOY_RENDER_BACKEND_READINESS_V1` and always reports
`gpuLaunched=false`, `paidCompute=false`, `providerContacted=false`,
`launchAuthorized=false`, `paidAuthorizationRequired=true`.

## Sample

Synthetic EP012 “The Bakery Map” is about 60 seconds, 11 shots, bakery plus
forest exit, morning and day lighting, Pip/Goat/two-shot/prop/establishing/
reaction coverage. No new Pip/Goat canon.
