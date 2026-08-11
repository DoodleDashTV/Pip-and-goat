# Durable Object Storage Setup

Doodle Dash Production stores **all production binaries** through an object-storage abstraction.

Local filesystem (`.doodle-dash-storage`) is for development only. Cloud Agent disks are ephemeral — configure **S3-compatible** storage before relying on uploads across redeploys.

## Required environment variables

```bash
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_BUCKET=your-bucket-name
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
```

### Optional (required for many non-AWS providers)

```bash
OBJECT_STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
OBJECT_STORAGE_FORCE_PATH_STYLE=true
OBJECT_STORAGE_PUBLIC_BASE_URL=https://cdn.example.com
```

### Aliases

- `OBJECT_STORAGE_PROVIDER` may be `s3`, `r2`, `b2`, or `minio` (all use the S3 client).
- Access keys also accept `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
- Region also accepts `AWS_REGION` / `AWS_DEFAULT_REGION`.

### Local development only

```bash
OBJECT_STORAGE_PROVIDER=local
OBJECT_STORAGE_ROOT=/absolute/persistent/path
```

### Disable storage

```bash
OBJECT_STORAGE_PROVIDER=none
```

## Important safety rule

If `OBJECT_STORAGE_PROVIDER` is set to an S3-compatible mode but bucket/keys are incomplete, the app **fails closed**. It does **not** silently fall back to local storage.

## Self-test

In Studio → **Assets** (`/asset-intake`) → **RUN STORAGE SELF-TEST**

Or:

```http
POST /api/production/storage
{ "action": "self-test" }
```

The test writes a tiny object under `worker-tests/`, reads it, verifies SHA-256, deletes it. Credentials are never returned.

## Migrate local → S3

1. Configure S3 env vars.
2. Run self-test until green.
3. Dry-run:

```http
POST /api/production/storage
{ "action": "migrate-local", "dryRun": true }
```

4. Migrate:

```http
POST /api/production/storage
{ "action": "migrate-local", "dryRun": false }
```

Local originals are **not** deleted. Verify checksums, then clean up manually.

## Never commit secrets

Add these only as environment secrets (Cursor secrets / host env). Never paste tokens into chat or commit `.env` with real keys.
