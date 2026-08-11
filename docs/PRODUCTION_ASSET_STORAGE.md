# Production Asset Storage

## Prefixes

| Prefix | Contents |
|--------|----------|
| `canonical-references/` | Pip/Goat PRIMARY JPEGs, turnarounds, expression sheets |
| `character-models/` | `.blend` / `.glb` / `.gltf` / `.fbx` candidates |
| `textures/` | Texture / material uploads |
| `rigs/` | Rig / facial shape-key packages |
| `facial-maps/` | Facial mapping artifacts |
| `environments/` | Meadow and other location blends |
| `props/` | Prop models |
| `voices/` | Voice assets |
| `audio/` | Episode audio |
| `draft-renders/` | Draft frames/videos + character test renders |
| `final-renders/` | Final frames / MP4 |
| `captions/` | SRT |
| `thumbnails/` | Thumbs |
| `reports/` | QC / cost reports |
| `manifests/` | Locked production manifests |
| `worker-tests/` | Storage / Blender self-tests |

## Metadata recorded per upload

- original filename
- storage object key
- SHA-256
- size
- MIME type
- entity association (character / location / prop)
- version
- upload timestamp
- approval status
- immutable flag where appropriate (approved reference versions)

Approved production versions are **never overwritten**. Replacements create a new candidate version.

## Render / manifest outputs

Draft/final orchestrators and production manifests call `ProductionStorageService.storeUpload` so artifacts land in durable prefixes (`draft-renders/`, `final-renders/`, `manifests/`, `audio/`, `captions/`) rather than ephemeral agent paths.

## Mobile uploads

iPhone Photos/Files uploads on `/asset-intake` POST multipart to `/api/production/onboarding/upload`, which streams bytes into the configured object storage provider. Operators never need to move files into git.
