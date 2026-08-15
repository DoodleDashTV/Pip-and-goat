# Source and donor provenance

## Binding authority

The ten five-view JPEGs in the v2 source package win every conflict.

Pip: `Pip_front`, `Pip_three_quarter`, `Pip_back`, `Pip_profile_facing_left`, `Pip_profile_facing_right`  
Goat: matching Goat names  

Copies used for review live under `artifacts/theatrical-v2/source-package-validation/refs/`.

## Pip foundation

**Selected:** `Pip/models/alternates/Pip_Prism_source.glb`  
**SHA-256:** `722f8bd9bf6eb02e31f5ee297898232de2633462eee467290c01b511c9c4fecd`  
**Why:** This is the only Pip Prism mesh in the isolated CURSOR_LITE package. It is the high-detail Tripo/Prism foundation Justin named. The original generator filename

`D987DE8A_8CF0_41DE_AFB8_EA2511_Cute_animated_green_bird_with_backpack_Prism_31_3c9bf585 2.glb`

is **not present as that string** in the LITE tree. The packaged file is the same role and the only Prism Pip available. GLB extras identify generator `https://tripo3d.ai` and mesh `tripo_mesh_b700c619-1b99-4d0c-ae5d-d51496e556d8`.

**Not used as the starting mesh:** the rejected primitive rebuild
`theatrical-foundation/proposed/v2/production-rebuild/pip_theatrical_production_rebuild.blend`.

**Donors, only if they beat Prism against the sheets:**

| Donor | Use |
| --- | --- |
| `Pip_primary_source.blend` | Editable 80k fused sculpt; laterality/hallux/crest review; possible future retopo cage |
| `Pip_Hunyuan_source.glb` | Comparison only. Bag laterality conflicts with the sheets. Do not average. |
| Revised fused `pip_v2_revised.blend` | Rollback evidence. Not canon. |

## Goat foundation

**Selected:** `Goat/models/alternates/Goat_Prism_expressive_source.glb`  
**SHA-256:** `0b4eebc5f89fd24fa7d2d4508d3551e4d11de57778089cc714c6080015424658`  
**Why:** Closest high-detail **neutral** stance to the binding front sheet: large oatmeal head, left-eye cinnamon patch, two ridged horns, floppy ears, burnt-orange scarf, teal compass, cloven hooves. The other Prism file is a hands-on-hips pose, which is a performance pose, not a production bind pose.

**Donors:**

| Donor | Use |
| --- | --- |
| `Goat_Prism_source.glb` | Posed adventurous silhouette / hand-on-hip reference only |
| `Goat_primary_source.blend` | Editable 80k fused sculpt; scale and marking review; possible future retopo cage |
| `Goat_Hunyuan_source.glb` | Comparison only. Weaker laterality trust. |
| Revised fused `goat_v2_revised.blend` | Rollback evidence. 1.50 scale lock on that branch. Not canon. |

## What is never overwritten

- The isolated source package under `/tmp/pip-goat-v2-source/.../TivvleJoy_Pip_Goat_3D_Source_v1_CURSOR_LITE/`
- `production-library/`
- Existing proposed v1 / v1.1 / v2 primaries and the rejected primitive rebuild
