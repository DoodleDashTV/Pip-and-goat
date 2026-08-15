# TivvleJoy Pip / Goat v2 source package — validation

**Status:** inspected only. Not approved. Canonical assets were not replaced. Nothing was merged.

| Item | Value |
| --- | --- |
| Remote branch | `assets/pip-goat-v2-source` |
| Source commit | `bf00a8c8818519094003b992bce71b1aca7eefd3` |
| Package | `TivvleJoy_Pip_Goat_3D_Source_v1_CURSOR_LITE` (~395 MB after LFS) |
| Path typo on branch | `theatrical-foundation/proposed/v2/scource-package/` |
| Inspected with | Blender 4.2.3 LTS, EEVEE Next, Khronos PBR Neutral, 1080×1920, 24 spp, ortho |
| Primary blends authored in | Blender 4.0.4 (`404.30`) — 4.2.3 warns “expect loss of data” |
| Canonical mutated | no |
| THEATRICAL bound | no |
| Merged | no |

Authority order from the package: five-view JPEGs win, primary `.blend` is editable source (not canon), GLBs are comparison only. If geometry conflicts with the sheets, the sheets win.

This validation does **not** treat the agent kitbash sculpts on `cursor/theatrical-v2-character-foundation-1ebc` as authority.

## 1. Inventory

Present in CURSOR_LITE (22 hashed files; 17 of 21 manifest rows):

| Role | Pip | Goat |
| --- | --- | --- |
| Binding five-views | `Pip_front/back/profile_facing_left/profile_facing_right/three_quarter.jpeg` | same names under `Goat/references/` |
| Primary editable source | `Pip/models/primary/Pip_primary_source.blend` (74 MB) | `Goat/models/primary/Goat_primary_source.blend` (75 MB) |
| Comparison GLB | `Pip_Prism_source.glb` (60 MB), `Pip_Hunyuan_source.glb` (35 MB) | `Goat_Prism_source.glb` (60 MB), `Goat_Hunyuan_source.glb` (33 MB), `Goat_Prism_expressive_source.glb` (59 MB) |
| Spec / contract | `Pip/CHARACTER_SPEC.md` | `Goat/CHARACTER_SPEC.md` |
| Package | `README_FIRST.md`, `CURSOR_IMPORT_PROMPT.md`, `manifest.csv`, `SHA256SUMS.txt` | |

Absent, expected for LITE (not a defect):

- `Pip/models/interchange/Pip_source.fbx` and `obj/model.obj`
- `Goat/models/interchange/Goat_source.fbx` and `obj/model.obj`

Also on the asset branch, outside the package: leftover empty-main files (`Add Pip and Goat canonical reference images`, `doodle-dash-production`). No `production-library/` on that branch. Do not merge it onto theatrical / Milestone 3 stacks.

## 2. Integrity

`sha256sum -c SHA256SUMS.txt`: **22 / 22 OK**. No missing listed files. No hash mismatches.

Listed hashes are copied at `package-docs/SHA256SUMS.txt`.

## 3. Technical audit

All seven unique meshes are a **single fused object**. No armature, weights, shape keys, or actions. Do not infer rigging from any filename.

