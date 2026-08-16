# Pip original — left-riser removal (not one-path yet)

Does not overwrite current Prism Pip.
Does not write `production-library/`.
Does not declare canon, theatrical binding, or production-ready.
Does not merge.

## Review addendum

The previous front/rear previews were not approved. The front still
showed two shoulder paths. This pass targeted the character-left
vertical riser only.

## What this pass did

Rebuilt from the hash-verified `/tmp` original. Did not reuse the
shredding flatten.

- Identified the left-front riser (~33k verts)
- Pushed that column inward in X onto a chest profile (max 0.038)
- Clone-stamped Color and Normal from nearby yellow chest feathers
- Killed leftover teal texels only (no square UV stamps onto the face)
- Kept the original rear diagonal
- Added one front diagonal ribbon over the character-right shoulder
- Did not add a chest-cover primitive (it read as another strap)

## Honest visual result

**The front still does not read as exactly one diagonal.**

- Mid left-chest teal is lower than the untouched original
  (about 0.17 → 0.07 in the mid-riser crop)
- A fused left riser still ghosts as a second shoulder path
  (raised column + leftover olive/teal near the bag)
- A yellow primitive patch over that column looked like a second
  strap/scarf tail and was not kept
- Heavier flatten of the fused column shreds the mesh
- Broader paint hits scarf / bag / face UVs

The original rear diagonal is preserved.

Face, eyes, long wings, three coral feathers, satchel design, copper
spiral, and feet remain on the original mesh.

## What is required next

Isolated replacement of the left-front riser geometry — not another
paint or flatten pass on the fused Tripo mesh.

## Proofs

`artifacts/theatrical-v2/final-character-production/long-wing-original-strap/`

Rebuild: `scripts/assets/fix_pip_original_strap.py`

## Status

Not a clean one-path strap. Not production-ready. Not canon.
Not theatrical-bound. Not merged. Paid resources: not used.
