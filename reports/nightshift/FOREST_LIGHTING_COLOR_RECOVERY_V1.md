# Forest lighting/color recovery V1

Partial lighting unlock. Cinematic relighting not started. Ground-cover architecture unchanged.

## Diagnostic matrix (1280×720, 12 samples, unpaid CPU)

| Still | Floor avg RGB | R−B | Reading |
|---|---|---|---|
| BASELINE | 61.7, 67.3, 59.0 | 2.7 | V6 gray/olive. No salmon. |
| EXPOSURE (1.40 / gamma 1.00) | 76.1, 83.0, 73.1 | 3.0 | Brighter, no brown gain |
| WORLD (HDRI 0.08) | 50.6, 52.3, 43.2 | **7.4** | Only test that increased earth separation. Darker sky/bark. |
| KEYFILL (fill 140, bounce 50) | 40.5, 47.8, 43.7 | **-3.2** | Worse. Cool HDRI dominates when warm bounce is cut. |
| NEUTRAL REF | 12.6, 10.6, 7.0 | 5.6 | Underexposed. Not a fair studio match at this camera distance. |

## Root cause

HDRI spectral/color contamination + excessive world strength (0.58).

Not underexposure alone. Not excessive fill. Warm bounce was helping earth; cutting it made the floor bluer.

## Production candidate V1

Smallest change matching the WORLD signal:

* hdriStrength 0.58 → 0.26
* exposure 0.65 → 0.88 (compensate darker world)
* lights / AgX / ground cover unchanged

## EcoKit noise

First suppress pass hid `Tree_5_004.001` and `Tree_5_004.002` because shared EcoKit graphs reference firefly images. That was wrong. Trees are now excluded. Rainbow midground dots remain and are still under investigation (likely tiny TJ_ProdFlower cards, not fireflies).
