# Future retopology and rigging readiness

Checklist only. **Do not retopo, groom, rig, skin, or animate now.**

## Why these sculpts are not production-ready

- Single fused mesh per character (`output`), no object separation for eyes, beak, satchel, scarf, crest, or horns.
- Generated high-density topology: Pip 78,687 verts / 157,379 tris; Goat 79,743 verts / 159,481 tris.
- Small non-manifold / boundary edge counts remain (Pip 48/45, Goat 32/31 after the kept pass).
- 8K packed albedo, no separate roughness/normal/groom caches authored for production.
- Characters face +X, not Blender −Y. Character left is +Y.
- No armature, vertex groups, or shapekeys.

## Retopo plan (after Justin approval only)

1. Lock the approved sculpt as a frozen shrinkwrap target. Do not keep editing the fused generate.
2. Build a deformation-friendly quad mesh per region: skull, lids, beak/muzzle, torso, wings/arms, legs, tail, accessories.
3. Separate accessories (scarf, satchel, compass, clasp) as their own meshes with clean straps.
4. Target a game/film mid-poly body plus optional render subdiv, not another 150k fused sculpt.
5. Transfer albedo carefully; do not keep the 8K generate atlas as the only production UV.

## Future material / groom plan

- Keep Khronos PBR Neutral and the current color family.
- Feather/fur detail should come from groom or tiled normals, not darker albedo.
- Pip: short down on head/chest, longer layered wing/tail cards or groom after retopo.
- Goat: short oatmeal fur, cinnamon patches as albedo + groom density, not a decal slab.

## Future face and rig requirements

- Pip: three crest bones/controls, independent lids, beak open, wing fold that preserves layered feathers, satchel strap that does not tear.
- Goat: two horn roots, floppy ears, scarf, compass, cloven hoof roll.
- Both: additive NLA only; do not replace the canonical action library when a future bind happens.
- Scale lock: Goat remains 1.5× Pip character height, feet on z=0.

## Do not do yet

Retopo, groom, rig, weight paint, bind THEATRICAL, Hero-Shot, Steps 9–16, or canonical replace.
