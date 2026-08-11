# Blender Renderer Worker

Node.js worker that polls a studio HTTP API for render jobs, prepares Blender
headless arguments, and reports progress. Asset download and output upload are
explicit stubs until object storage adapters are configured.

## Scripts

- `pnpm --filter @doodle-dash/blender-renderer start` - poll continuously.
- `pnpm --filter @doodle-dash/blender-renderer once` - claim at most one job.
- `pnpm --filter @doodle-dash/blender-renderer check` - syntax check the entrypoint.

## Environment

- `RENDER_API_URL` - base API URL, default `http://localhost:3000/api/render-worker`.
- `RENDER_WORKER_ID` - stable worker id, default `hostname-pid`.
- `RENDER_WORKER_NAME` - display name, default `blender-hostname`.
- `BLENDER_BIN` - Blender executable, default `blender`.
- `BLENDER_GPU` - set to any value to advertise GPU support.
- `RENDER_WORKSPACE_DIR` - local work dir, default OS temp directory.
- `RENDER_POLL_INTERVAL_MS` - idle poll interval, default `5000`.

## HTTP API contract

All requests are JSON `POST` requests under `RENDER_API_URL`.

### `POST /workers/register`

Request:

```json
{
  "id": "worker-id",
  "name": "blender-host",
  "capabilities": {
    "engines": ["EEVEE", "CYCLES"],
    "resolutions": ["270x480", "360x640", "540x960", "1080x1920"],
    "fps": [24, 30, 60],
    "supportsGpu": false,
    "maxConcurrentJobs": 1
  }
}
```

Response: any `2xx` JSON body or `204`.

### `POST /jobs/claim`

Request:

```json
{
  "workerId": "worker-id",
  "capabilities": {
    "engines": ["EEVEE", "CYCLES"],
    "resolutions": ["270x480", "360x640", "540x960", "1080x1920"],
    "fps": [24, 30, 60]
  }
}
```

Response when a job is available:

```json
{
  "job": {
    "id": "render-job-id",
    "status": "PREPARING",
    "resolution": "540x960",
    "fps": 30,
    "engine": "EEVEE",
    "payload": {
      "sceneId": "scene-001",
      "assets": [{ "role": "character", "uri": "s3://bucket/character.blend" }]
    }
  }
}
```

Response when no job is available:

```json
{ "job": null }
```

### `POST /jobs/:id/progress`

Request:

```json
{
  "workerId": "worker-id",
  "status": "RENDERING",
  "progress": 30,
  "message": "Starting Blender headless render."
}
```

### `POST /jobs/:id/complete`

Request:

```json
{
  "workerId": "worker-id",
  "outputs": [
    {
      "kind": "metadata",
      "uri": "stub://render-outputs/render-job-id/metadata.json",
      "metadata": {
        "uploaded": false,
        "note": "upload stub; object storage adapter not configured"
      }
    }
  ]
}
```

### `POST /jobs/:id/fail`

Request:

```json
{
  "workerId": "worker-id",
  "error": {
    "status": "FAILED",
    "message": "Blender executable not found: blender",
    "type": "BLENDER_MISSING",
    "code": "BLENDER_NOT_FOUND"
  }
}
```

The worker never executes Blender when the binary cannot be detected with
`BLENDER_BIN --version`.
# Blender render worker (later milestone)

This worker will:

1. Pull persistent render jobs from the queue
2. Download scene assets from object storage
3. Assemble and render with headless Blender
4. Encode preview/final outputs
5. Upload results and report status

Do not couple long renders to web request lifecycles.
