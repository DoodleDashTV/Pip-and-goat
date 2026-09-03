# Forest sunny-afternoon tree-detail recovery

Human review rejected `FOREST_CINEMATIC_LIGHTING_CAMERA_PROOF_V1.png` (gray sky, soft clumped canopies, not a sunny afternoon).

`paidCreateCount=0`. `paidSpendUsd=0`. No final video.

## What changed

Camera-visible EcoKit `Sky_World_2.png` via Light Path mix. Lighting HDRI strength stays 0.12. Mist/volume haze off. Warmer, stronger key sun. Flora/treeleaf intensity and bark contrast lifted. Ground dressing and ProdFlower hide unchanged.

## Proofs (do not overwrite)

| Proof | SHA256 | Sky gap RGB | B−R | Class |
|---|---|---|---|---|
| V1 | `715842a5883ebb408625e7c5d927d0a5893320c49e4797d6a1d630b2fd44fff3` | 128.5, 151.1, 170.6 | 42.1 | FAIL — blue present but pale; canopy still soft |
| V2 | `bb66eaf79eb8422260fce5be8245fad8990a616ea90f65e2a075c2f9678d31ba` | 154.6, 172.8, 186.8 | 32.2 | FAIL — brighter/bluer gap, clouds still not readable at 1280×720; canopies still clumped |

Locked 42 mm camera, 1280×720, 24 samples, unpaid CPU.

## Why this is not PASS

The locked camera looks through a dense canopy. Only a small sky gap is visible. That gap is now blue (B>R) vs cinematic V1's gray/green, but it does not yet read as a pretty sunny afternoon with soft clouds. Tree canopies remain soft/clumped at this resolution. Ground chroma held (floor R−B ≈ 18, no salmon). Magenta ProdFlower pixels = 0.

Do not claim `sunnyAfternoonMoodPassed=true` from statistics. The production-camera image does not yet demonstrate the requested look.

## Locks held

camera / lens / terrain / water / composition / ground dressing / ProdFlower hidden / photo stamps not reintroduced.

## Next

Further sky/cloud readability from this camera likely needs either a different EcoKit sky mapping that puts larger cloud forms in the visible gap, or authorized canopy leaf-card density work. Do not start final video.
