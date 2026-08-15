# Pip original — strap correction (stop for visual approval)

Does not overwrite current Prism Pip.
Does not write `production-library/`.
Does not declare canon, theatrical binding, or production-ready.
Does not merge.

## What was wrong

The untouched original long-wing Pip (hash
`9158dea0e23e5ebb086a574badb0b5a62982d0b90e1d8b118f54cfac0549c4f2`)
was conditionally approved except for the satchel strap.

- Front reads as two vertical backpack straps.
- Rear already shows one diagonal from the character-right shoulder
  to the character-left hip.
- Those paths do not physically connect.

## What this pass did

Rebuilt from the hash-verified `/tmp` original. Did **not** flatten
fused strap verts. The first flatten pass shredded the mesh and is
not reused.

1. Paint-only hide of the **front** backpack risers on the Color map.
2. Additive ribbon `Pip_CrossbodyStrap` from the satchel, diagonally
   across the front, over the character-right shoulder, intended to
   meet the original rear diagonal.
3. Original rear diagonal, scarf, satchel, copper spiral, face, eyes,
   crest, wings, and feet were left on the body mesh.

The full scene is not saved as a blend (that file exceeds GitHub’s
100MB limit). Rebuild with:

`scripts/assets/fix_pip_original_strap.py`

A 7MB strap-only blend is stored next to the long-wing candidate.

## Honest visual result

**Not a clean one-path strap yet.**

- Rear: original diagonal is still the correct laterality and is
  intact.
- Front: a new diagonal ribbon is present, but the fused backpack
  risers still ghost. Paint reduces their teal; it does not erase
  raised fused geometry.
- Flattening those risers shreds the mesh. Broader paint hits the
  scarf / bag UV atlas.
- Isolated strap-geometry replacement was not authorized this pass.

Face pixel check vs the untouched original front: mean albedo stays
in the same yellow/cream range. No face hole.

## Proof renders

`artifacts/theatrical-v2/final-character-production/long-wing-original-strap/`

01 front · 02 rear · 03 left · 04 right · 05 front 3/4 · 06 rear 3/4
07 right shoulder · 08 left shoulder · 09 satchel front · 10 satchel rear

## Status

Stop for Justin’s visual approval of this strap pass.
Not production-ready. Not canon. Not theatrical-bound. Not merged.
Paid resources: not used.
