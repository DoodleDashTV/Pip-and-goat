# Pip production conversion — stop for Justin

This is a protected conversion copy of the official backpack Pip.
It is **not** production-ready. Draft PR #24 stays draft.
`production-library/` was not replaced. Goat was not touched.

## Source

- Official working blend: `theatrical-foundation/proposed/final-character-production/working/pip_backpack_canonical_working.blend`
- Working blend SHA-256: `581bf48d1d7972e1e7cbea96300bac685a0d38aae82b0f140a2f3bef4cde2dfe`
- Conversion copy: `theatrical-foundation/proposed/final-character-production/conversion/pip_backpack_production_conversion.blend`
- Conversion bytes: `99374550` (under the 100 MB GitHub limit)
- Approved source SHA-256: `dca239475c78c9158ac87c36d674ceb23ef334358ee4394607758fc8f6728696`
- Official working blend was not overwritten.
- Approved inbox parts were not overwritten.

## Audit

- 1,006,107 verts / 1,930,054 faces
- Object scale 2.0935, height 2.05, facing +X, feet on ground
- One UVMap
- Color 8192×8192, Normal 4096×4096, ORM 4096×4096
- No voxel remesh, no primitive rebuild, mesh datablock not rewritten

## Islands

- 463 disconnected components
- Actual new object: `pip_conversion_backpack` only
- About 77k rearward island verts were grouped into that object
- Straps and scarf remain fused
- The main backpack volume is not fully isolated

## Validation armature

- Name: `pip_conversion_validation_rig`
- Quality: validation only
- Not in the rig registry
- Not bound as the live Pip rig
- Body uses bone envelopes
- Separated backpack object is bone-parented

## Rest comparison

Phone stills: `artifacts/theatrical-v2/final-character-production/pip-production-conversion/phone/`

Approved identity stills: `artifacts/theatrical-v2/final-character-production/pip-visual-identity/phone/`

Downscaled mean channel delta, approved vs conversion rest:

| view | delta |
| --- | ---: |
| front | 0.0757 |
| rear | 0.0723 |
| left | 0.0610 |
| right | 0.0618 |
| three_quarter | 0.0621 |

Those numbers are mostly framing. Conversion cameras fill more of the frame.
The likeness matches the approved backpack Pip. Numeric closeness is not approval.

## Deformation tests

Rest vs posed front, same camera math:

| pose | delta |
| --- | ---: |
| wing_fold | 0.0002 |
| head_turn | 0.0002 |
| foot_lift | 0.0002 |
| strap_shift | 0.0002 |
| scarf_sway | 0.0002 |
| backpack_sway | 0.0598 |

Envelope bones did not visibly move the fused body. `backpack_sway` changed
framing because the bone-parented islands shifted the bounds. That is not a
finished deformation-safe backpack.

## Still closed

- production-ready claim
- production-library replace
- theatrical bind
- Draft PR merge
- live rig registry bind
- voxel remesh / primitive rebuild
- Goat
- paid resources