| Source | Format | Verts | Tris | Ngons | Non-manifold edges | Height | Texture | Rec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Pip_primary_source.blend` | 1 mesh `output` | 78,687 | 157,379 | 1,072 | 48 | **1.9998** | 8K `texture_0.png` | REVISE |
| `Goat_primary_source.blend` | 1 mesh `output` | 79,743 | 159,481 | 769 | 32 | **2.0001** | 8K `texture_0.png` | REVISE |
| `Pip_Prism_source.glb` | Tripo mesh | 997,238 | 1,925,501 | 0 | 68,319 | 0.98 | 8K color + 4K N/ORM | REJECT as canon |
| `Pip_Hunyuan_source.glb` | `node_0` | 312,617 | 500,000 | 0 | 119,784 | 1.12 | 4K `texture_20250901` | REJECT as canon |
| `Goat_Prism_source.glb` | Tripo mesh | 977,106 | 1,901,509 | 0 | 52,357 | 0.98 | 8K color + 4K N/ORM | REJECT as canon |
| `Goat_Prism_expressive_source.glb` | Tripo mesh | 975,519 | 1,903,808 | 0 | 46,938 | 0.98 | 8K color + 4K N/ORM | REJECT as canon |
| `Goat_Hunyuan_source.glb` | `node_0` | 293,524 | 499,994 | 0 | 84,216 | 1.13 | 4K `texture_20250901` | REJECT as canon |

Critical technical flags:

- Primaries are independently normalized to height ≈ 2.0. Pair scale is wrong. Binding contract is Goat about **1.5× Pip**.
- Primaries face **+X**, not Blender −Y. First preview pass labeled profiles as “front.” Corrected five-views are in `artifacts/theatrical-v2/source-package-validation/clean/`.
- Hunyuan GLBs face −Y; Prism GLBs face +X.
- Accessories, eyes, lids, crest/horns/ears are **not separated**.
- Prism meshes are generator topology (`tripo_mesh_*`) with tens of thousands of non-manifold edges. Unusable as production cages.
- Hunyuan textures are dated `texture_20250901`.
- These are generated high-detail sculpt / reference sources, not production topology.

Binding JPEG rec: **ACCEPT as visual authority** for new proposed work. They do not replace locked canonical `production-library/` assets until Justin says so.

## 4. Five-view comparison

Binding sheets live in `artifacts/theatrical-v2/source-package-validation/refs/`.
Corrected primary stills live in `artifacts/theatrical-v2/source-package-validation/clean/`.

| View | Binding (authority) | Primary blend (proposal) |
| --- | --- | --- |
| Pip front | `refs/Pip_front.jpeg` | `clean/pip_primary_front.png` |
| Pip back | `refs/Pip_back.jpeg` | `clean/pip_primary_back.png` |
| Pip left | `refs/Pip_profile_facing_left.jpeg` | `clean/pip_primary_left.png` |
| Pip right | `refs/Pip_profile_facing_right.jpeg` | `clean/pip_primary_right.png` |
| Pip 3/4 | `refs/Pip_three_quarter.jpeg` | `clean/pip_primary_three_quarter.png` |
| Pip face | — | `clean/pip_primary_closeup.png` |
| Goat front | `refs/Goat_front.jpeg` | `clean/goat_primary_front.png` |
| Goat back | `refs/Goat_back.jpeg` | `clean/goat_primary_back.png` |
| Goat left | `refs/Goat_profile_facing_left.jpeg` | `clean/goat_primary_left.png` |
| Goat right | `refs/Goat_profile_facing_right.jpeg` | `clean/goat_primary_right.png` |
| Goat 3/4 | `refs/Goat_three_quarter.jpeg` | `clean/goat_primary_three_quarter.png` |
| Goat face | — | `clean/goat_primary_closeup.png` |

Alternate fronts only (comparison, not candidates):

- `pip_prism_front.png`, `pip_hunyuan_front.png`
- `goat_prism_front.png`, `goat_prism_expressive_front.png`, `goat_hunyuan_front.png`

## 5. Image-by-image mismatch report

Sheets win. Do not average contradictory generated details.

### Pip primary vs Pip five-views

| Topic | Match | Mismatch / review |
| --- | --- | --- |
| Silhouette | Pear / teardrop; large head; wings as arms | Generator volume is slightly softer / noisier than the polished sheets |
| Proportions | Oversized head, compact body | Height locked to 2.0 with Goat; pair scale is wrong |
| Face | Lighter face and belly; curved terracotta beak with upper/lower; open cheerful mouth | Beak hook and mouth interior vary vs the cleaner sheet beak |
| Eyes | Large glossy green/teal, catchlights, lashes, brows | Iris/lash graphic is generated, not the sheet’s cleaner graphic |
| Expression | Open smile | Slightly more “sculpt grin” than the sheet |
| Colors | Yellow-chartreuse, coral crest, teal accessories, cinnamon legs | No rejected red comb, purple pack, or nub beak |
| Surface | Sculpted layered feathers, not cards or spheres | Still a generated displacement look, not production feather hierarchy |
| Appendages | Three coral feathers readable in front, back, 3/4, closeup; three-forward-toe | Some profiles read as two crest feathers (occlusion vs missing — review). Rear toe is a review item; sheet back shows a hallux, primary back is weaker |
| Accessories | Teal neckerchief; teal satchel; copper spiral clasp readable in true front and closeup | Clasp weaker in profile. Satchel laterality: primary front reads strap over **character-right shoulder / bag on character-left hip**. Hunyuan front reads the bag on the opposite side. Do not average. Use the five-view JPEGs |
| L/R | Asymmetric satchel is intentional | Confirm strap shoulder against the front and 3/4 sheets before retopo |

### Goat primary vs Goat five-views

| Topic | Match | Mismatch / review |
| --- | --- | --- |
| Silhouette | Bean / childlike torso; horns and ears read in silhouette | Same independent 2.0 height as Pip |
| Proportions | Large head, short limbs | Pair scale wrong vs “Goat ~1.5× Pip” |
| Face | Cream muzzle; rounded plum/pink-brown nose; small smile | Generated muzzle softness vs the sheet |
| Eyes | Large glossy amber/hazel, catchlights, lashes | Not the rejected tiny eyes |
| Expression | Gentle closed smile | Neutral, not the Prism hand-on-hip read |
| Colors | Oatmeal coat; burnt-orange neckerchief; teal compass; charcoal hooves | No blue collar, no gold GOAT tag |
| Surface | Directional sculpted fur, not rectangular/halo cards | Not a production groom; still generator grain |
| Appendages | Exactly two ridged skull-anchored horns; long floppy ears; split hooves on hands and feet; small tail | Horn ridge and ear interior polish trail the sheets |
| Accessories | Neckerchief + teal compass on a metal ring | Compass rose is simpler / less gold than the sheet. Charm readability varies by source |
| L/R | Cinnamon patch on **character-left eye** (viewer-right in front) is correct | Sheet back has a **large centered upper-back cinnamon patch**. Primary back reads mainly as shoulder patches. Do not invent a back patch from the wrong source |

### Alternate GLB conflicts (do not average)

- **Pip Hunyuan** satchel hangs on the opposite hip from the primary front / Pip 3/4 sheet.
- **Goat Prism** front read as a posed, hand-on-hip 3/4. **Goat Prism expressive** front read closer to a neutral A-pose. Filenames may be inverted. Treat pose as a conflict, not a blend.
- Prism ≈ 2M tris and Hunyuan ≈ 500k tris are different generator families from the ~80k-vert primaries. Same identity family, not interchangeable cages.
- Heights 0.98 / 1.12 / 2.0 are three different normalizations.

## 6. Cleanup / retopo / rig plan (plan only)

Do not execute this plan until Justin approves a source.

1. Keep the package isolated. Do not merge `assets/pip-goat-v2-source` onto theatrical or Milestone 3 branches.
2. Keep five-view JPEGs as visual authority. Primary blends are the only editable sculpt starting point worth considering. GLBs stay comparison-only.
3. After explicit approval: retopo a deformation-ready cage from the approved primary (not from Prism ~2M tris).
4. Separate eyes, lids, brows, beak/muzzle, crest/horns/ears, wings/arms, fingers/hooves, tail, neckerchief, satchel/strap or compass.
5. Relock pair scale: Goat about 1.5× Pip, then 1080×1920 / 30 FPS theatrical framing.
6. Rebuild UVs and materials from the embedded 8K maps; do not invent a new palette.
7. Only after a later authorization: rig, facial controls, weights, additive NLA, motion gates.
8. Do not start Hero-Shot, Steps 9–16, grooming, paid GPU, RunPod, cloud render, deploy, or external providers from this validation.

## 7. Recommendations

| Source | Recommendation | Why |
| --- | --- | --- |
| Pip / Goat five-view JPEGs | **ACCEPT as binding authority** for new proposed work | They are the visual contract |
| `Pip_primary_source.blend` | **REVISE** | Usable high-detail source. Not production. Fused, unrigged, wrong pair scale, generator topology |
| `Goat_primary_source.blend` | **REVISE** | Same. Identity is much closer to the sheets than the agent kitbash v2, still not a lock |
| Pip / Goat Prism GLBs | **REJECT as canon** | Comparison only. Generator mesh, non-manifold, posed/orientation risk |
| Pip / Goat Hunyuan GLBs | **REJECT as canon** | Comparison only. Satchel laterality conflict on Pip. 4K dated maps |
| `Goat_Prism_expressive_source.glb` | **REJECT as canon** | Comparison only. Do not use as the neutral |

**Stop.** Wait for Justin’s visual call before importing any of these meshes into `proposed/v2` as the new sculpt authority, and before any retopo, groom, rig, or canonical replace.

Fingerprint unchanged: `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7`
