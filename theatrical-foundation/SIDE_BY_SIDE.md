# Existing versus proposed — visual comparison

**None of the proposed stills are approved.** Teal bar = existing approved asset. Amber bar = proposed upgrade. Gray bar = temporary diagnostic asset.

## What changed

Proposed stills use the **same** `production-library` meshes, rigs, and actions. Only Principled sockets were tweaked in memory (SSS / sheen / coat / roughness). Base Color and Metallic were not written.

## Pip

| View | Existing | Proposed | What to look for |
| --- | --- | --- | --- |
| Front | `existing_approved_pip_front.png` | `proposed_upgrade_pip_front.png` | Slightly softer yellow, wetter eyes. Same sphere kitbash, nub beak, stub wings. |
| Face | `existing_approved_pip_closeup.png` | `proposed_upgrade_pip_closeup.png` | Eye coat / catchlight. Comb and beak hues must stay red / orange. |
| Full body | `existing_approved_pip_full_body.png` | `proposed_upgrade_pip_full_body.png` | Identity unchanged. No feather volume added. |
| Rear | `existing_approved_pip_rear.png` | (no proposed rear) | Purple backpack + gold star remain on the approved asset. |
| Acting | `existing_approved_pip_three_quarter_pip_point.png` | — | Authored `PIP_POINT` still drives the pose. |

## Goat

| View | Existing | Proposed | What to look for |
| --- | --- | --- | --- |
| Front | `existing_approved_goat_front.png` | `proposed_upgrade_goat_front.png` | Slightly softer cream / horn coat. Same toy proportions. Collar + GOAT tag stay. |
| Face | `existing_approved_goat_closeup.png` | `proposed_upgrade_goat_closeup.png` | Eye wetness. Framing is tighter than ideal (preview defect, not a mesh change). |
| Full body | `existing_approved_goat_full_body.png` | `proposed_upgrade_goat_full_body.png` | No fur volume. Horns still simplified beans. |
| Acting | `existing_approved_goat_three_quarter_goat_head_nod.png` | — | Authored `GOAT_HEAD_NOD`. |

## Environment / prop / scene

| View | Existing | Proposed | What to look for |
| --- | --- | --- | --- |
| Meadow | `existing_approved_meadow_set.png` | `proposed_upgrade_meadow_set.png` | Grass/path roughness only. Still a 4-vert ground + icosphere trees. |
| Map | `existing_approved_map_prop.png` | `proposed_upgrade_map_prop.png` | Paper/ink roughness. No fiber texture. |
| Vertical 9:16 | — | `proposed_upgrade_vertical_scene_meadow.png` | Both characters in the meadow. **Not a golden scene.** |
| Lighting | `proposed_upgrade_pip_closeup.png` (neutral) | `proposed_upgrade_pip_closeup_motivated.png` | Same shaders, two local light rigs. Does not retune `LIGHTING_STATES`. |

## Honest read

The proposed pass is **look-dev**, not a theatrical rebuild. Silhouette, poly density, missing groom, missing maps, and missing eye-aim bones are unchanged. A reviewer who wants movie-quality Pip/Goat should **revise** (sculpt + groom + maps), not approve these shaders as the foundation.
