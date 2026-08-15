# TivvleJoy Pip & Goat — 3D Source Package v1

This package organizes the user-supplied character reference images and generated 3D source models for Pip (`CHAR_PIP_001`) and Goat (`CHAR_GOAT_001`).

## Authority order

1. The five-view images in each character's `references/` folder control visual identity.
2. The primary `.blend` file is editable source geometry and a starting point, not an approved final production asset.
3. GLB files are comparison/reference meshes only.
4. FBX and OBJ files in the complete archive are interchange backups of the same generated source family.

If model geometry conflicts with the reference images, the reference images win. Do not silently alter character identity to preserve generated geometry.

## Critical production rule

Do **not** replace canonical/theatrical production assets automatically. Import into an isolated proposed-v2 workspace, render neutral comparison turntables, and wait for Justin's visual approval before canonical replacement, retopology lock, rigging, grooming, or animation production.

## Current technical status

- The supplied GLBs are textured static meshes with no skeleton, skin, or animation clips.
- The primary source families are generated high-detail meshes and should be treated as sculpt/reference sources.
- They still require topology review, deformation-ready retopology, UV/material review, separated facial components or facial topology, rigging, facial controls, weight painting, and animation validation.
- Preserve embedded or supplied textures. Do not infer that a filename containing “animated” means the model is rigged.

## Recommended workflow

1. Read `CURSOR_IMPORT_PROMPT.md` and `manifest.csv`.
2. Import each primary `.blend` into an isolated proposal area.
3. Compare front/back/left/right/three-quarter renders against all five reference images.
4. Record mismatches before modifying anything.
5. Build clean animation topology with a non-destructive link to the high-detail source.
6. Separate and rig eyes, eyelids, brows, mouth/beak or muzzle, ears, wings/arms, fingers/hooves, accessories, and secondary-motion elements as appropriate.
7. Create neutral, expression, deformation, silhouette, material, and 90-frame motion gates.
8. Seek explicit visual approval before promotion to canonical assets.

## Package variants

- `CURSOR_LITE`: reference images, primary editable Blender files, unique GLB alternatives, specs, prompt, and manifest.
- `COMPLETE`: everything in CURSOR_LITE plus FBX and expanded OBJ/PBR interchange backups.

No licensing or ownership conclusion is made by this technical package. Preserve the generator's receipts, terms, and source-image provenance separately.
