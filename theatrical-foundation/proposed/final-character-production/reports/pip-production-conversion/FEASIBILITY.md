# Pip production conversion — feasibility plan

STOP FOR JUSTIN. This is a path decision, not more conversion.

Justin confirmed the backpack design is the official permanent Pip
identity. Justin did **not** approve the current conversion as
animation-ready. The audit and protected working copy are a checkpoint
only. The envelope-rig approach must not be repeated.

Do not remesh the approved source. Do not overwrite the official working
blend. Do not touch Goat. Do not replace `production-library/`. Do not
declare theatrical binding. Do not merge Draft PR #24. Do not use paid
resources unless Justin approves a named paid path.

## Locked checkpoint

| Item | Path / hash | Rule |
| --- | --- | --- |
| Official visual source | inbox `pip_backpack_replacement.glb.part{1,2,3}.bin` SHA-256 `dca239475c78c9158ac87c36d674ceb23ef334358ee4394607758fc8f6728696` | Immutable |
| Official working copy | `working/pip_backpack_canonical_working.blend` SHA-256 `581bf48d1d7972e1e7cbea96300bac685a0d38aae82b0f140a2f3bef4cde2dfe` | Frozen likeness target. Do not overwrite |
| Conversion evidence | `conversion/pip_backpack_production_conversion.blend` plus audit/comparison stills | Keep. Do not continue envelope work on it |
| Binding five-views | `artifacts/theatrical-v2/source-package-validation/refs/` | Win identity conflicts |
| Goat / production-library | unchanged / fingerprint `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7` | Off limits |

Measured facts that block treating the current mesh as production:

- 1,006,107 verts / 1,930,054 tris, non-manifold generated surface
- 463 disconnected islands; only ~77k rearward verts were split
- Straps and scarf remain fused
- 17 backpack/body pairs closer than ~4 mm; minimum gap ~0.0011
- No eyelid, mouth, or wing-fold loops
- Envelope poses moved the fused body by ~0.0002 mean channel delta
- `backpack_sway` was unstable because bone-parented islands shifted bounds

## Why the last conversion cannot be finished in place

The approved mesh is a fused Tripo generate. Animation needs a **new**
quad mesh that follows that likeness. It does not need another pass on
the generate itself.

Already refused, and still refused:

1. Voxel remesh of the whole character — v1 center-seam failure
2. Whole-mesh stretch — rejected in sculpt-revision
3. Quadriflow of this density in this environment — no eyelid, mouth, or wing-fold loops
4. Primitive rebuild — redesigns Pip
5. Envelope or automatic weights on the fused 1.9M mesh — just measured; body/face/wings/feet did not deform
6. Cutting fused straps/scarf out of the generate — leaves holes and non-manifold rims
7. Wrapping the locked prototype `production-library` Pip onto this likeness — different design, and that library must not be replaced
8. Using the 80k v2 primary as live Pip — wrong source family, still fused, still no loops

## Safest technically realistic path

Build a **new animation mesh** beside the frozen high-res. Keep the
approved working blend as a shrinkwrap and bake target only.

### 1. Clean animation topology

Target a film/TV mid-poly character, not another generate:

| Region | Separate object | Target quads | Required loops |
| --- | --- | ---: | --- |
| Head + torso | `pip_body` | 8,000–16,000 | neck, shoulders, chest, spine |
| Eye L / Eye R | `pip_eye_L`, `pip_eye_R` | 250–400 each | independent spheres |
| Lids | on body or lid meshes | 2–3 rings | blink without tearing the cheek |
| Beak | `pip_beak` or hinged on body | 300–600 | commissure hinge, upper/lower split |
| Crest | three feathers | 80–150 each | count and size hierarchy preserved |
| Wing L / Wing R | `pip_wing_L`, `pip_wing_R` | 1,200–2,500 each | 3–4 fold loops, layered silhouette |
| Foot L / Foot R | `pip_foot_L`, `pip_foot_R` | 400–800 each | three forward toes + hallux |
| Backpack | `pip_backpack` | 800–1,500 | sits clear of wings and scarf |
| Strap L / Strap R | `pip_strap_L`, `pip_strap_R` | 200–400 each | shoulder path, no neck cut |
| Scarf | `pip_scarf` | 400–800 | front knot, clearance under straps |

Total before subdiv: about 15,000–30,000 quads. Optional render subdiv
later. Do not keep 1.9M tris as the deforming mesh.

Method: manual retopo over the frozen high-res (Bsurfaces / poly build /
shrinkwrap, snapping to the approved surface). The high-res stays
untouched.

### 2. High-resolution detail and texture transfer

Do not keep the generated 8K atlas as the only production UV.

1. Lay new UVs on the retopo: face, body, wings, accessories. UDIM or
   planned 2K–4K islands. Higher texel density on face, eyes, crest,
   scarf knot, and backpack emblem.
2. Cage-bake from the frozen high-res:
   - Color from the approved 8192×8192 map
   - Tangent normal from the approved 4096×4096 map plus high-res form
   - ORM from the approved 4096×4096 map
3. Inspect misses under the backpack, between wing layers, at the scarf
   knot, and in the eye corners. Repair those islands by hand.
4. Keep Khronos PBR Neutral. Do not invent a new color family.

The generated atlas will smear when it lands on new seams. Face, lashes,
and crest usually need a paint pass after bake.

### 3. Isolated or deformation-safe accessories

Model new backpack, two straps, and scarf to the approved silhouette.
Do not cut them out of the fused generate.

