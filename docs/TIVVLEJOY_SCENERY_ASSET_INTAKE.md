# TivvleJoy Scenery Asset Intake

Checkpoint: `TIVVLEJOY_SCENERY_ASSET_INTAKE_V1`

This pass connects the scenery foundation to the existing private Cloudflare R2 durable-storage system. It does **not** place licensed binaries in Git and does **not** claim that purchased files were uploaded, inspected, normalized, or approved unless those operations actually ran against real bytes.

## Existing R2 reuse

TivvleJoy already has verified Cloudflare R2 durable storage for this studio. Intake reuses that provider through the existing helpers in `packages/shared/src/object-storage.ts`.

Do not create a second bucket or storage provider.

Primary environment names:

- `OBJECT_STORAGE_PROVIDER` (`r2` or `s3`)
- `OBJECT_STORAGE_ENDPOINT` or `R2_ENDPOINT`
- `OBJECT_STORAGE_REGION` or `R2_REGION` (`auto` is accepted)
- `OBJECT_STORAGE_BUCKET` or `R2_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID` or `R2_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY` or `R2_SECRET_ACCESS_KEY`

Optional prefix and policy names:

- `TIVVLEJOY_SCENERY_ASSET_PREFIX` (default `tivvlejoy-assets`)
- `TIVVLEJOY_SCENERY_SIGNED_TTL_SECONDS`
- `TIVVLEJOY_SCENERY_MAX_UPLOAD_BYTES`
- `TIVVLEJOY_SCENERY_MULTIPART_PART_BYTES`
- `TIVVLEJOY_SCENERY_MAX_CONCURRENT_PARTS`
- `TIVVLEJOY_SCENERY_MAX_RETRIES`

Never commit real values. Never expose these values to client code.

Configuration states: `configured`, `partially_configured`, `unavailable`, `invalid`. Credential contents are never printed.

## Private prefix layout

```
tivvlejoy-assets/
  source/
    village/
    sky-hdri/
    stylized-forest/
    procedural-nature/
  quarantine/
  inspection/
  normalized/
  proxies/
  previews/
  catalogs/
  scenes/
  licenses/
  reports/
```

Source objects are immutable after successful verification. Identical SHA-256 is reused. A different object with the same filename is rejected unless an explicit versioned key is requested. Silent overwrite is refused.

## Credential setup

1. Keep using the existing private R2 bucket.
2. Set the `R2_*` or `OBJECT_STORAGE_*` names privately in Vercel Preview / host secrets.
3. Optionally set `TIVVLEJOY_SCENERY_ASSET_PREFIX=tivvlejoy-assets`.
4. Confirm `/scenery` shows storage configuration as `configured` without displaying secrets.
5. Do not paste keys into chat or Git.

If credentials are absent, intake stays connection-ready. No upload is attempted.

## Mobile multipart upload flow

The Preview Only Scenery Asset Intake section on `/scenery` is built for an iPhone browser.

1. Prefer **Select and upload all 27 purchased files**. Collection cards are not required.
2. Review the expected file checklist (27 production files total) and the pre-upload review.
3. Unexpected, incorrect, and duplicate filenames are refused individually.
4. The browser calculates SHA-256 in chunks (Web Worker when available). It does not load a 700 MB file into memory at once.
5. The studio API creates a short-lived multipart session for one exact object key.
6. Each part is uploaded directly to private R2 through a signed URL.
7. The API completes the upload and verifies stored byte size.

Large files never pass through a normal Vercel request body.

Upload does **not** mean asset approval.

## Resume behavior

Interrupted uploads keep completed part ETags on the session. Resume re-signs the next missing part. Pause/cancel aborts the multipart upload. Failed parts can be retried without recreating the immutable source key.

## SHA-256 behavior

- Client: streaming / chunked SHA-256, Web Worker when supported.
- Server: verifies stored byte size with `HeadObject`.
- Independent server-side SHA-256 of stored R2 bytes is not completed in this serverless environment, because downloading hundreds of megabytes through Vercel is refused.
- Until an independent worker verifies the stored hash, the record stays `awaiting_verification` unless size verification plus a recorded checksum make it `size_verified`.

## Duplicate handling

- Same hash and same collection: `already_present`. No second stored copy.
- Same hash with a different filename: `exact_duplicate`.
- Same filename with a different hash: filename conflict. Version or quarantine. Never overwrite.

## Quarantine rules

Before inspection eligibility, intake validates extension, expected collection, byte size, SHA-256 presence, object availability, ZIP path traversal, absolute archive paths, zero-byte files, unsupported executables, unexpected nested archives, and Unity preservation-only files.

Unity packages are backups only. They are never imported into the Blender pipeline. Scripts inside archives are never executed.

## Inspection readiness

A source becomes `inspection_ready` only when:

- the storage object exists
- size is verified
- checksum is recorded
- archive validation passes
- a provenance placeholder exists
- collection mapping is valid

Queued dry-run jobs exist for Village Blender, Village assembled project, SkyMachine V2, Stylized Forest, Flora, Rock models, Rock materials, Rock Geometry Nodes, Water, and Swarm.

## Blender worker contract

When a real Blender 4.2 worker is available it must:

1. Materialize one immutable source into a temporary workspace.
2. Calculate or verify SHA-256.
3. Open a copy, never the source.
4. Record saved Blender version, collections, objects, meshes, triangles, materials, images, node groups, Geometry Nodes, missing textures, packed textures, unsupported nodes, dimensions, transforms, origins, and scale.
5. Save a JSON report to `inspection/`.
6. Clean temporary files.
7. Leave the source unchanged.

This environment does not run Blender and does not start GPU rendering.

## Normalization boundary

Normalization is refused unless a verified Blender worker and actual source bytes are both available. If it later becomes possible, write only to `normalized/` with versioned keys, preserve source hash and provenance, and never mark `production_approved` automatically.

Texture policy: 1024 preview/distant, 2048 standard final, 4096 hero close-up. Only one selected tier may materialize for ordinary scene assembly.

## Recovery and rollback

1. Abort in-flight multipart uploads.
2. Leave verified source objects in private storage. Do not delete them automatically.
3. Revert this branch to drop intake code.
4. Do not restore licensed binaries into Git.
5. Do not touch Pip, Goat, voices, production-library, or existing Draft PRs.

## Procedure for uploading the 27 purchased files

1. Configure the existing R2 variables privately.
2. Open `/scenery` on a phone or desktop.
3. Confirm software foundation is available and real asset readiness is not ready.
4. Upload Village (7), Sky/HDRI (7), Stylized Forest (4), then Procedural Nature (9).
5. Wait for SHA-256, storage size verification, and quarantine results.
6. Attach licenses under `tivvlejoy-assets/licenses/` before any later approval.
7. Only then schedule Blender 4.2 inspection jobs. Do not approve from upload alone.
