# TivvleJoy storybook environment system

Checkpoint: `TIVVLEJOY_STORYBOOK_ENVIRONMENT_SYSTEM_V1`  
GitHub Issue #67

This is the zero-cost software foundation that turns purchased scenery into a
consistent TivvleJoy storybook environment. Purchased assets remain raw source
material. Original commercial bytes stay immutable and are never committed.

Pipeline: SOURCE → INSPECT → NORMALIZE → CLASSIFY → STYLIZE → DRESS → LIGHT →
QUALITY TIER → SHOT VALIDATE → VISUAL PREVIEW → APPROVAL → REUSABLE LIBRARY.

This PR implements contracts, dry-run plans, and Preview UI only. It does not
run Blender on commercial files, approve hero scenery from missing renders, or
integrate Geo-Scatter.

## Material stylization

Semantic classes include wall, roof, wood, glass, metal, stone, road_path,
cloth, foliage, flower, water, sign, window, door, prop, and ground.

Rules remap palette, normalize roughness, clamp normals, and reduce grime.
Low-confidence hero materials require manual review and are never destructively
altered. Source UVs and geometry stay preserved.

## Shape softening

Allowed dry-run operations: controlled bevels, smooth shading, compatible
weighted normals, softened silhouettes, optional trim or awning emphasis.
Forbidden: voxel remesh or Quadriflow on hero architecture, UV destruction,
destructive edits, source overwrite.

## Signage

Templates: hanging, wall, round, awning, wood post. Classes: story-critical,
world-building, decorative. Internal icon categories only.

At 1080x1920, story-critical signs need text cap height >= 36 px, icon height
>= 64 px, contrast >= 4.5:1, perspective <= 35°, and zero critical occlusion.

## Dressing and native scatter

Deterministic anchors and dressing categories use seeded plans. Density:
HERO 4–8 clusters, SUPPORTING 2–5, BACKGROUND 0–3. Performance-zone
obstruction <= 10%. Walkable width >= 80%. At most 3 identical visible copies.

Default scatter provider is `NATIVE_BLENDER` Geometry Nodes / instances.
Geo-Scatter is not integrated and not downloaded.

## Lighting

Native presets: morning warm, day adventure, golden hour, overcast soft, rainy
cozy, evening festival, magical night. No commercial lighting plugin is
required.

## Quality tiers

Automatic start: HERO >= 20% frame height or story/focal tag, SUPPORTING 5–20%,
BACKGROUND < 5%. Manual override is supported. Texture targets: 4096 only when
justified for HERO, 2048 supporting, 1024 background.

## Shot visual approval

`TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1` / `TIVVLEJOY_SHOT_VISUAL_REPORT_V1`.

Weights: focal 20, Pip/Goat 20, 9:16 15, lighting 15, palette 10, dressing 7,
tier 7, signage 3, kid readability 3.

95–100 excellent, 90–94 approved, 85–89 revision, <85 reject. A hard blocker
always wins. The report includes `shotDependencySha256` so a later Render Queue
can reject stale approvals.

## Kid readability and 9:16

Audience ages 5–10. One primary story action. Dialogue-safe 1080x1920
composition. Canonical characters are excluded from scenery palette scoring.

## Location presets and world graph

Versioned presets: home village, main street, bakery, map shop, forest exit,
river road, amusement entrance. World nodes are generic and do not require a
purchased pack.

## Batch reuse, cache, complexity, temporal QC

Shots group by location and lighting. Derivative identity is
source SHA + style version + Blender version + transformation policy.
Complexity estimates stay planning-only. Temporal QC is a future-check
contract, not rendered evidence.

## License / provenance

Statuses: VERIFIED_ALLOWED, VERIFIED_RESTRICTED, UNKNOWN_REVIEW_REQUIRED.
Unknown permissions fail closed for the disputed workflow. Raw purchased assets
are never redistributed.

Optional tools (Physical Starlight, Gaffer, botaniq, KitBash, Geo-Scatter, Poly
Haven, shop packs) are not assumed. Native Blender remains the baseline.

## Future real Blender pass

A later milestone may execute inspect / stylize / preview frames after licensed
sources are present. This PR must not claim that rendered evidence exists.

## Future real visual approval

`TIVVLEJOY_SHOT_VISUAL_REPORT_V1` is compatible with the Render Queue adapter
expected by `TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1` (`shotId`,
`shotDependencySha256`, `score`, `result`, `hardBlockers`, approval version).
A later paid or rendered pass may fill pixel measurements. This PR uses
synthetic fixture inputs only and does not approve hero scenery from missing
frames.

See also `docs/TIVVLEJOY_STORYBOOK_PREVIEW_VALIDATION_V1.md` for the stacked
synthetic preview-validation milestone.
