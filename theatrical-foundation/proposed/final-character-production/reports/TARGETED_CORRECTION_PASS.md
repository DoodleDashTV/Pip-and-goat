# Targeted character correction pass

**Starting commit:** `7bf2b717e217b3422b58b75ba1829d9f3aa43e35`  
**Branch:** `cursor/theatrical-final-character-production-1ebc`  
**Draft PR:** #24  
**Blender:** 4.2.3 LTS  
**Paid resources:** not used  
**Canon / merge / theatrical binding:** unchanged / not performed / not declared  

This pass did not rebuild either character, replace Prism foundations,
retopologize, rig, or merge.

## Fix 1 — Goat white forehead spots

**Exact cause.** The finish-polish script added detached objects at
brow-detected centroids, not inside the painted globes:

- `Goat_Catch_0` / `Goat_Catch_1`: emissive white highlight spheres,
  diameter ~0.018, emission 0.35, placed above the brows.
- `Goat_Cornea_0` / `Goat_Cornea_1`: glassy spheres, originally
  diameter 0.136. Even after moving them onto the irises and scaling
  to ~0.065, the upper hemisphere poked through the brow as white /
  semi-transparent circles.

These were geometry, not painted albedo and not lighting-only.

**How they were removed.**

1. Deleted `Goat_Catch_0` and `Goat_Catch_1`.
2. Deleted later `Goat_Catch_in_eye_*` extras (those were also detached
   spheres, not the painted in-eye catchlights).
3. Kept `Goat_Cornea_0` and `Goat_Cornea_1` in the file. Set
   `hide_render=True` and `hide_viewport=True`. They were not deleted.
4. Did not paint over the spots.

Painted catchlights inside both eyes remain on the Color map.

**Proof.** Front close-up pixel analysis of the brow and forehead bands:
`white_count = 0` (threshold RGB > 0.88). Pair-image goat-forehead crop:
11 bright pixels, consistent with in-eye catchlights falling into the
crop, not forehead circles. Verify JSON confirms both cornea objects
remain, hidden from render.

## Fix 2 — Goat brown back rectangle

**Exact cause.** Stage 2 `paint_goat_teardrop` stamped a hard-z-cut
teardrop that was widest at a flat top, plus a separate vertical
tail-base bar at world z 0.92–1.16, width 0.065. UV rasterization on
the fused 8K atlas read as a hard-edged brown rectangle down the back
and a second rectangle above the tail.

**How it was reshaped.**

1. Restored Color pixels from `working/goat_highdetail_working.blend`
   (the pre-stamp Prism Color).
2. Repainted a rounded-crown organic teardrop only: cosine side falloff,
   sine irregularity, soft scarf fade, no tail bar, no hard z-cut.
   World band approximately z 1.30–1.88.
3. Stopped further stamps after the visible tail rectangle was gone.
   Additional world-space stamps on this generated atlas keep reading
   as geometric patches, not fluffy coat.

**Honest remaining gap.** The tail rectangle is gone. The upper-back
cinnamon is present and centered under the scarf, but it still reads
as a somewhat geometric stamp rather than the sheet’s fluffy organic
teardrop. A real groom or retopo UVs would be required to finish that
look. Further albedo stamps were stopped to avoid destructive texture
damage.

## Fix 3 — Lengthen Pip’s wings

