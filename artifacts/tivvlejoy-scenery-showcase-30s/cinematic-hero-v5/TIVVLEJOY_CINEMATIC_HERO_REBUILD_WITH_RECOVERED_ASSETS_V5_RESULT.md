# TIVVLEJOY_CINEMATIC_HERO_REBUILD_WITH_RECOVERED_ASSETS_V5_RESULT

starting branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
starting SHA: `c789e3e3c8b015d277df9f5caa4905a5ca8087c9`
final branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
final SHA: 
PR state: OPEN / DRAFT / UNMERGED / NOT READY (#169)

## BUILDING LIBRARY AUDIT

owned buildings inspected: 15 catalog entries (Village Cabin01A–05A/B, Village FBX, Village Unity HDRP/URP/Built-in, Stylized Tavern Interior + textures, EcoKit, Forest Nature, Louis, 3DT, Botaniq)
best candidate: Village Cabin04A LOD0 (`Building04_LOD0` + `Roof04_LOD0`, roof LOD0 = 2403 verts)
hero/mid/background rating: REJECT / MIDGROUND / n/a
new purchase required: NO (gap reported only)
NO PURCHASE PERFORMED

Status: `OWNED_BUILDING_ASSET_UPGRADE_REQUIRED`

No other owned cabin/cottage/house/shop/barn/hut/stylized exterior exists in the purchased catalog. Tavern is interior-only. Cabin04A was receded to supporting distance `(-20.4, 16.8)` so tiled roof / flat walls / weak porch are not hero pixels.

## TJ_RIVERBANK_GENERATOR_V1

construction: continuous heightfield, meadow → root/grass → dry soil → eroded → damp → wet shelf → gravel → bed → underwater
controls: channel width/depth, bank steepness, L/R asymmetry, erosion, wet-shelf, gravel-bar, soil exposure, rock density/burial, vegetation retreat/overhang, bay/inlet/cut gains, bank height, creek-bed depth
terrain-water intersection: shoreline is TERRAIN ∩ WATER at `WATER_Z = -1.15`; no constructed lip mesh
erosion: 7 irregular south-bank events (bank retreat, soil bay, rock projection, gravel tongue, grass point, wet pocket, runoff cut)
bed: depth pools + gravel/silt tags under locked water
rock integration: 12 EcoKit rocks fitted to 1.65 m (not native 21–33 m); soil / waterline / underwater / vegetated roles
shoreline: still reads as a hard brown/water cut in rendered pixels
cavities: landward samples clamped above water in unit tests; no dry holes in the heightfield

## TJ_MEADOW_SYSTEM_V1

Botaniq assets: Carex A/B, Festuca glauca A/B, Corylus A/B, Dryopteris A/B/D, Rhytidiadelphus A/B
GeoScatter usage: `Meadows/grass_biome_01` and `grass_biome_02` layer recipes only. Addon not enabled.
ecological zones: short grass, medium meadow, tall pockets, bare earth, forest litter, fern/shrub, rocky sparse, worn/open
negative space: forced bare/worn cells in the scatter plan
distance handling: dense camera-wedge (step 0.95), thinner beyond Y ≈ -6

Rendered read: physical clumps exist (not a lime plane). Coverage is still clump-scatter on an earth/olive underlayer, not a finished meadow ecology.

## VEGETATION

hero trees: Salix babylonica A/B (willow)
support trees: Fagus sylvatica A/B (beech) + extra midground beech
ground cover: Carex, Festuca, Dryopteris, moss on selected rocks
visible cards: willow leaves still read as Botaniq cards at hero distance
repetition: A/B variants only (C skipped to avoid sibling-library links)
style integration: intended HSV/roughness grade; runtime tagged 0 materials (Botaniq names do not start with `bq_`). Photoreal trees vs stylized Louis still mismatch.

## WATER

physics: locked — CYCLES, IOR 1.33, transmission 0.80, metallic 0, specular 0.50, prism 18 cm, volume 0.18, variant D
reflection: sky + some tree reflection in FG crop
transmission: present; creek often reads dark
bed visibility: weak in the selected hero pixels
highlights: limited localized sun
bank integration: hard color cut, few visible rocks
beauty: NO — not yet one of the strongest frame elements

## MOUNTAINS

Louis: retained (SHOT_02/05 lock)
3DT test: style inspect only; 1.4 GB photoreal pack not loaded into the hero scene
selected: Louis
integration: distance/haze only. Comp C / BG crop still show apron/clip artifacts. Do not restyle `LP_GrassyMountain2`.

## LIGHTING CANDIDATES

A: warm morning — mountain silhouette artifact, less useful
B: late-afternoon adventure — darker water hole, heavier contrast
C: clean cinematic daylight — clearest Botaniq/meadow/creek read
selected: C

## CAMERA CANDIDATES

A: 34 mm `(2.10, -21.45, 3.02)` → `(-3.45, -10.7, 1.32)` — creek-first, mountain payoff
B: 38 mm lower water-forward — loses mountain
C: 30 mm wider reveal — mountain artifacts, cabin flattening
selected: A

## QUALITY CROPS

foreground: FAIL — Botaniq willow/grass volumetric; razor shoreline; EcoKit rocks not readable
midground: FAIL — meadow clumps exist; Cabin04A still game-kit LOD; not promotional
background: FAIL — Louis artifacts; water/atmosphere do not integrate

## FINAL HERO

camera: A
lighting: C
atmosphere: mist + compositor haze from mood C; no world volume scatter (creek-safe)
resolution: 1080 × 1920
samples: 128 Cycles CPU, denoised, AgX Base Contrast
render time: 11:00 (frame only; world assemble extra)

## FINAL 1080x1920 HERO PATH

`artifacts/tivvlejoy-scenery-showcase-30s/cinematic-hero-v5/SHOT_02_CINEMATIC_HERO_V5_1080x1920.png`

## FINAL SELF-ASSESSMENT

professional first impression: NO
premium animated-feature: NO
promotional still: NO
asset integration: PARTIAL (Botaniq present; Louis/Village not the same world)
vegetation: PARTIAL (source quality up; cards still visible)
meadow: PARTIAL (clumps, not ecology)
riverbank: PARTIAL (system exists; pixel read is still a cut)
water: NO
atmosphere: NO
default Blender: YES
game engine: YES (cabin + mountain read)
procedural: YES (bank color / authored heightfield)
asset-pack: YES
visible hero cards: YES
texture tiling: YES if cabin enters the frame
razor shoreline: YES

## STILL-MISSING SOURCE BLOCKERS

- `OWNED_BUILDING_ASSET_UPGRADE_REQUIRED` — no owned exterior survives SHOT_02 hero distance
- Riverbank geology still does not read (gravel / wet shelf / creek-scale rocks)
- Botaniq ↔ Louis style grade not applied in-render
- Meadow still needs continuous coverage without becoming a green plane
- Louis apron/clip artifacts remain at some cameras (do not restyle the SHOT_05 hero mountain)

live pods: []
paid CREATE: 0
RunPod spend: $0
motion proof: NOT STARTED
final video: NOT AUTHORIZED

```
CINEMATIC_HERO_V5_VISUAL_QUALITY_FAILED
FINAL_VIDEO_RENDER_NOT_AUTHORIZED
```
