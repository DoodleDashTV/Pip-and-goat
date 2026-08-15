# Stage 2 — high-resolution refinement

Worked only on duplicates of the selected Prism foundations.
Original GLB / primary blends / rejected rebuilds were not overwritten.

## What was done

1. Imported `Pip_Prism_source.glb` and `Goat_Prism_expressive_source.glb`.
2. Locked heights at Pip 2.05 and Goat 3.075 (ratio 1.50).
3. Saved rollback working blends under `working/`.
4. Attempted Pip extra-crest suppression by shrinking coral verts classified
   as stubs. That pass over-selected (~40k verts) and tore the scalp in the
   face close-up. **Reverted.** Pip high-res candidate is restored from the
   working checkpoint.
5. Painted Goat’s missing upper-back cinnamon teardrop onto a duplicate of
   the Color map only. Normal and ORM maps were left packed. The painted
   Color map is stored at `textures/goat_highres_basecolor.png`.

## What was refused

- Primitive sphere/cylinder reconstruction
- Whole-mesh stretch
- Hard satchel vertex translate
- Voxel remesh
- Averaging Hunyuan laterality against the sheets

## Held after this stage

- Same Prism visual family for both characters
- Pair scale 1.50
- Pip satchel laterality on front / 3/4 / pair: strap character-right, bag
  character-left
- Goat left-eye cinnamon on character-left (viewer-right in front)
- Goat upper-back cinnamon mark is now present on the proposed back render
- Neutral / daylight / warm-interior / cinematic front lighting exists for
  color review

## Remaining Stage 2 visual gaps

See `REMAINING_GAPS.md`. The largest remaining likeness issues are silhouette
volume (both characters read slimmer than the sheets), Pip wing rest pose
(hangs closer to the body than the binding flare), Pip crest still denser
than three paddle feathers in some views, and Goat scarf-back bow / fluff
volume. These cannot be fixed by another whole-mesh deform without repeating
the rejected fused-stretch failures.
