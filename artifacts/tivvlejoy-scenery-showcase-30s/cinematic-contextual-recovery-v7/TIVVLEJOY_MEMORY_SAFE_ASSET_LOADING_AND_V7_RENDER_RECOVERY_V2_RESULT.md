# TIVVLEJOY_MEMORY_SAFE_ASSET_LOADING_AND_V7_RENDER_RECOVERY_V2_RESULT

Status: **MEMORY_SAFE_LOADING_INSUFFICIENT_ROOT_CAUSE_REQUIRED**
**FINAL_VIDEO_RENDER_NOT_AUTHORIZED**

V7 art systems were not redesigned. No paid compute. Proof A 360×640
did not write pixels: the new runtime-memory preflight blocked Cycles
after the combined-scene depsgraph / Cycles-sync cost was measured at
~12.5 GiB.

## Identity

- starting branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
- starting SHA: `634b329bbabda332587fa6209172ca7b47b09877`
- final branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
- final SHA: `78e6ed9185aa10fb5fd25fa3a709a1a741686916`
- PR: **#169 OPEN / DRAFT / UNMERGED / NOT READY**

## OLD FAILURE

- RAM: 16 GiB
- swap: 0
- RSS: ~14.5 GiB (kernel anon ~14.9 GiB)
- vertices: 457,931
- exit: 137 / SIGKILL
- stage: Cycles initialization after scene build

## ROOT MEMORY AUDIT

Do not guess. Measured:

| Stage | RSS | MemAvailable | delta RSS |
|---|---:|---:|---:|
| empty | 257 MiB | 14.2 GiB | — |
| HDRI load | 258 MiB | 14.2 GiB | +0.6 MiB |
| terrain | 262 MiB | 14.2 GiB | +4 MiB |
| water + bed | 262 MiB | 14.2 GiB | +0.3 MiB |
| one grass | 275 MiB | 14.2 GiB | +13 MiB |
| one fern | 277 MiB | 14.2 GiB | +2 MiB |
| one beech | 355 MiB | 14.1 GiB | +74 MiB |
| 8 creek rocks | 364 MiB | 14.1 GiB | +8 MiB |
| shoreline dressing | 364 MiB | 14.1 GiB | +0.2 MiB |
| style | 364 MiB | 14.1 GiB | ~0 |
| purge | 364 MiB | 14.1 GiB | ~0 |
| pre-Cycles (image audit) | 891 MiB | 13.6 GiB | +527 MiB |
| Cycles sync (no camera) | 12.51 GiB | 1.34 GiB | **+11.67 GiB** |

- largest memory jump: **Cycles initialization / scene synchronization**
- cause: **combined Proof A depsgraph + Cycles CPU sync**, not the
  458k source vertices and not `dst.images = all`
- Old 12.8 GiB “scene build” was **`view_layer.update()`** evaluating
  SUBSURF + the 15k HDRI while placing the camera / planting. Removing
  per-instance updates dropped planting to ~364 MiB.
- Proof A 360 then called `add_camera` → one full `view_layer.update()`
  rebuilt that 12.8 GiB **before** Cycles. Preflight blocked. No SIGKILL.

Isolated Cycles 64×64 / 1 / no OIDN (separate processes):

| Mode | after RSS | delta | HWM note | PNG |
|---|---:|---:|---|---|
| empty | 274 MiB | +19 MiB | — | yes |
| HDRI only | 301 MiB | +46 MiB | — | yes |
| water + HDRI | 302 MiB | +48 MiB | — | yes |
| one beech + HDRI | 448 MiB | +108 MiB | **HWM 5.97 GiB** | yes |

Pieces fit. Combined scene does not.

## BOTANIQ LOADER

- old behavior: `_append_blend_group` set `dst.objects = ALL` and `dst.images = ALL`
- new behavior: `TJ_MEMORY_SAFE_ASSET_LOADER_V1` appends requested objects only;
  Blender resolves material/image dependencies. No explicit all-image append.
- objects requested: 1 per plant file (4 files: festuca, carex, fern, beech)
- objects loaded: 1 per file
- images old: would dump every image in each blend
- images new: beech probe 5 images (4 referenced maps + auto), sourceImageCount 4
- materials: 2 on beech (bark + leaf)
- dependencies resolved: **yes** (sizes 512×2048 bark, 2048×2048 leaf)
- missing textures: **none**

## ROCK LOADER

- old behavior: 8 named objects + `dst.images = ALL`
- new behavior: 8 named objects only; images via dependencies
- objects requested: 8
- objects loaded: 8
- source library: **515 objects**, **7 images** (those 507 extras are no longer loaded)
- images old: 7 explicit
- images new: dependency-only (scene ended at 17–19 images total including HDRI/Botaniq)

## IMAGE AUDIT

- loaded count: **19**
- estimated raw bytes: **504,657,024** (~481 MiB)
- largest: `Image0001.jpg` **15000×7500**, 4 ch, ~450 MiB raw (purchased HDRI JPG)
- next: Botaniq leaf 2048×2048 maps
- unreferenced removed: **0** (none were unreferenced)

