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

## Preview storage configuration (verified)

Checkpoint: `TIVVLEJOY_SCENERY_PREVIEW_STORAGE_CONFIG`

These names are set on the Vercel `pip-and-goat` project for **Preview only**, git-branch limited to `cursor/tivvlejoy-scenery-intake-preview-73f1`. Production was not modified.

- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `TIVVLEJOY_SCENERY_ASSET_PREFIX=tivvlejoy-assets`
- `TIVVLEJOY_SCENERY_INTAKE_TOKEN` (server-only, not printed)

The live host is the existing git-branch Vercel Preview alias for `cursor/tivvlejoy-scenery-intake-preview-73f1`. The hostname is omitted from git.

Verified after Preview storage-config redeploy `dpl_Aq3jBhFdCiBbAp2Wv4ziKAQPmWJj`.

## Preview intake token rotation (verified)

Checkpoint: `TIVVLEJOY_SCENERY_PREVIEW_INTAKE_TOKEN_ROTATED`

`TIVVLEJOY_SCENERY_INTAKE_TOKEN` was rotated in place on the same Preview-only, git-branch-limited Vercel sensitive variable. The new value is the identically named agent runtime secret. The value was not printed, logged, or committed.

Other Preview storage names were not modified:

- `R2_BUCKET`
- `R2_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `TIVVLEJOY_SCENERY_ASSET_PREFIX`

Production was not modified (`hiddenProductionEnvCount=0`). Draft PR #45 stays open, draft, and unmerged.

Verified after Preview token-rotation redeploy `dpl_Btx59tpkKwLT7f57jnJ9tA2bD7uY` of branch `cursor/tivvlejoy-scenery-intake-preview-73f1` (READY, target not production):

- GET `/` = 200
- GET `/scenery` = 200
- GET `/api/scenery/intake` = 200, `storageConfiguration=configured`, `tokenConfigured=true`, `bytesPath=client-to-signed-r2`, prefix `tivvlejoy-assets`
- Incorrect token = 401 `INTAKE_UNAUTHORIZED`
- Rotated token authorizes a safe non-upload `query` (400 `UNKNOWN_SESSION`, `uploaded=false`)
- No credentials in Preview HTML or JSON
- Purchased source object count = 0
- Purchased files were not uploaded, inspected, extracted, converted, normalized, or approved

## Procedure for Justin to upload the 27 purchased files

1. Confirm this Preview is not Production.
2. Confirm storage configuration is `configured` on `/scenery`.
3. Enter the Preview intake token in Authorized TivvleJoy studio session.
4. Tap **Select and upload all 27 purchased files** and choose every purchased file in one picker. Collection cards are not required.
5. Review matched, missing, unexpected, duplicate, and incorrect filenames, plus sizes and collection totals.
6. Tap **Upload or retry all eligible files**. Watch overall and per-file hash, multipart progress, stored size, duplicate, and quarantine states.
7. Unexpected files are refused individually. Valid matches still upload.
8. Upload does not mean asset approval. Do not inspect, normalize, or approve from this pass.

See `docs/TIVVLEJOY_SCENERY_ONE_TAP_UPLOAD.md` and `docs/TIVVLEJOY_SCENERY_PIPELINE_HARDENING.md`.

Recovery, verification, quarantine, and inspection-readiness are documented in the hardening guide. Upload still does not mean asset approval. Licensed files are not committed.
