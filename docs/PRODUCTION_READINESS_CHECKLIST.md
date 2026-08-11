# Production Readiness Checklist

Use `/readiness` as the live dashboard.

## Pip (`CHAR_PIP_001`)

- [ ] Canon READY (seeded)
- [ ] Model `.blend`/`.glb` uploaded + validated
- [ ] Rig approved
- [ ] Facial rig + visemes approved
- [ ] Textures/materials resolve
- [ ] Immutable primary reference approved
- [ ] Voice provider + voice ID configured
- [ ] Voice auditioned + approved

## Goat (`CHAR_GOAT_001`)

Same checklist as Pip.

## Locations / sets

- [ ] Meadow environment blend
- [ ] Lighting setup
- [ ] Variants (day/night/weather) noted
- [ ] Approved screenshots

## Pipeline systems

- [ ] STRICT_CHARACTER_LOCK = true
- [ ] DOODLE_DASH_SHORTS profile present
- [ ] Vertical-slice episode seeded
- [ ] Blender worker running for real drafts
- [ ] Publishing integration authorized only if auto-publish desired (default: package only)

## Blocked until you supply

1. Real character production files  
2. Real approved references  
3. Real TTS voice IDs  
4. Live Blender execution for any claimed render  
5. Optional: Sora/Seedance credentials (native 3D remains primary; no silent AI fallback)  
