# Stages 4–8 — production blockers

These stages were not faked. The selected foundations are single fused
Tripo meshes:

| Character | Verts | Tris | Non-manifold | Rig | Shape keys | Separate accessories |
| --- | ---: | ---: | ---: | --- | --- | --- |
| Pip Prism | 997,238 | 1,925,501 | 68,319 | no | no | no |
| Goat Prism expressive | 975,519 | 1,903,808 | 46,938 | no | no | no |

## Why this blocks production delivery

1. **Retopology.** A 1.9M-triangle non-manifold generated mesh is not an
   animation-ready quad mesh. Voxel remesh was already rejected in v1
   (center-seam failure). Whole-mesh stretch was rejected in sculpt-revision.
   Quadriflow of this density in this environment will not produce clean
   eyelid, mouth, wing-fold, or hoof loops.
2. **UVs / textures.** The GLB UVs exist and carry 8K Color plus 4K Normal
   and ORM. They are generated atlases, not production UDIMs with planned
   seams. Rebuilding facial/accessory texel density requires the missing
   retopo.
3. **Feather / fur systems.** Surfaces are baked generated displacement, not
   a groom or feather-card system that can deform, fold, or hold temporal
   stability under animation.
4. **Facial rig.** Eyes, lids, beak/muzzle, and mouth interior are fused
   into the body. There are no eyelid loops, no independent eyeballs, and
   no viseme targets.
5. **Body / accessory rig.** No armature, weights, or separate strap / bag /
   scarf / compass objects. A strap-clearance walk/run/sit test cannot be
   honest on a fused static mesh.

## What would be required next (not started)

- A dedicated animation retopo (or a new clean sculpt) using the Prism
  high-res as the likeness target and the 80k primaries only as optional
  cage donors
- Bake of approved detail onto that retopo
- Separate accessory meshes
- Facial and body rigs built on the retopo, not on the Tripo mesh

The 80k primary blends remain available as cage donors. They are themselves
fused generated meshes (48 / 32 non-manifold) and are not production
topology.

## Status

PIP VISUAL IDENTITY: APPROVED — backpack source `dca239475c78…8696`  
PIP PRODUCTION ASSET: BLOCKED — fused 1.9M-tri non-manifold Tripo mesh; no retopo, groom, or rig  
GOAT PRODUCTION ASSET: BLOCKED — unchanged

## Official Pip source

Justin selected
`20260816T025617Z_pip_backpack_replacement.glb_dca239475c78`
as the official permanent Pip design. The working copy is
`working/pip_backpack_canonical_working.blend`. The superseded Prism and
satchel files stay on disk for rollback.

Do not replace `production-library/`, declare theatrical binding, merge
Draft PR #24, remesh, or use paid resources until Justin authorizes those
later steps.
