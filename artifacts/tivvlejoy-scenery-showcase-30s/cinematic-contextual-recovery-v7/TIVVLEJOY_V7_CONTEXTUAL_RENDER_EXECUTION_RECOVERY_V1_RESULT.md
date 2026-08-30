# TIVVLEJOY_V7_CONTEXTUAL_RENDER_EXECUTION_RECOVERY_V1_RESULT

Status: **V7_CONTEXTUAL_RENDER_INFRASTRUCTURE_BLOCKED**
**FINAL_VIDEO_RENDER_NOT_AUTHORIZED**

V7 art systems were not redesigned. No `--proof all`. No paid compute.
The 360×640 / 16 Proof A / Water C execution probe was SIGKILL/OOM-killed
during Cycles initialization. No contextual pixels exist.

## Identity

- starting branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
- starting SHA: `91d27c156385238b4a456c934f17e2a188c0a56f`
- final branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
- final SHA: `e04f16b7a6f5be0bc13ac4964fdf6e3b4a6e5df2`
- PR: **#169 OPEN / DRAFT / UNMERGED / NOT READY**
- paid render authorization: none consumed
- live pods: `[]`
- paid CREATE: `0`
- RunPod spend: `$0`

## PREVIOUS TERMINATION

- cause: **Cursor execution VM/pod shutdown before Blender wrote pixels**
- confidence: **PROBABLE** for the prior pod; **CONFIRMED OOM** on this recovery probe
- ENVIRONMENT_TERMINATION_CAUSE: **PROBABLE** (prior) / **CONFIRMED** (this probe)

### Prior pod (conversation / spawn evidence)

- first observed failure: `Command failed to spawn: Aborted`
- then: pod terminated with exit `4294967295` (`0xFFFFFFFF` / `-1`)
- Blender **did not start** on that pod
- no kernel OOM log from that machine is available here (different VM)
- no PNG from V7 contextual proofs existed at required start SHA `91d27c1`

Likely stage (prior): **before Blender start** (environment recycle / spawn abort).
OOM (prior): **unknown** — not evidenced on that host.
timeout (prior): **unknown**
disk (prior): **unknown**
other (prior): environment shutdown / command-spawn abort

### This recovery VM (measured)

- cold warm-fork of environment `79675bbf-9d74-11f1-a7d1-d6b4613131ce`
- build `bld-20260829-8b52dc46-837a-4400-9efc-affd2d6b8c9f`
- RAM: **16 GiB**, **0 swap**
- disk free before probe: **~234.6 GiB**
- official Blender 4.2.2 LTS installed and SHA-256 verified
  (`443c5fcbb929a54afad339c8f445b2620b00c2be173d68158ccb4f62f81ca9d7`)
- Proof A owned sources range-extracted only (no full 5 GB Botaniq download)

## RESOURCE PROBE (Proof A / Water C / 360×640 / 16)

- resolution: `360x640`
- samples: `16`
- objects: `124`
- meshes: `112`
- materials: `18`
- images: `22`
- vertices: `457931`
- faces: `455101`
- Botaniq source files appended: **4**
  (`festuca_a`, `carex_a`, `fern_a`, `beech_a`)
- EcoKit rock objects appended: **8**
- RAM before Blender: MemAvailable **15 505 448 KiB** (~14.8 GiB)
- RAM after source append: RSS **387 809 280** (~370 MiB); HWM **421 474 304**
- RAM after scene build: RSS **12 839 669 760** (~12.0 GiB); MemAvailable **2 719 182 848**
- RAM before render: same as after scene build
- RAM peak (sampler): **15 207 352 KiB** (~14.5 GiB RSS)
- kernel OOM anon-rss: **15 610 792 KiB** (~14.9 GiB)
- disk before: **251 864 178 688** bytes free
- disk after: still ~234 GiB free (not a disk failure)
- render time: **no samples completed**; wall **518 s** (03:51:06Z–03:59:44Z)
- PNG written: **no**

Stage reached:

| Stage | Reached |
|---|---|
| Blender started | YES |
| source append | YES |
| scene build | YES |
| Cycles initialization | YES — died here |
| sample rendering | NO evidence of a finished sample |
| file write | NO |

Process:

