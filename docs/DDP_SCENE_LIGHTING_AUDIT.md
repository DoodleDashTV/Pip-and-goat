# DDP Scene Lighting & Assembly Audit

**Agent:** Side Agent 2 — Lighting & Scene Assembly  
**Base commit:** `75fc73a711a4a1680b6220b8a149a1edc96c10a1` (`cursor/canonical-ddp-baseline-ba2f`)  
**Branch:** `agent/lighting-repair`  
**Protected main agent:** DoodleDash Production (`cursor/setup-dev-environment-ba2f`) — not modified  

## Scope

Repair and validate:

1. lighting arbitration  
2. manifest lighting behavior  
3. scene assembly  
4. asset hierarchy  
5. MapMark placement integrity  
6. duplicate camera/light prevention  

Out of scope: character rigging, animation implementation, cloud infrastructure, paid GPU, production R2 writes.

## Findings (pre-fix)

### 1. Stacked lights from appended blends (washed-out scene)

Founding library assets embed their own lights/cameras (`scripts/assets/build_founding_library.py`):

| Asset | Lights | Cameras |
| --- | --- | --- |
| `pip_production.blend` | SUN + AREA (2) | RefCam |
| `goat_production.blend` | SUN + 2×AREA (3) | RefCam |
| `meadow_production.blend` | SUN + AREA (2) | MeadowCam |
| `adventure_map.blend` | 0 | 0 |

`assemble_scene.append_object` / `persistent_daemon.append_blend` import **all** objects. Across the four founding blends this yields **~7 lights** and **~3 cameras** in one assembly — matching the observed “~8 lights / washed out” failure mode.

### 2. `ensure_lights` / `ensure_sky` did not own lighting

`scripts/blender/assemble_scene.py` previously:

```python
if any(o.type == "LIGHT" for o in bpy.data.objects):
    return
```

So when asset lights were present, assembly **kept every imported light** and never installed a controlled key/fill rig. `persistent_daemon.ensure_sky` had the same early-return pattern (and only added a SUN when empty).

### 3. `manifest.lightingState` was not consumed

- Cloud manifests carry `lightingState` (`packages/production`, worker `manifest.js`, acceptance preflight uses `{ preset: 'MEADOW_DAY_SOFT' }`).
- `workers/runpod-blender/src/render-core.js` `buildBlenderArgv` passed `--shot-meta-json` but **not** lighting state.
- `assemble_scene.py` had **no** `--lighting-state-json` argument and ignored lightingState entirely.
- `configure_lights.py` was a stub that only emitted JSON.

### 4. Multi-object placement detached MapMark / meadow pieces

Placement logic selected `armature or first MESH` and wrote `location` on that single object.

- Map blend objects `AdventureMap` + `MapMark` are **siblings** (not parented) in `build_map()`.
- Placing `map` moved only one mesh and left `MapMark` behind.
- Meadow multi-mesh sets had the same failure mode.

### 5. Partial MapMark fix already present (must preserve)

Acceptance manifests already avoid map/meadow placement as a workaround:

- `scripts/cloud/acceptance-1080p/common.ts` — comment + no `map` placement  
- `scripts/cloud/acceptance-preflight.ts` — same for meadow/map  

**This agent does not undo those workarounds.** Assembly is fixed so hierarchy-safe placement is possible; acceptance scripts remain untouched (cloud-owner surface).

## Ownership model (implemented)

Single deterministic owner: **`manifest.lightingState`**.

1. Append assets.  
2. Place roles via armature (characters) or `DDP_AssetRoot_<role>` empty (multi-object props/envs), preserving world matrices / relative offsets (MapMark stays with AdventureMap).  
3. **Remove all imported lights** and orphan light data.  
4. Apply world + owned lights from lightingState preset (`MEADOW_DAY_SOFT` default when empty).  
5. **Remove imported cameras**; create single `ProdCam`.  
6. Fail closed if invariants fail (`SCENE_ASSEMBLY_INVALID`).  

Invariants recorded in `assemble_meta.json`:

- `LIGHTING_STATE_VALID`  
- `NO_DUPLICATE_LIGHTS`  
- `ASSET_HIERARCHY_VALID`  
- `SCENE_ASSEMBLY_VALID`  

Repeated assembly must not grow lights/cameras/roots (validated by `validate_scene_lighting.py`).

## Files

| Path | Change |
| --- | --- |
| `scripts/blender/scene_assembly_lib.py` | **Added** — lighting ownership + hierarchy helpers |
| `scripts/blender/assemble_scene.py` | Consume lightingState; hierarchy placement; camera purge |
| `scripts/blender/configure_lights.py` | Real preset application (same ownership model) |
| `scripts/blender/persistent_daemon.py` | Same ownership/placement path for daemon renders |
| `scripts/blender/validate_scene_lighting.py` | **Added** — local Blender diagnostic |
| `scripts/blender/test_scene_assembly_lib.py` | **Added** — pure unit tests |
| `workers/runpod-blender/src/render-core.js` | Pass `--lighting-state-json` |
| `workers/blender-renderer/src/index.js` | Pass `--lighting-state-json` |
| `workers/runpod-blender/test/render-core.test.js` | Assert lighting-state argv plumbing |

## Shared-file / integration notes

| File | Risk with other agents |
| --- | --- |
| `assemble_scene.py` / `persistent_daemon.py` | Agent 1 (rigging/animation) may also edit; lighting/placement changes are isolated behind `scene_assembly_lib.py` |
| `render-core.js` | Narrow argv addition only; Agent 3 (QC) may touch worker tests |
| Acceptance / Runpod / R2 scripts | **Not modified** |

## Explicitly not changed

- Character rigs / proportions / materials  
- MapMark authored geometry (only placement parenting at assembly time)  
- Cloud launch, paid GPU flags, secrets, DB schema  
- Acceptance workaround that omits map placement  

## Integration instructions for DoodleDash Production

1. Review branch `agent/lighting-repair` (do not auto-merge).  
2. Confirm no overlap with Agent 1 animation edits in `assemble_scene.py` / daemon.  
3. Run `python scripts/blender/test_scene_assembly_lib.py`.  
4. Run Blender diagnostic:  
   `blender --background --factory-startup --python scripts/blender/validate_scene_lighting.py`  
5. Run worker tests + full vitest as available.  
6. Keep `CLOUD_RENDER_ENABLED=false` / `ALLOW_PAID_GPU_LAUNCH=false` unless separately authorized.
