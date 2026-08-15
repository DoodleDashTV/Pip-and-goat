# Stage 1 — complete source audit

Inspected locally. Original package files were not overwritten.
Blender 4.2.3 LTS. Isolated package hashes previously verified 22/22 OK.

Package: `/tmp/pip-goat-v2-source/theatrical-foundation/proposed/v2/scource-package/TivvleJoy_Pip_Goat_3D_Source_v1_CURSOR_LITE`  
Remote source branch: `assets/pip-goat-v2-source` @ `bf00a8c`  
Do not merge that branch. Do not commit the 395 MB package.

## Binding images

| File | Role | Notes |
| --- | --- | --- |
| `Pip/references/Pip_front.jpeg` | Binding | Authority |
| `Pip/references/Pip_three_quarter.jpeg` | Binding | Authority |
| `Pip/references/Pip_back.jpeg` | Binding | Authority |
| `Pip/references/Pip_profile_facing_left.jpeg` | Binding | Authority |
| `Pip/references/Pip_profile_facing_right.jpeg` | Binding | Authority |
| `Goat/references/Goat_front.jpeg` | Binding | Authority |
| `Goat/references/Goat_three_quarter.jpeg` | Binding | Authority |
| `Goat/references/Goat_back.jpeg` | Binding | Authority |
| `Goat/references/Goat_profile_facing_left.jpeg` | Binding | Authority |
| `Goat/references/Goat_profile_facing_right.jpeg` | Binding | Authority |

No additional 11th/12th body-view JPEGs are in the LITE package.

## 3D sources

| File | Type | Bytes | Verts | Tris | Non-manifold | Rig | Rec |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Pip_primary_source.blend` | fused sculpt | 76,953,275 | 78,687 | 157,379 | 48 | no | donor / possible cage |
| `Pip_Prism_source.glb` | Tripo Prism | 62,208,016 | 997,238 | 1,925,501 | 68,319 | no | **Pip foundation** |
| `Pip_Hunyuan_source.glb` | Hunyuan | 36,471,100 | 312,617 | 500,000 | 119,784 | no | comparison only |
| `Goat_primary_source.blend` | fused sculpt | 78,389,021 | 79,743 | 159,481 | 32 | no | donor / possible cage |
| `Goat_Prism_source.glb` | Tripo Prism posed | 61,923,512 | 977,106 | 1,901,509 | 52,357 | no | pose donor |
| `Goat_Prism_expressive_source.glb` | Tripo Prism neutral | 61,719,464 | 975,519 | 1,903,808 | 46,938 | no | **Goat foundation** |
| `Goat_Hunyuan_source.glb` | Hunyuan | 33,958,724 | 293,524 | 499,994 | 84,216 | no | comparison only |

All unique meshes are a single fused object. No armatures, weights, shape keys, or actions.
FBX/OBJ interchange rows are absent in CURSOR_LITE (expected).

## Feature matrix vs binding sheets

| Feature | Pip Prism | Pip primary | Pip Hunyuan | Goat Prism expressive | Goat Prism posed | Goat primary |
| --- | --- | --- | --- | --- | --- | --- |
| Face / appeal | Strong | Strong | Weaker graphic | Strong | Strong, posed | Strong |
| Eyes | Large green | Large green | Weaker | Large amber | Large amber | Large amber |
| Beak / muzzle | Good | Good | Softer | Good | Good | Good |
| Body silhouette | Pear, detailed | Pear | Softer | Bean, detailed | Bean, posed | Bean |
| Wings / arms | Layered, a bit short | Layered | Mixed | Hoof-hands | Hands on hips | Hoof-hands |
| Crest / horns | Reads 3–4 coral | 3, profile weaker | Mixed | 2 ridged | 2 ridged | 2 ridged |
| Ears | n/a | n/a | n/a | Floppy | Floppy | Floppy |
| Legs / feet | 3+ hallux | Hallux weaker | Mixed | Cloven | Cloven | Cloven |
| Feathers / fur | High-frequency generated | Generated | Generated | Generated fur-like | Generated | Generated |
| Scarf | Teal | Teal | Teal | Burnt orange | Burnt orange | Burnt orange |
| Bag / compass | Teal satchel + spiral | Teal satchel | Laterality conflict | Teal compass | Teal compass | Teal compass |
| Markings | Cream face/belly | Cream face/belly | Mixed | Left-eye cinnamon | Left-eye cinnamon | Left-eye cinnamon |
| Color | Chartreuse family | Darker mustard risk | Mixed | Oatmeal | Oatmeal | Oatmeal |
| Neutral stance | Yes | Yes | Yes | **Yes** | No (pose) | Yes |
| Overall likeness | **Best Pip detail** | Close, more editable | Do not average | **Best Goat neutral** | Pose only | Close, more editable |

## Rejected as starting meshes

- Primitive rebuild `pip_theatrical_production_rebuild.blend` / `goat_theatrical_production_rebuild.blend`
- v1 / v1.1 kitbash DNA (red comb, purple pack, blue collar, GOAT tag)
- Hunyuan as canon
- Empty `main`

## Destructive refinement

Not started until this audit and the provenance file were written.