- exit code: **137** (128+9)
- signal: **SIGKILL**
- kernel: `Out of memory: Killed process … (blender) … anon-rss:15610792kB`
- timeout: **no**
- disk: **no**
- other: **no** — this is OOM, not a spawn abort

Geometry is not the 12 GiB. 458k vertices cannot explain scene-build RSS.
The cost is Cycles/BVH/HDRI importance + evaluated copies/subsurf on a
16 GiB / 0-swap Cursor VM.

## PROOF A EXECUTION

- 360×640: **FAIL** (OOM / SIGKILL, no PNG)
- 540×960: **NOT RUN** (stop rule after first execution-probe failure)

selected water test: C (probe only; no pixels)
visual result: **NOT JUDGED**
full path: *(none)*
phone path: *(none)*

## WATER A / B / C

- WATER A: **NOT RUN** / path: *(none)*
- WATER B: **NOT RUN** / path: *(none)*
- WATER C: **FAIL** at 360×640 execution probe / path: *(none)*

## PROOF B

- execution: **NOT RUN**
- visual result: **NOT JUDGED**
- path / phone: *(none)*

## PROOF C

- execution: **NOT RUN**
- visual result: **NOT JUDGED**
- path / phone: *(none)*

## PROOF D

- execution: **NOT RUN**
- visual result: **NOT JUDGED**
- path / phone: *(none)*

## CHECKPOINT COMMITS

- A: **none** (no PNG)
- B: **none**
- C: **none**
- D: **none**

## DEGRADATIONS / FALLBACKS / SKIPPED SOURCES

- Official Blender 4.2.2 bootstrap (not a purchase). Image tarball SHA-256 verified.
- Range-extracted Proof A members only. Full Botaniq zip was **not** downloaded.
- Texture matcher initially over-selected species-unrelated bark/leaf files onto disk;
  Blender appended only the four required blends.
- `quality/` symlink added so V7 hardcoded Botaniq paths resolve.
- Not loaded: 3DT mountains, Cabin04, Louis, willow, hazel, moss, Botaniq C/D/T variants,
  Forest Nature kit, SkyMachine, village textures.
- `/usr/bin/time` missing on this image; wall clock + `/proc` sampler used instead.
  First wrapper attempt exited 127 **before** Blender; that was not counted as a
  render failure. Blender was then started once.
- Two-strike stop: prior pod died with no pixels; this probe **confirmed OOM**.
  No second render attempt. No art-direction change.

## V7 systems (unchanged)

- `TJ_SHORELINE_TRANSITION_V2`
- `TJ_CREEK_BED_V2`
- `TJ_MEADOW_SYSTEM_V3`
- `TJ_ENVIRONMENT_STYLE_UNIFIER_V2`
- intact-Louis occlusion strategy
- Botaniq beech hero direction
- Cabin04 midground-only policy

No shoreline / water / meadow / vegetation / Louis / building redesign.

## Exact blocker

**Cursor Cloud execution VM: 16 GiB RAM, 0 swap. V7 Proof A scene build
already holds ~12 GiB RSS. Cycles init pushes blender to ~14.9 GiB anon RSS
and the kernel OOM-killer sends SIGKILL. No output PNG.**

This is an infrastructure memory ceiling, not a visual-quality fail and not
a V7 unit-test fail.

Required next environment (not done here, not paid RunPod):

- more than 16 GiB RAM **or** usable swap **or** a worker class that can
  finish Cycles at 360×640 / 16 without SIGKILL
- then resume **one proof per Blender process** from Proof A / Water C

Do not assemble `TJ_HERO_V7_WORLD`.
Do not mark PR 169 ready.
Do not merge.

## Paid compute

- live pods: `[]`
- paid CREATE: `0`
- RunPod spend: `$0`
- `RUNPOD_API_KEY` was present and unused

## Evidence files (this directory)

- `PROBE_A_C_360x640_ENV_BEFORE.txt`
- `PROBE_A_C_360x640_SAMPLER.txt`
- `PROBE_A_C_360x640_WALL.txt`
- `PROBE_A_C_360x640_SUMMARY.txt`
- `PROBE_A_C_360x640_OOM_DMESG.txt`
- `PROBE_A_C_360x640_MEM_AFTER.txt`
- `PROBE_A_C_360x640_DISK_AFTER.txt`
