# TivvleJoy world builder and scenery automation

Checkpoint: `TIVVLEJOY_WORLD_BUILDER_AND_SCENERY_AUTOMATION_V1`

Stacked on Draft PR #77.

This is a software / planning / dry-run layer. It turns the existing
storybook environment rules, world graph, episode planner, and assembly
contracts into a reusable environment system. It does **not** execute
Blender or read commercial bytes.

## SCENERY PURCHASE REQUIRED

Default: **NO**

A purchase is suggested only when a concrete story requirement cannot be
met by the existing library, native Blender, procedural generation, reuse,
kitbash, or approved derivatives.

## What this adds

- `TIVVLEJOY_WORLD_BUILDER_V1` and `TIVVLEJOY_ENVIRONMENT_BLUEPRINT_V1`
- 7 existing locations plus 42 expandable archetypes
- Deterministic terrain, path, vegetation, season, weather, and time recipes
- Interiors, kitbash, background worlds, water, story dressing
- Camera-aware dressing that never randomly moves story props
- Coverage, no-buy gap decisions, variety engine, reuse graph
- 30 synthetic environment recipes
- Episode environment director and 60-episode scale metrics
- Shot-assembly adapter and change-aware invalidation
- Preview page `/world-builder`

Botaniq stays `NOT_ACTIVATED`. Geo-Scatter stays `NOT_INTEGRATED`.
Gaffer and Physical Starlight stay optional and unused. Native Blender is
the baseline.

## Isolation

Does not modify Draft PRs #72 or #73 or the purchased-assets workstream.
