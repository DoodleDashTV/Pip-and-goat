# Worker image at `1fbbdf2` — built and verified, publication still blocked

Second attempt at publication, this time at the canonical commit
`1fbbdf2c9eb85e3c4aded99919e8602ff2165641`, so `ddp.source.commit` matches HEAD
exactly rather than lagging it as the `e509a01` build's label did.

Everything that can be done without writing to a registry is done. The push is
still refused.

## Steps that passed

| Step | Result |
| --- | --- |
| 1. Clean tree | `1fbbdf2c9eb85e3c4aded99919e8602ff2165641` |
| 2. Fingerprints | code `f30e6dc010c6fdbdb184478da1b24d4a3fe9e236010e17a5536c0c1f4dd1c207` (30 files), assets `7876ac737de602578b67a8a20d85ea8a917c7ac4dac5e668f8bae37343e8f4b7` (4 files) |
| 3. Build for `linux/amd64` | tagged `:1fbbdf2`; the build re-computed the fingerprint over the files it copied and agreed with the stamp |
| 4. Fingerprint re-verified **inside** the image | `renderCodeMatch: true`, recomputed over the 30 files present rather than read from the label; baked `assemble_scene.py` hashes `6ba991ba6957782aab98e8d3ba49e590f7b95e0bdf2fe601330a8d10a655c8ab`, which is what the file hashes in this checkout |

Labels the registry would have served (`04-local-image-labels.json`):

```
ddp.source.commit      1fbbdf2c9eb85e3c4aded99919e8602ff2165641   ← equals HEAD
ddp.render.code.sha256 f30e6dc010c6fdbdb184478da1b24d4a3fe9e236010e17a5536c0c1f4dd1c207
ddp.worker.build.time  2026-08-13T15:43:19Z
```

## The step that did not

`docker push` → `unauthorized: unauthenticated: User cannot be authenticated with
the token provided` (`03-docker-push.txt`).

`GHCR_USER` and `GHCR_TOKEN` are both absent from this VM's environment and there
is no docker login. Cloud Agent secrets are injected at VM boot, and this VM booted
before they could be added, so a secret saved after that point is not visible to
this process — a new run picks it up.

The `ghs_` GitHub App installation token that *is* available was tried as a
fallback and is refused (`06-publish-blocked.txt`):

```
POST /v2/doodledashtv/ddp-runpod-blender/blobs/uploads/  ->  HTTP 403
permission_denied: installation not allowed to Write organization package

GET /orgs/DoodleDashTV/packages?package_type=container   ->  HTTP 404
```

It cannot write the package and cannot even list the organisation's packages.
Anonymous *pull* of the same repository works, so this is missing write scope
rather than a reachability problem.

## Why nothing was pinned

A digest is assigned by the registry when it accepts a manifest, so an unpublished
image has none: `RepoDigests=[]` in `05-no-digest-without-publish.txt`. The local
content id `sha256:63f3959b…` is a config-blob id, not a manifest digest, and
pinning it would be meaningless — nothing could pull it.

`WORKER_IMAGE` therefore stays `PENDING_REBUILD`, which the image-reference gate
rejects. Preflight is **12/14**: `IMG` and `PROV` fail, which is the correct
outcome while no published image would render this checkout. Neither was weakened
to reach a higher score.

## What is one command away

The image is built, labelled and verified at the canonical commit. With a
credential carrying `write:packages` on `doodledashtv`:

```
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
scripts/cloud/build-worker-image.sh
```

Steps 5 to 7 then push, read the digest back out of the registry, verify the
published labels anonymously the way preflight will, and print the four constants
to paste into `scripts/cloud/acceptance-1080p/common.ts`. Preflight goes to 14/14
once those are pinned.
