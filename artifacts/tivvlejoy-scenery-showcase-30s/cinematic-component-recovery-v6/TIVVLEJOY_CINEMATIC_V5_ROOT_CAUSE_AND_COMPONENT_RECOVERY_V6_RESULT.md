# TIVVLEJOY_CINEMATIC_V5_ROOT_CAUSE_AND_COMPONENT_RECOVERY_V6_RESULT

starting branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
starting SHA: `f75291e84d43d4e6563adbc4a8c06967e0705325`
final branch: `cursor/tivvlejoy-scenery-showcase-30s-v1-73f1`
final SHA: 48b506624fb73d1c856198167837db9710757857
PR state: OPEN / DRAFT / UNMERGED / NOT READY (#169)

## FAIL_FAST

guardrails present: YES

- `config/tivvlejoy-scenery-fail-fast-policy.json`
- `scripts/blender/scenery/pipeline_guardrails.py`
- `scripts/blender/scenery/pipeline_guardrails_test.py`
- `scripts/cloud/scenery-showcase-30s/quality-guardrails.ts`
- `.github/workflows/tivvlejoy-scenery-fail-fast-guardrails.yml`
- `docs/tivvlejoy-scenery-fail-fast-standard.md`

tests:

- `python3 pipeline_guardrails_test.py` PASS
- `python3 cinematic_standards_test.py` PASS
- `python3 cinematic_riverbank_v1_test.py` PASS
- `python3 cinematic_meadow_v1_test.py` PASS
- `python3 cinematic_v6_issues_test.py` PASS
- `python3 cinematic_shoreline_v1_test.py` PASS
- `python3 cinematic_meadow_v2_test.py` PASS
- `python3 cinematic_water_lock_v1_test.py` PASS
- `python3 cinematic_louis_apron_v1_test.py` PASS
- `python3 cinematic_style_unifier_v1_test.py` PASS
- `python3 fail_fast_verify_v1.py` allPass True

two-strike decisions: all seven keys `ROOT_CAUSE_AUDIT_REQUIRED`

| issue | prior incremental fails | decision |
|---|---|---|
| ISSUE_SHORELINE_HARD_CUT | V3 isoline; V5 vertex-color wet/olive; V5 earth-olive lerp | ROOT_CAUSE_AUDIT_REQUIRED |
| ISSUE_WATER_DARK_CHEAP | V33-V34 IOR lock; V5 surroundings-only beauty | ROOT_CAUSE_AUDIT_REQUIRED |
| ISSUE_MEADOW_SCATTER_READ | V3 colored plane; V5 Botaniq clump scatter | ROOT_CAUSE_AUDIT_REQUIRED |
| ISSUE_BOTANIQ_STYLE_MISMATCH | V5 prefix grade tagged 0; V5 image-name still 0 in log | ROOT_CAUSE_AUDIT_REQUIRED |
| ISSUE_LOUIS_APRON_CLIP | V3 south-Y delete; V5 keep clip / no fog cover | ROOT_CAUSE_AUDIT_REQUIRED |
| ISSUE_HERO_CARD_VISIBILITY | V3 EcoKit cards; V5 willow as closest hero | ROOT_CAUSE_AUDIT_REQUIRED |
| ISSUE_BUILDING_SOURCE_QUALITY | V3 source maps; V5 recede still game-kit | ROOT_CAUSE_AUDIT_REQUIRED |

## ROOT CAUSE

### shoreline
actual cause: The razor is not a terrain cavity. V5 geometry is already continuous. Final pixels fail because (1) the water prism silhouette is an independently traced edge, (2) bank albedo stays one brown family across the 1.9 m lerp so the land reads as a single mass, (3) Fresnel / HDRI highlight traces that edge as a bright line, (4) dressing parked away from the real waterline in V5, and in V6 the in-frame cues (EcoKit copies + icosphere gravel) read as placeholders, not a physical wet-to-dry belt.
repair: `TJ_SHORELINE_TRANSITION_V1` + `point_on_south_shore` + overlapping band recipe. Isolated crop still FAIL. Next repair cannot be another brown lerp. The visible belt must be built from grass-root / dry / damp / wet / gravel / stone / submerged / bed objects that occupy real width in the crop, and the water edge must be hidden by those objects rather than drawn as a mesh outline.

### water
actual cause: Locked D physics (IOR 1.33, transmission 0.80, metallic 0, specular 0.50, 18 cm prism, volume density 0.18) are not the primary failure. Controlled A/B/C show the cheap read comes from dark absorption colour + weak bed albedo/depth + HDRI reflection dominating a thin prism + almost no expensive surroundings. Bed never becomes a selected reveal.
repair: WATER_TEST_A brighter bed + lighter absorption colour. WATER_TEST_B HDRI rotation + far-bank beech foil, V5-dark bed. WATER_TEST_C intended balance. All three FAIL in pixels. Selected from pixels: none pass. Do not unlock physics. Next work must rebuild the visible bed as a quality component and give the prism something worth transmitting.

### meadow
actual cause: Real Botaniq clumps still read as a scatter algorithm because the foundation is not a continuous carpet in the crop. V2 density fields exist in code; the rendered frame is discrete tufts on a painted olive plane with sky-heavy framing.
repair: `TJ_MEADOW_SYSTEM_V2` overlapping foundation / medium / tall / fern masses. Isolated crop still FAIL. Next repair is coverage and camera, not more equal-size clumps.

### vegetation/card visibility
actual cause: Botaniq leaf cards as construction are acceptable. The hard fail is perceptible planar read at hero distance. Willow as closest hero makes that unavoidable. Beech (`Fagus-sylvatica_A_summer`) is denser, more irregular, and less card-like on phone.
repair: Willow moved to support in the isolated vegetation scene. Beech used as closest hero. Isolated beech is the best of the A–F set but still FAIL for world-integrated style (clinical plane, asset-pack still). Do not buy vegetation.

### style mismatch
actual cause: V5 graded 0 materials because Botaniq material names are not `bq_*`. Image/filepath matching is required. Isolated unifier now detects Botaniq maps. That does not by itself produce a premium stylized-CGI world.
repair: `TJ_ENVIRONMENT_STYLE_UNIFIER_V1` (sat 0.82, roughness lift, spec cap, normal scale). Applied in shoreline / meadow / vegetation diagnostics. Not proven in a shared world. Do not flatten maps. Do not make Louis photoreal.

### Louis artifact
actual cause: V5 `clip_louis_world_apron` deleted every vertex south of a world Y. That includes the visible grassy foot after `sit_louis_peak`, so HDRI shows as wedges. V6 conservative clip (south AND low-Z only) still deleted that visible foot. The artifact is not an unused hidden skirt that can be safely sheared. It is the sat mountain’s south-facing base.
repair: Non-destructive mesh copy + conservative clip implemented and tested in isolation. Isolated mountain crop still FAIL (jagged hole + sky wedges obvious on phone). Next repair: do not delete the visible south slope. Occlude unused skirt with terrain, or move the mass north and frame so the foot is out of crop. No fog camouflage. Do not restyle `LP_GrassyMountain2`. Do not mutate the purchased blend on disk.

### building
locked distance verdict: Village Cabin04A LOD0 is REJECT at hero distance, MIDGROUND acceptable. Status remains `OWNED_BUILDING_ASSET_UPGRADE_REQUIRED`. Isolated crop framed the cabin as the subject and therefore looks game-kit. That does not reopen a hero-building attempt. No purchase.

## COMPONENT PROOFS

shoreline: FAIL
path: `artifacts/tivvlejoy-scenery-showcase-30s/cinematic-component-recovery-v6/A_SHORELINE_TRANSITION.png`
phone: `.../A_SHORELINE_TRANSITION_PHONE.png`

water/bed: FAIL
path: `artifacts/tivvlejoy-scenery-showcase-30s/cinematic-component-recovery-v6/B_WATER_WATER_TEST_C.png`
also: `B_WATER_WATER_TEST_A.png`, `B_WATER_WATER_TEST_B.png` (A/B/C all fail)

meadow: FAIL
path: `artifacts/tivvlejoy-scenery-showcase-30s/cinematic-component-recovery-v6/C_MEADOW_SYSTEM_V2.png`

vegetation: FAIL
path: `artifacts/tivvlejoy-scenery-showcase-30s/cinematic-component-recovery-v6/D_VEGETATION_STYLE.png`
note: beech denser than willow; still not a world-integrated pass

mountain: FAIL
path: `artifacts/tivvlejoy-scenery-showcase-30s/cinematic-component-recovery-v6/E_MOUNTAIN_LOUIS.png`

building: FAIL
path: `artifacts/tivvlejoy-scenery-showcase-30s/cinematic-component-recovery-v6/F_BUILDING_SUPPORTING.png`
locked policy: supporting / midground only; do not hero this asset

## FULL HERO ASSEMBLED
NO

reason: A–F did not all pass. Fail-fast forbids assembling `TJ_HERO_V6_WORLD` or rendering another 1080×1920 hero after failed component proofs.

## FINAL HERO PATH
none

## FINAL SELF-ASSESSMENT

professional first impression: NO
premium animated-feature: NO
promotional still: NO
vegetation: NO (beech direction only)
meadow: NO
riverbank: NO
water: NO
mountain: NO
atmosphere: NO (not applied as camouflage; mountain geometry still broken)
default Blender: YES
game engine: YES
procedural: YES
asset-pack: YES
hero-card appearance: PARTIAL (beech better than willow; not cleared)
razor shoreline: YES (still present)
mountain artifact: YES (still present)

## DEGRADATIONS / FALLBACKS / SKIPPED SOURCES

- No hero fallback to Village trees, EcoKit flora, Forest Nature, FBX, or OBJ.
- EcoKit rock *materials* were replaced on instance mesh copies (source blend untouched) because native stylized mats read cyan/plastic. Geometry still faceted at creek scale.
- Acer not extracted; Quercus A summer is a stub. Beech used as owned hero candidate.
- 3DT mountains not loaded (photoreal; SHOT_05 Louis lock retained).
- HDRI remains `HDRi_JPG_Pack/sk2/Image0001.jpg` (70 MB `.hdr` still crushed frames).
- No purchases.
- No RunPod.

live pods: []
paid CREATE: 0
RunPod spend: $0
motion proof: not started
final video: not authorized

CINEMATIC_V6_COMPONENT_QUALITY_FAILED
FINAL_VIDEO_RENDER_NOT_AUTHORIZED
