# TivvleJoy scenery intake Preview

Checkpoint: `TIVVLEJOY_SCENERY_ASSET_INTAKE_PREVIEW_V1`

This pass deploys the scenery intake workflow as a private Vercel Preview so an authorized TivvleJoy studio session can upload the 27 purchased source files into the existing private R2 bucket.

It does **not** upload, inspect, normalize, approve, convert, extract, or commit licensed assets.

## Authorization

Unauthorized browsers cannot create, sign, complete, query, resume, or abort upload sessions.

Authorized access:

- Production (`VERCEL_ENV=production`) always refuses intake mutations.
- A non-public studio host with a configured database URL may mutate intake.
- A public Preview requires a matching `TIVVLEJOY_SCENERY_INTAKE_TOKEN` sent as `x-tivvlejoy-scenery-intake-token`.

The token is server-only. Do not prefix it with `NEXT_PUBLIC_`. Do not print it. The browser keeps the value in local component state only.

Client-selected credentials, bucket overrides, and prefix overrides are refused.

## Storage path

Large files travel from the browser to signed R2 multipart URLs. They do not pass through a Vercel request body.

Durable session and manifest JSON is stored under:

- `tivvlejoy-assets/quarantine/upload-sessions/`
- `tivvlejoy-assets/catalogs/intake-manifests/`

Signed URLs are never persisted.

## Synthetic preview tests

Preview verification uses a newly generated tiny text fixture:

- filename prefix `tivvlejoy-preview-synthetic-`
- object key under `tivvlejoy-assets/quarantine/preview-tests/`
- never one of the 27 purchased inventory filenames
- never written to `tivvlejoy-assets/source/`

The fixture is deleted after the test.

## Vercel Preview setup

Set these names on the Vercel **Preview** environment only. Do not retarget Production.

- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- optional `TIVVLEJOY_SCENERY_ASSET_PREFIX=tivvlejoy-assets`
- `TIVVLEJOY_SCENERY_INTAKE_TOKEN`

Confirm `/api/scenery/intake` reports `realAssetReadiness.storageConfiguration=configured` and `authorization.tokenConfigured=true` without displaying secret values.

## Procedure for Justin to upload the 27 purchased files

1. Confirm this Preview is not Production.
2. Confirm storage configuration is `configured` on `/scenery`.
3. Enter the Preview intake token in Authorized TivvleJoy studio session.
4. Choose a collection card.
5. Select one or multiple purchased files that match the expected 27-file checklist.
6. Start the direct upload. Watch hash, multipart progress, stored size, duplicate, and quarantine states.
7. Repeat for Village (7), Sky/HDRI (7), Stylized Forest (4), and Procedural Nature (9).
8. Upload does not mean asset approval. Do not inspect, normalize, or approve from this pass.
