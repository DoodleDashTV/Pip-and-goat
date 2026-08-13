# FINAL_1080P cloud confirmation — digest sha256:8204d4bf… PASS

Authorized single paid confirmation render for Pip chest-seam repair.

| | |
| --- | --- |
| Job | `accept1080-2026-08-13T18-02-48-636Z` |
| Pod | `yw9efy9ylhc5ww` (SECURE RTX 4090) |
| Worker image | `sha256:8204d4bffdc2d28dee6c313fc571e6fb5e3831a3d8ff241a29a536963ec1f830` |
| Source commit stamped | `da26bc16806513e7ba58ceb3408728df7712622f` |
| Render code | `a4018c0e…` match true |
| Artifact | `renders/finals/meadow-map-mystery/accept1080-2026-08-13T18-02-48-636Z/final_1080p.mp4` |
| Artifact sha256 | `aefdd0b05881d336c489ba984a891f04eec0a44e889c6b3b3f61002554655458` |
| Output | 1080×1920, 90 frames, 30 fps, h264, 3.0s |
| Wall runtime | **14.76 min** |
| Actual cost | **$0.182** / $0.25 cap |
| Pod after terminate | absent; myself.pods empty; no billable GPU |
| Retries | **none** |

## QC suite

| Suite | Result |
| --- | --- |
| Acceptance (postrun) | **PASS** — readback match, 0 black/freeze, exact 1080×1920 / 90 frames |
| Visual (full-res all frames) | **PASS** — exposure/highlights/shadows/saturation/tonal all frames |
| Temporal | **PASS** — mean luma range 3.07; no outlier frames |
| Geometry / rig / shadow-caster unit | **PASS** — 40/40 rig tests; scene gates PASS; caster sealed beak tip+pupils |
| Character lock | **PASS** — Pip/Goat blend sha256 match charlock evidence; identityPreserved |
| Chest seam (cloud frames) | **PASS** — no hard vertical band; f45 upper-chest high-pass 2.89; shot max 18.5 |

## Chest seam

Visual review of frame 45 and chest crop: smooth yellow chest under beak; belly form
shadow only. Quantitative high-pass along x under the beak stays well below a hard
seam spike on all 90 frames.

## Remaining defects

None observed for the chest seam. Backpack remains occluded by body in this
framing (pre-existing shot property; not introduced by this repair).
