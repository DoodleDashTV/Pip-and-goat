# Pip long-wing comparison candidate

**Role:** comparison candidate only  
**Current Pip overwritten:** no  
**production-library touched:** no  
**Canon / merge / theatrical binding:** unchanged / not performed / not declared  
**Paid resources:** not used  
**Blender:** 4.2.3 LTS  

Source moved to
`theatrical-foundation/proposed/final-character-production/source-candidates/pip-long-wing/pip_long_wing_candidate_github.glb`

SHA-256 `48c7de9a11c1121e0dd36aade66121b943000d652b8f89dc9d9560a0374054ff`  
19,360,856 bytes  

## Opened correctly

Blender 4.2.3 LTS imported the GLB in 0.50s.

| | Long-wing candidate | Current Pip Prism |
| --- | ---: | ---: |
| Generator mesh | `tripo_mesh_136daef8-168c-4eaa-956b-023aa96a0a3f` | `tripo_mesh_b700c619-1b99-4d0c-ae5d-d51496e556d8` |
| Objects | 1 fused mesh | 1 fused mesh |
| Verts | 210,060 | 997,238 |
| Faces | 430,615 | 1,925,501 |
| Non-manifold | 39,040 | 68,319 |
| Native height | 0.980 | 0.980 |
| Preview height | 2.050 (comparison scale only) | 2.050 |
| Armature / shape keys | none | none |
| Maps | Color 8K, Normal 4K, ORM 4K | Color 8K, Normal 4K, ORM 4K |

Preview blend (import only):
`source-candidates/pip-long-wing/pip_long_wing_candidate_preview.blend`

## Landmark comparison

### Long-wing shape and length

Closer to the binding sheets and the pair-image guidance than current Pip.
Wings leave the shoulders, rest against the sides, and read as layered
primary feathers reaching about lower-belly / upper-thigh (rear 3/4 reads
even longer). Current Pip still stops around mid-torso / satchel-bottom.

Measured yellow side spans at height 2.05 are contaminated by body verts
(min z 0.19 / 0.25). Visual length, not that min-z, is the authority.

Left/right volume is roughly matched. They do not look like small
shoulder fans.

### Wing attachment and symmetry

Shoulder roots are present and left/right placement is close. Still one
fused object. These wings cannot be transplanted onto current Pip without
the same shredding already seen on the Prism mesh.

### Face and identity

Still recognizably Pip: yellow bird, teal satchel, coral crest, orange
beak and legs. Finish is worse. A cracked / veined overlay covers body,
eyes, crest, scarf, and bag. A vertical center seam splits the face and
beak. That is not the binding-sheet down.

### Eye symmetry

No independent globes. Isolated iris-like verts: left 60, right 93, with
unequal spans. The straight-on face still shows lid/opening imbalance.
Not a fix for the current Pip eye problem.

### Three-feather crest

Three coral feathers are readable. An extra nub remains. Not cleaner than
current Pip.

### Body color and proportions

Chartreuse-family yellow, cream face, teal accessories, cinnamon legs.
Rounder / more spherical than the binding pear and than current Pip.
The cracked overlay makes the color read dirtier than the sheets.

### Satchel placement and strap

**This is the candidate’s other real gain.**

- Strap over character-right shoulder (−Y)
- Bag on character-left hip (+Y)
- Rear and rear-close-up show a continuous strap across the back into
  the left-hip bag, with buckle hardware
- Current Prism rear still loses the strap into the back feathers

Landmark measure at height 2.05: `strap_continuous_across_back: true`,
`strap_laterality: strap_over_character_right`.

## Recommendation

**C — reject as a replacement or production donor.**

Not A. The complete model is not better. Longer wings and a continuous
strap do not outweigh the cracked overlay, center seam, lower mesh
density, remaining eye/crest issues, and fused non-manifold topology.

Not B as geometry. Wings and satchel cannot be safely extracted from this
fused Tripo mesh. That path already shredded current Pip.

Keep the file as comparison evidence only. If Justin later authorizes an
isolated wing / strap rebuild, this GLB is visual reference, not a mesh
to merge.

Current Pip high-res is unchanged.

## Validation renders

1. `artifacts/theatrical-v2/final-character-production/long-wing-candidate/pip_long_wing_front.png`
2. `artifacts/theatrical-v2/final-character-production/long-wing-candidate/pip_long_wing_rear.png`
3. `artifacts/theatrical-v2/final-character-production/long-wing-candidate/pip_long_wing_side.png`
4. `artifacts/theatrical-v2/final-character-production/long-wing-candidate/pip_long_wing_front_three_quarter.png`
5. `artifacts/theatrical-v2/final-character-production/long-wing-candidate/pip_long_wing_rear_three_quarter.png`
6. `artifacts/theatrical-v2/final-character-production/long-wing-candidate/pip_long_wing_face_closeup.png`
7. `artifacts/theatrical-v2/final-character-production/long-wing-candidate/pip_long_wing_strap_rear_closeup.png`

Comparisons under `long-wing-candidate/comparison/`.

## Status

PIP VISUAL CANDIDATE: BLOCKED — current Prism unchanged; long-wing GLB rejected as replacement  
GOAT VISUAL CANDIDATE: UNCHANGED FROM PRIOR PASS  
PIP PRODUCTION ASSET: BLOCKED  
GOAT PRODUCTION ASSET: BLOCKED  
CANON: UNCHANGED  
MERGE: NOT PERFORMED  
THEATRICAL BINDING: AWAITING JUSTIN’S VISUAL APPROVAL  
PAID RESOURCES: NOT USED  
