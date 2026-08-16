# Stage 9/10 — validation (honest)

Blender 4.2.3 LTS. Software GL. Khronos PBR Neutral. 1080×1920.

## Ran

- Five-view ortho turnarounds for Pip and Goat
- Face close-ups
- Pair front / 3/4 / side
- Neutral, daylight, warm-interior, cinematic front lighting
- Aligned proposed-vs-binding sheets with 42% overlay and silhouettes
- Phone contact sheet
- File reopen of working and high-res blends in this environment
- Scale measurement: Goat / Pip = 1.500
- Laterality review on front / 3/4 / pair

## Did not run (blocked)

- Wing spread/fold
- Walk / run / jump
- Blink / eye-direction / expression / lip-sync
- Satchel strap deformation through acting poses
- Scarf / compass deformation
- Pair acting (map, dialogue, contact)
- 30 FPS motion tests
- Clean interchange import of a production mesh (none exists)
- Non-manifold = 0 on a delivery mesh

## Technical facts that did pass

- `primitive_rebuild_used`: false
- `canonical_mutated`: false
- `theatrical_bound`: false
- `merge`: false
- `paid_resources`: false
- Original package files untouched
- Working blends preserved as rollback
- High-res blends reopen locally
- Goat Color map is an external PNG; Normal/ORM remain packed on Goat

## Comparison conclusion

No exact match is claimed. The Prism candidates are far closer to the
binding sheets than the rejected primitive rebuild. Major remaining
mismatches are volume, Pip wing rest pose, Pip extra crest stubbles, and
the lack of production topology/rigs. See `REMAINING_GAPS.md`.