Clearance must be designed in. The audit already found 17 close
backpack/body pairs. Straps pass over the shoulders and under the scarf.
No satchel, no cross-body strap, no hip bag.

Parent and weight each accessory on its own object. Backpack can be a
rigid-ish bag with a chest/back constraint. Straps need stretch along
their length. Scarf needs neck follow plus a knot that does not intersect.

### 4. Functional body, wing, foot, and face deformation

Build the rig on the **retopo only**. Use the unbound modular spec as
the bone list, not as a live registry bind:

- spine, neck, head
- independent eye aim
- upper/lower lids, brows
- beak open/close, smile, later phonemes
- wing fold that keeps layered feathers
- foot plant, three-forward-toe curl, hallux
- backpack, strap_L, strap_R, scarf
- crest and tail secondary

Shape keys for lids, brows, beak, and cheeks. Marker bones on the fused
generate are not a face rig.

### 5. Production weighting and movement tests

Heat weights are only a first pass. A human must paint shoulders, wing
folds, neck/scarf, and beak hinge.

Required tests, rendered 1080×1920 at 30 FPS, compared to the approved
identity stills:

- rest five-views
- head turn ±40°
- blink and brow
- beak open
- wing fold
- foot plant / lift
- backpack settle without intersecting wings or scarf
- strap stretch on a simple walk pose
- scarf follow on a head turn

Do not declare production-ready from a passing numeric diff. Justin
reviews the stills.

## Likeness risks

| Risk | Why it happens | How to contain it |
| --- | --- | --- |
| Face flatten or eye drift | shrinkwrap on a coarse cage | retopo the face first; Justin reviews a face still before body finish |
| Crest count or hierarchy lost | generate crest is three fused masses | model three separate feathers; snap to high-res |
| Wing layers collapse | one card instead of layered quads | keep 2–3 visible layers; bake, do not remesh the high-res wings |
| Backpack silhouette drift | new model misses the gold emblem or strap path | overlay on the five-views and the official rear still |
| Scarf/strap intersection | current generate already has ~1 mm gaps | design clearance on the new meshes |
| Bake smear on the smile and lashes | generated atlas ≠ planned UV | face paint-through after bake |
| Color shift | wrong view transform | Khronos PBR Neutral, same lookdev as identity stills |
| Wrong-source wrap | 80k primary or prototype library mesh | never use those as live Pip |

## What this environment can complete reliably

Unpaid local Blender 4.2.3 LTS, software GL, no cloud GPU:

- Preserve and hash-lock the approved source and working copy
- Host a frozen bake scene once a retopo file is delivered
- Cage-bake color / normal / ORM from the 8K/4K maps
- Comparison stills and phone JPEGs
- Gate, catalog, and recovery-ledger updates
- Deformation-test renders **after** a real retopo and weights exist
- Pipeline tests on `PROXY_PIPELINE_BIRD` only (not Pip)

This environment cannot reliably invent:

- eyelid, mouth, or wing-fold loops
- a likeness-safe full-body retopo
- isolated straps and scarf without holes
- production weight paint
- facial shape keys that read as Pip
- a rest-stable backpack parent on the fused generate

GitHub’s 100 MB file cap still applies. A bake scene must keep the 8K
color map extracted, not packed beside a second high-res duplicate.

## What needs manual Blender artistry or an external service

Must be done by a person in Blender, or by a retopo service if Justin
approves paying for one:

- the animation retopo itself
- separate eyes, lids, beak, crest, wings, feet
- new backpack, straps, and scarf
- production UV layout
- bake miss repair and face paint-through
- weight painting and corrective shapes
- facial shapes

Paid tools that need an explicit Justin yes before use:

- Quad Remesher or any paid remesh addon
- a hired retopo / character-TD service
- paid GPU or cloud render
- any external generative provider

Free automatic remeshers (Blender voxel, Quadriflow, Instant Meshes) are
available and still the wrong tool for this likeness.

## Effort, not a calendar

These are specialist-hours for one character TD or retopo artist working
from the frozen backpack high-res. They are not a schedule.

| Workstream | Specialist-hours | Who |
| --- | ---: | --- |
| Face + head retopo with lid and beak loops | 6–10 | human artist or paid service |
| Body, wings, feet retopo | 12–24 | human artist or paid service |
| Backpack, two straps, scarf modeled to match | 8–14 | human artist or paid service |
| UV layout | 4–8 | human artist or paid service |
| Cage bake + miss repair + face paint-through | 4–8 | artist + this environment can run the bake |
| Body / wing / foot / accessory rig and weights | 12–20 | character TD |
| Facial shapes (blink, brow, beak, smile) | 8–16 | character TD |
| Movement tests and comparison stills | 3–6 | this environment after the mesh exists |
| **First animation-ready candidate for Justin review** | **57–106** | not production-library or theatrical yet |

An agent session here can prepare the bake/compare harness and stop
again. It cannot spend those artist hours.

## Decision recorded

Justin chose **Option 3: pause** at the protected checkpoint, and
confirmed **Option 4: refuse automated remesh**.

Recorded refusals:

- no voxel remesh
- no Quadriflow replacement
- no primitive reconstruction
- no envelope rig on the fused source
- no destructive edits to the approved Pip

Justin will separately decide who creates the professional animation
retopo. Do not resume conversion in this environment until that
assignment exists. Paid services stay unauthorized.

## Still closed after any of those choices

- production-ready claim until Justin reviews the new mesh
- `production-library/` replace
- theatrical bind / `THEATRICAL` rows
- Draft PR #24 merge
- Goat
- paid resources without a fresh yes
- Hero-Shot / Steps 9–16
