# TIVVLEJOY_SOUND_DESIGN_AND_MUSIC_V1

Semantic audio planning only. No copyrighted audio assets are included and
no binaries are generated.

## SFX

`TIVVLEJOY_SOUND_DESIGN_V1` vocabulary covers footsteps, hooves, wing
flutter, rustles, map/paper, doors, wood, bell, cart, water, wind, forest,
birds, rain, thunder, sparkle, pickup/setdown, and comedy bump.

Events carry `sfxEventId`, type, frame, duration, intensity, spatial role,
character/prop/location, priority, and `sfxDependencySha256`.
`audioBinaryIncluded=false`.

Events can be derived from foot/hoof contacts, props, doors, environment,
VFX, and camera-independent story beats.

## Ambience

Layers: village day/night, forest day/rain, river, tavern interior, mountain
wind, festival, soft snow, magical night. Location changes may transition
layers.

## Music

`TIVVLEJOY_MUSIC_CUE_PLAN_V1` roles: opening hook, adventure, curious,
comedy, mystery, tension, discovery, wonder, heartwarming, payoff, ending
button.

Cue data: `cueId`, role, start/end frame, energy, duck-under-dialogue,
transition, story beat refs, `musicDependencySha256`.
`copyrightedAudioIncluded=false`.

## Ducking and mix QC

Dialogue has priority. Duck states: `NO_DUCK`, `LIGHT_DUCK`, `MEDIUM_DUCK`,
`STRONG_DUCK`.

Mix QC is metadata/synthetic: dialogue present and not clipped, music under
dialogue, ambience continuity, SFX density and sync, no duplicate dialogue,
audio end match, accidental silence. `measuredLoudness=false` unless real
media is measured.
