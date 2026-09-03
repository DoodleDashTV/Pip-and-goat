# Forest lighting/color recovery V1

Partial lighting unlock. Cinematic relighting not started. Ground-cover architecture unchanged.

## Diagnostic matrix (1280×720, 12 samples)

| Still | Floor avg RGB | R−B | Reading |
|---|---|---|---|
| BASELINE | 61.7, 67.3, 59.0 | 2.7 | V6 gray/olive |
| EXPOSURE 1.40 | 76.1, 83.0, 73.1 | 3.0 | Brighter, no brown gain |
| WORLD HDRI 0.08 | 50.6, 52.3, 43.2 | 7.4 | Only diagnostic that increased earth separation |
| KEYFILL fill/bounce cut | 40.5, 47.8, 43.7 | −3.2 | Worse. Cool HDRI dominates |
| NEUTRAL REF | 12.6, 10.6, 7.0 | 5.6 | Underexposed; not a fair studio match |

## Root cause

HDRI spectral/color contamination + excessive world strength (0.58).

Not underexposure alone. Not excessive fill. Warm bounce was helping; cutting it made the floor bluer.

## Production candidates (1280×720, 20 samples)

| Proof | Change | Floor RGB | R−B | Class |
|---|---|---|---|---|
| V1 | HDRI 0.26, exp 0.88 | 59.1, 62.5, 53.2 | 5.8 | FAIL — still pale gray |
| V2 | HDRI 0.12, exp 1.10 | 60.7, 63.1, 52.8 | 7.9 | FAIL — sandy gray |
| V3 | V2 + fill (0.82,0.78,0.70) | 67.6, 64.0, 47.4 | 20.2 | FAIL — khaki/dusty earth, not unmistakable forest soil |

Isolated lookdev ground ~113,107,95 R−B≈18. V3 matches chroma numerically but the locked frame still reads as dry dusty ground with flat gray litter stamps.

## EcoKit noise

First suppress hid Tree_5 (shared firefly image graphs). Reverted. TJ_ProdFlower hide found no visible objects. Rainbow specks remain in the midground.

## Locks held

Camera / lens / water / terrain / ground-cover architecture / vegetation architecture / HDRI file: unchanged.

`forestMaterialsProductionReady=false`. Do not emit `FOREST_MATERIAL_RECOVERY_CAMERA_PROOF_V3.png`. Cinematic lighting not started.