## DATABLOCK PURGE

- RSS before: 12.89 GiB (after accidental camera depsgraph eval on Proof A)
- RSS after: 13.43 GiB (image audit decoded the 15k HDRI)
- removed: 0 images / 0 materials / 0 meshes / 0 objects

Without that eval (stage probe): purge RSS 364 MiB → 364 MiB.

## SUBDIVISION

- V7 still adds SUBSURF on terrain/bed and scene-copy rocks
- Combined-scene Cycles probe with `render_levels=0` still OOM-killed
  before writing a receipt (anon-rss ~15.1 GiB, exit 137)
- decision: **KEEP** current subdivision. It is not the sole Cycles cost.
  No art-direction change.

## MEMORY STAGE TABLE

- empty: 257 MiB
- terrain: 262 MiB
- water: 262 MiB
- grass: 275 MiB
- fern: 277 MiB
- beech: 355 MiB
- rocks: 364 MiB
- shoreline: 364 MiB
- style: 364 MiB
- pre-Cycles: 891 MiB (after decoding HDRI pixels)
- Cycles initialized: 12.51 GiB RSS / 1.34 GiB available (no camera; render error)

## RUNTIME MEMORY GUARDRAIL

- implemented: **yes** `TIVVLEJOY_RUNTIME_MEMORY_PREFLIGHT_V1`
- tests: **yes** (scales from detected RAM; blocks the confirmed 16 GiB / 2.7 GiB / 12.8 GiB state; predicted Cycles increment)
- threshold logic: RSS > 68% of total **or** available < max(3 GiB, 25% of total, capped 8 GiB) **or** predicted available after measured Cycles increment < that floor
- fail code: `RUNTIME_MEMORY_BUDGET_EXCEEDED`
- Proof A 360 result: **blocked** (RSS 12.85 GiB, available 1.65 GiB)

## SOURCE AMPLIFICATION GUARD

- implemented: **yes**
- tests: **yes** (exact-object OK; no explicit all-image; dependency 4 maps OK; dump warns; severe + budget blocks)

## PROOF A 360x640

- execution: **FAIL** — `RUNTIME_MEMORY_BUDGET_EXCEEDED` (no SIGKILL)
- render time: **not started**
- peak RSS: 12.60 GiB sampler / 12.85 GiB preflight
- PNG: **no**
- path: *(none written)*

## PROOF A 540x960

- execution: **NOT RUN**
- render time: —
- peak RSS: —
- PNG: no
- path / phone: *(none)*

## VISUAL JUDGMENT

- shoreline: **NOT JUDGED**
- water: **NOT JUDGED**
- bed: **NOT JUDGED**
- reflection: **NOT JUDGED**
- rocks: **NOT JUDGED**
- vegetation: **NOT JUDGED**
- overall: **NOT JUDGED**

## MEMORY REDUCTION

- old peak: ~14.5–14.9 GiB (OOM)
- new plant/append peak without depsgraph eval: **~364–891 MiB**
- reduction (append/plant only): **~97%**
- new combined Cycles / depsgraph peak: **still ~12.5–13.4 GiB**
- headroom at that point: **~1.3–1.7 GiB available, 0 swap** — not enough
- overall: loader waste removed; **Cycles combined-scene sync still does not fit**

## Remaining root cause (do not request hardware yet)

Measured leftover:

1. Combined-scene Cycles CPU synchronization (~12.5 GiB), not isolated assets.
2. One-beech isolate peaked **HWM 5.97 GiB** then released — part of the stack.
3. Purchased HDRI JPG is **15000×7500** (~450 MiB raw). Alone it is cheap; with
   the full evaluated scene it participates in the sync spike.
4. `view_layer.update()` / camera eval reproduces the 12.8 GiB spike before
   Cycles. That path is now avoided; preflight still has a measured increment.

Next work (not done here, not paid):

- keep V7 art locked
- one-proof-at-a-time
- investigate Cycles BVH / texture cache / evaluated SUBSURF **together**
- do not launch RunPod

## DEGRADATIONS / FALLBACKS / SKIPPED SOURCES

- Official Blender 4.2.2 (already present). SHA previously verified.
- Proof A sources only: festuca, carex, fern, beech, 8 EcoKit rocks, HDRI JPG.
- Not loaded: 3DT, Louis, Cabin04, willow, hazel, moss, Botaniq C/D/T, 507 unused EcoKit objects.
- OIDN disabled on the blocked 360 canary (`--no-denoise`). Not an art change.
- No swap. No asset decimation. No placeholder materials.
- Water A/B and Proofs B/C/D not run (A is the canary).

## Paid compute

- live pods: `[]`
- paid CREATE: `0`
- RunPod spend: `$0`

## Evidence

- `MEMORY_STAGE_PROBE_V2.json`
- `APPEND_DEPENDENCY_PROBE.json`
- `ISO_{empty,hdri,water,beech}.json`
- `CONTEXTUAL_RECOVERY_V7.json` (360 blocked receipt)
- `PROOF_A_360_SAMPLER.txt` / `PROOF_A_360_WALL.txt`
