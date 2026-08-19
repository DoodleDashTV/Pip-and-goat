# TivvleJoy storybook preview validation

Checkpoint: `TIVVLEJOY_STORYBOOK_PREVIEW_VALIDATION_V1`

Stacked on `TIVVLEJOY_STORYBOOK_ENVIRONMENT_SYSTEM_V1` (Draft PR #70).

This milestone proves the storybook art-direction contracts with
**synthetic, unlicensed fixtures only**. It does not process purchased
scenery, Botaniq, or any other commercial source bytes.

## Synthetic fixture world

A deterministic village / main-street fixture (`seed 4170179`) includes:

- three facades: bakery storefront, map/shop storefront, cottage
- road, sidewalk, fountain, flower boxes, benches, crates, baskets,
  lanterns, fences, and background vegetation
- internal signage templates (hanging, wall, round at minimum)
- every semantic material class from wall through ground

No fixture claims Production approval.

## Quality-tier proof

Cameras are authored so projected coverage matches:

- HERO >= 20%
- SUPPORTING 5–20%
- BACKGROUND < 5%

Texture policy stays 2048 / 2048 / 1024 unless a later reviewer justifies
4096 for HERO. Hero items cannot become `STYLIZED_APPROVED` from this
automation (`BLOCKED_HERO_AUTO_APPROVAL`).

## Signage and dressing

All five sign templates have passing fixtures at the 1080x1920 critical
targets. Contrast and occlusion failures emit `CRITICAL_SIGN_UNREADABLE`.

Dressing anchors are exercised. HERO 4–8 clusters pass when obstruction
<= 10%, walkable width >= 80%, and identical copies <= 3. Deliberate
negative fixtures fail closed.

## Lighting

All seven native presets resolve. No commercial lighting plugin is
required. This environment does **not** run Blender; Eevee preview frames
are therefore **not claimed**.

## Preview ladder

A. static/schema validation  
B. scene-plan validation  
C. viewport / synthetic fixture validation  
D. 270x480 thumbnail QC (manifest / synthetic glyph)  
E. 540x960 review frame only if local execution exists  
F. visual scoring  
G. approval receipt  

1080x1920 FINAL frames are not generated. RunPod is not contacted.

## Contact sheet

A deterministic manifest lists clean thumbnail, overlay, day, evening,
HERO / SUPPORTING / BACKGROUND, signage pass/fail, and dressing pass/fail
slots. Evidence is `SYNTHETIC_MANIFEST_ONLY` unless a later local render
exists. A tiny labeled SVG glyph may be generated in-memory. It is not a
Blender render.

## Shot approval

Uses `TIVVLEJOY_SHOT_VISUAL_REPORT_V1` and
`TIVVLEJOY_SHOT_VISUAL_APPROVAL_V1`.

- 95–100 `VISUALLY_EXCELLENT`
- 90–94 `VISUALLY_APPROVED`
- 85–89 `REVISION_REQUIRED`
- <85 `VISUAL_REJECT`

A hard blocker always wins. Score 100 + blocker does not pass.
Receipts always include `shotId`, `shotDependencySha256`, `score`,
`result`, `hardBlockers`, and `visualApprovalVersion`.

## RunPod contract compatibility

This branch does **not** merge the RunPod readiness history.

A fixture/schema check proves that a valid visual-approval receipt has
exactly the fields later consumed by
`TIVVLEJOY_RENDER_BACKEND_READINESS_V1`:

`schemaVersion`, `visualApprovalVersion`, `shotId`,
`shotDependencySha256`, `score`, `result`, `hardBlockers`.

A mismatched `shotDependencySha256` is
`BLOCKED_VISUAL_APPROVAL_STALE`. Paid authorization is not enabled and
no executor is imported.

## Complexity estimates

Planning-only: visible triangles, texture VRAM, unique materials,
shadow-casting lights, volumetrics, transparent surfaces, scatter
density. These are not live RunPod price quotes.

## Safety

No paid GPU, no Pod create/delete, no provider mutation, no Production
mutation, no Pip/Goat or voice mutation, no Geo-Scatter, no Botaniq.