**Stop condition hit.** Flood-isolated yellow wing verts and translated
the lower feathers while holding the shoulder roots. The fused Prism
topology shredded into vertical shard planes (same failure as PR #22).

The stretch was reverted. Pip high-res was restored from
`working/pip_highdetail_working.blend` and finish polish (sheen / SSS /
gentle HSV) was re-applied. No second stretch.

| Wing | tip_z before | tip_z after failed stretch | after revert |
| --- | ---: | ---: | ---: |
| Left (character +Y) | 0.550 | 0.391 | original Prism (~0.55) |
| Right (character −Y) | 0.558 | 0.399 | original Prism (~0.56) |

Visual rest length is still mid-torso / satchel-bottom, short of the
pair-image lower-belly / upper-thigh guidance. Isolated wing geometry
would be required. Do not hard-stretch the fused mesh again.

## Fix 4 — Pip unequal eyes

**Stop condition hit.** There are no independent eyeball, iris, or
pupil objects. Color/spatial isolation of iris verts returned
`left = 0`, `right = 0`. No eye geometry was edited.

Visible in the straight-on close-up: viewer-left eye (Pip’s right, −Y)
reads slightly more open / circular; viewer-right (Pip’s left, +Y)
reads slightly more compressed at the lid. That is fused eyelid-opening
/ generated-face asymmetry, not a pair of mismatched globe objects and
not camera perspective alone.

| Measure | Left | Right | After |
| --- | --- | --- | --- |
| Separate globe diameter | none | none | unchanged |
| Iris / pupil objects | none | none | unchanged |
| Isolated iris verts | 0 | 0 | no edit |
| Head mirrored | no | no | no |

Preserved Pip’s expression. Did not mirror the head.

## Validation renders

All 1080×1920, warm feature lighting, Khronos PBR Neutral, software GL
(llvmpipe), Blender 4.2.3 LTS.

1. `artifacts/theatrical-v2/final-character-production/corrections/01_goat_corrected_front_closeup.png`
2. `artifacts/theatrical-v2/final-character-production/corrections/02_goat_corrected_rear.png`
3. `artifacts/theatrical-v2/final-character-production/corrections/03_goat_corrected_rear_three_quarter.png`
4. `artifacts/theatrical-v2/final-character-production/corrections/04_pip_corrected_front_neutral_closeup.png`
5. `artifacts/theatrical-v2/final-character-production/corrections/05_pip_corrected_three_quarter_closeup.png`
6. `artifacts/theatrical-v2/final-character-production/corrections/06_pip_corrected_front_full.png`
7. `artifacts/theatrical-v2/final-character-production/corrections/07_pip_corrected_three_quarter_full.png`
8. `artifacts/theatrical-v2/final-character-production/corrections/08_corrected_pair.png`

Contact sheet: `corrections/correction_contact_sheet.png`

## Edited files

- `theatrical-foundation/proposed/final-character-production/high-resolution/goat_highres_candidate.blend`
- `theatrical-foundation/proposed/final-character-production/high-resolution/pip_highres_candidate.blend` (wing stretch reverted; polish restored)
- `theatrical-foundation/proposed/final-character-production/textures/goat_highres_basecolor.png`
- scripts under `scripts/assets/` listed in the commit
- reports under `theatrical-foundation/proposed/final-character-production/reports/`

Working blends were not overwritten. Canonical `production-library/` was
not touched.

## Tests / Blender validation

- Scene inspect of extras (`TARGETED_INSPECT.json`)
- Cornea hide-flag verify (`TARGETED_CORNEA_VERIFY.json`): both corneas
  present, `hide_render=true`, not deleted
- Pixel analysis of correction stills (`TARGETED_PIXEL_ANALYSIS.json`)
- Software-GL renders of the eight required views
- No paid GPU, no RunPod, no purchased assets

## Status

PIP VISUAL CANDIDATE: BLOCKED — Prism + finish polish; wings still short; eyes still slightly unequal; extra crest stubbles remain  
GOAT VISUAL CANDIDATE: BLOCKED — forehead catch spheres removed and corneas hidden from render; tail rectangle removed; upper-back mark still a somewhat geometric stamp; slimmer than sheets  
PIP PRODUCTION ASSET: BLOCKED — 1.9M-tri non-manifold Tripo mesh; no retopo, groom, or rig  
GOAT PRODUCTION ASSET: BLOCKED — same  
CANON: UNCHANGED  
MERGE: NOT PERFORMED  
THEATRICAL BINDING: AWAITING JUSTIN’S FINAL VISUAL APPROVAL  
PAID RESOURCES: NOT USED  
