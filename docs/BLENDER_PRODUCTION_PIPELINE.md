# Blender Production Pipeline

Native 3D is the primary path. Modular scripts live under `scripts/blender/`.

## Shot packages

`ShotPackageService` converts a shot into a deterministic package with modular components:

- character placement / body / facial / eye / mouth
- camera placement + animation
- environment + props
- lighting / VFX / transitions

Worker executes package instructions; it does not invent missing character meshes.

## Render profile

Default Shorts profile: **DOODLE_DASH_SHORTS** → 1080×1920, 9:16, 30 FPS.

## Worker

`workers/blender-renderer` claims jobs from the render queue. Real frames are only reported when Blender actually produces them.

## What you need to provide next

1. Uploaded Pip/Goat/location `.blend` files that load in Blender  
2. Confirm armature names + facial shape key names for lip-sync mapping  
3. Run Blender worker against a draft shot package  
4. Verify EEVEE draft, then Cycles/final when ready  
