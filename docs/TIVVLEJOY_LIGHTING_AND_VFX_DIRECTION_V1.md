# TIVVLEJOY_LIGHTING_AND_VFX_DIRECTION_V1

## Lighting

`TIVVLEJOY_LIGHTING_DIRECTION_V1` maps director intent onto existing
storybook presets:

`WARM_INVITING`, `BRIGHT_ADVENTURE`, `SOFT_MYSTERY`, `RAINY_COZY`,
`GOLDEN_DISCOVERY`, `EVENING_FESTIVAL`, `MAGICAL_NIGHT`, `TENSION_COOL`,
`REVEAL_ACCENT`.

Preserved: face, eye, and prop readability, background separation, storybook
look. `gafferRequired=false`, `physicalStarlightRequired=false`. Native
Blender remains the baseline.

Continuity detects `KEY_DIRECTION_FLIP`, `TIME_OF_DAY_JUMP`,
`COLOR_TEMPERATURE_JUMP`, `EXPOSURE_JUMP`, `BACKGROUND_LIGHT_MISMATCH` and
allows deliberate reveals. Shots are not required to share one exposure.

## VFX

`TIVVLEJOY_VFX_DIRECTION_V1` is metadata only. Semantic types include dust,
leaves, light rays, rain, snow, splash, sparkle, fog, steam, safe cartoon
smoke, confetti, firefly, and water ripple.

Each intent has story purpose, quality tier, layer, duration, density,
character interaction, child-safe cartoon safety, render-cost class, and
`vfxDependencySha256`. `executed=false`. No simulation.
