# TivvleJoy deterministic shot assembly manifest

Checkpoint: `TIVVLEJOY_SHOT_ASSEMBLY_MANIFEST_V1`

Stacked on Draft PR #74 (`TIVVLEJOY_EPISODE_SCENE_PLANNER_AND_REUSE_V1`).

This is a zero-cost planning layer. It turns an episode scene plan into
deterministic shot-assembly manifests, location instances, camera/lighting
bindings, a dependency graph, and a change-impact report. It does **not**
execute Blender, process Botaniq, launch GPU compute, or touch the purchased-
assets upload workstream (Draft PRs #72 and #73).

Labels that stay true for this milestone:

- PLANNING ONLY
- NO BLENDER EXECUTION
- NO BOTANIQ PROCESSING
- NO PAID GPU

## Shot assembly manifest

`TIVVLEJOY_SHOT_ASSEMBLY_MANIFEST_V1` is the machine-readable contract for one
planned shot. It binds:

- `manifestVersion`, `shotId`, `episodeId`, `episodeVersion`
- `shotDependencySha256` from the planner
- location preset / environment version / block / delta / `sourceReceiptRefs`
- camera and lighting bindings
- character, story-prop, and environment slots
- dressing seed plus base/delta refs
- render profile, 1080x1920, 9:16, 30 fps
- `assemblyStatus`, `unresolvedDependencies`, `hardBlockers`
- `assemblyDependencySha256`

Missing receipts stay `UNRESOLVED`. No invented commercial hashes. Notes are
excluded from the assembly hash.

## Character slots

`TIVVLEJOY_CHARACTER_ASSEMBLY_SLOT_V1` supports PIP and GOAT. Asset, rig,
animation, and transform fields stay `UNRESOLVED_PRODUCTION_RIG` unless a real
approved receipt already exists. This branch has none, so both characters stay
unresolved. Planning can still emit a synthetic manifest. Real character
assembly cannot.

## Environment slots

`TIVVLEJOY_ENVIRONMENT_ASSET_SLOT_V1` uses explicit semantic roles
(`BUILDING_HERO`, `TREE_BACKGROUND`, `GRASS`, `FLOWERS`, `PATH`, `SKY`,
`SIGNAGE`, and the rest). Resolution states are explicit:

- `RESOLVED_APPROVED` / `RESOLVED_RESTRICTED`
- `UNRESOLVED_SOURCE` / `UNRESOLVED_VERSION` / `UNRESOLVED_HASH` / `UNRESOLVED_PROVENANCE`
- `BLOCKED_QUARANTINED` / `BLOCKED_UNAPPROVED` / `BLOCKED_HASH_MISMATCH` / `BLOCKED_VERSION_MISMATCH`

No silent fallback. No "latest". No filename substitution.

Vegetation may declare `providerPreference=BOTANIQ_IF_APPROVED`. Botaniq stays
unresolved until a valid private receipt exists. Native Blender is the default.
`GEO_SCATTER_STATUS=OPTIONAL_NOT_INTEGRATED`. No error implies Botaniq is
required.

## Collection plan and naming

Intended Blender collection tree only. No `.blend` file is created.

```
TJ_SHOT_<SHOT_ID>
  CAMERAS
  CHARACTERS / PIP / GOAT
  ENVIRONMENT / ARCHITECTURE / VEGETATION / GROUND / BACKGROUND
  STORY_PROPS
  DRESSING
  LIGHTS
  FX
  VALIDATION
```

Scene instance names are deterministic (`TJ_<SHOT>_CAM_MAIN`,
`TJ_<SHOT>_CHAR_PIP`, `TJ_<SHOT>_ENV_<ROLE>_<INDEX>`, lights). Source assets
are never renamed destructively.

## Assembly order

Stages 01–15 run in order. An unresolved required dependency stops at the
matching stage. There is no automatic skip.

`CAMERA_RIG_MEASUREMENT_UNRESOLVED` may remain during PLANNING. It blocks
`REAL_CHARACTER_ASSEMBLY`.

## Location instances

`TIVVLEJOY_LOCATION_INSTANCE_V1` reuses `TIVVLEJOY_LOCATION_BLOCK_V1` and
`TIVVLEJOY_LOCATION_DELTA_V1`. `sourceImmutable=true`. Multiple shots instance
the same bakery or forest-exit base without duplicating the source. A location
delta never mutates the base.

## Camera and lighting bindings

`TIVVLEJOY_CAMERA_BINDING_V1` consumes the 14 planner camera templates.
Planned transform, lens, and Pip/Goat pixel measurements stay `UNRESOLVED`.

`TIVVLEJOY_LIGHTING_BINDING_V1` consumes existing TivvleJoy lighting presets.
`pluginDependency=NONE`. Gaffer and Physical Starlight are
`OPTIONAL_PROVIDER_NOT_ACTIVATED`. Native Blender is the fallback.

## Story-prop continuity

`TIVVLEJOY_STORY_PROP_CONTINUITY_V1` tracks `MAP_PROP_001` across SH003, SH004,
SH007, and SH010. Changing the map state invalidates the changed shot and
downstream continuity-dependent shots only.

## Dependency graph and change impact

`TIVVLEJOY_SHOT_DEPENDENCY_GRAPH_V1` records direct dependencies and
downstream dependents for shot, location, delta, camera, lighting, characters,
animation refs, story props, environment slots, and visual approval.

`TIVVLEJOY_CHANGE_IMPACT_REPORT_V1` compares previous and new graphs and
returns unchanged / preview-rerender / final-rerender / stale-approval /
unresolved shot lists plus `reasonsByShot`. It uses the PR #74
`evaluateRerender` states.

Examples:

- one background tree does not invalidate unrelated locations
- bakery base version change invalidates bakery-dependent shots
- Goat rig version change invalidates Goat shots only
- Pip dialogue text alone does not invalidate imagery unless animation/voice
  timing changes
- map visible-state change invalidates continuity-dependent shots

## EP012 fixture

Synthetic “The Bakery Map” produces 11 manifests. Planning can fully resolve.
`READY_FOR_REAL_ASSEMBLY` is unreachable from synthetic fixtures. Commercial
vegetation remains unresolved. Character production rigs remain unresolved.

Efficiency: 11 shots, 2 location instances, 2 base environment loads, 9 reused
instances. The bakery is not rebuilt eleven times.

## Blender execution contract

`TIVVLEJOY_BLENDER_ASSEMBLY_REQUEST_V1` is definition only:

- `dryRun=true`
- `allowCommercialSources=false`
- `allowCharacterAssets=false`
- `executionAuthorized=false`

No subprocess. No Blender command. No worker call.

## Render readiness bridge

Schema-only handoff compatible with later readiness:

- `paidAuthorizationRequired=true`
- `providerContacted=false`
- `gpuLaunched=false`
- `paidCompute=false`
- `launchAuthorized=false`

RunPod history is not merged.

## Isolation

Does not modify:

- `apps/web/src/app/purchased-assets/`
- `apps/web/src/app/api/purchased-tools/`
- `apps/web/src/components/preview/PurchasedToolsIphoneIntake.tsx`
- `apps/web/src/lib/purchased-tools/`
- R2 credentials, bucket configuration, intake token, or multipart sessions
- Draft PR #72 or Draft PR #73
