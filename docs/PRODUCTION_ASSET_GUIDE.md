# Production Asset Guide

This guide lists exactly what you must upload for Doodle Dash Studio production.

## Non-negotiable rules

- Do **not** invent Pip or Goat models.
- Empty slots must stay `PRODUCTION ASSET REQUIRED`.
- `STRICT_CHARACTER_LOCK` remains enabled.
- Use Asset Intake UI (`/asset-intake`) or `POST /api/production/intake`.

## Pip (`CHAR_PIP_001`) — upload these

| Kind | File types | Notes |
|---|---|---|
| `CHARACTER_BLEND` | `.blend` | Preferred production master |
| `CHARACTER_GLB` / `CHARACTER_GLTF` | `.glb` / `.gltf` | Exchange / preview |
| `CHARACTER_FBX` | `.fbx` | Optional if needed for tooling |
| `TEXTURE` | image maps | Must resolve in Blender |
| `MATERIAL` | Blender materials / packed maps | |
| `RIG` | armature in blend or separate | Must be approved in registry |
| `FACIAL_SHAPEKEYS` | shape keys / blendshapes | Required for lip sync |
| `REFERENCE_IMAGE` | png/jpg | See Character Reference Guide |
| `TURNAROUND` | sheet images | Front/side/back |
| `EXPRESSION_SHEET` | sheet images | |
| `POSE_REFERENCE` | images | |

Also register checksum, source, notes. Approve only after visual QA.

## Goat (`CHAR_GOAT_001`) — same kinds as Pip

Same intake kinds and approval workflow. No shared fake mesh.

## Locations

For each location (start with `LOC_MEADOW_001`):

- `LOCATION_BLEND` environment model
- `LOCATION_PROP` set dressing / props
- `TEXTURE`
- `LIGHTING_SETUP`
- `REFERENCE_IMAGE` approved screenshots
- Day/night + weather via existing location variants (do not rebuild geometry)

Reusable set architecture: one master blend + variants; episodes reference the location ID rather than regenerating worlds.

## API example (register missing stays honest)

```bash
curl -X POST http://localhost:3000/api/production/intake \
  -H 'content-type: application/json' \
  -d '{
    "universeId":"11111111-1111-4111-8111-111111111111",
    "entityType":"character",
    "entityId":"<pip-uuid>",
    "kind":"CHARACTER_BLEND",
    "markMissing":true
  }'
```

When you have a real file path/object key:

```bash
curl -X POST http://localhost:3000/api/production/intake \
  -H 'content-type: application/json' \
  -d '{
    "universeId":"11111111-1111-4111-8111-111111111111",
    "entityType":"character",
    "entityId":"<pip-uuid>",
    "kind":"CHARACTER_BLEND",
    "originalFilename":"pip_master.blend",
    "storageLocation":"file:///absolute/path/pip_master.blend",
    "source":"artist-drop",
    "notes":"v1 production master"
  }'
```

## What you need to provide next

1. Pip production `.blend` (rigged) + textures + facial shape keys  
2. Goat production `.blend` (rigged) + textures + facial shape keys  
3. Meadow environment `.blend` + lighting setup  
4. Adventure Map prop mesh (optional but used by vertical slice)  
5. Approved turnaround / expression reference images for Pip and Goat  
