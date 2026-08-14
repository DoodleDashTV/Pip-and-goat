# Worker image at `9a60cc9` — published

Fourth publication attempt. GHCR credentials are valid (`write:packages`),
docker login succeeds, and the image is on the registry with a digest pin.

## Steps

| Step | Result |
| --- | --- |
| 1. Clean tree | `9a60cc9c379d2038d7d7cd349e2443196f97bb98` |
| 2. Fingerprints | code `f30e6dc010c6fdbdb184478da1b24d4a3fe9e236010e17a5536c0c1f4dd1c207` (30 files), assets `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7` (4 files) |
| 3. Build for `linux/amd64` | tagged `:9a60cc9`; in-build fingerprint agreed |
| 4. Fingerprint re-verified **inside** the image | `renderCodeMatch: true`; baked `assemble_scene.py` = `6ba991ba6957782aab98e8d3ba49e590f7b95e0bdf2fe601330a8d10a655c8ab` |
| 5. Push | **accepted** — digest `sha256:bd60f26469a2a09ffef48281170263a2121ff10a458f42f94fa487eacae2c2a2` |
| 6. Anonymous registry verify | **PASS** — labels match commit + render-code fingerprint |
| 7. Pin | written into `scripts/cloud/acceptance-1080p/common.ts` |

## Labels the registry serves

```
ddp.source.commit      9a60cc9c379d2038d7d7cd349e2443196f97bb98
ddp.render.code.sha256 f30e6dc010c6fdbdb184478da1b24d4a3fe9e236010e17a5536c0c1f4dd1c207
ddp.worker.build.time  2026-08-13T16:39:23Z
```

## Environment note

This Cloud Agent VM has no docker by default and runs on a nested overlay root.
Docker was installed for the publish; the daemon was started with
`storage-driver=vfs` because overlay-on-overlay BuildKit mounts fail with
`invalid argument`. That is a host constraint, not a change to the image.

`build-worker-image.sh` digest extraction was also fixed: some docker versions
ignore `imagetools inspect --format`, so the script now prefers the digest
printed by `docker push`.
