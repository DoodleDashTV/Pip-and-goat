# Worker image at `e509a01` — built and verified, not published

The shadow-caster repair changed `scripts/blender/assemble_scene.py`, which is
baked into the worker image, so the render-code fingerprint moved and the image
has to be rebuilt before any cloud render could run this checkout. It was rebuilt,
and everything that can be verified without a registry write was verified. It
could not be published, so there is no digest to pin and the cloud job stays
blocked.

## What the fingerprints did

| | At `bb52703` (published) | At `e509a01` (this build) |
| --- | --- | --- |
| render **code** | `c4afa39c8c06b32d…` | `f30e6dc010c6fdbd…` |
| render **assets** | `7876ac737de60257…` | `7876ac737de60257…` — unchanged |

The asset fingerprint did not move because `production-library/` is byte-identical
to `a440d88`: no approved `.blend` was edited to fix the seam. The pin in
`scripts/cloud/acceptance-1080p/common.ts` is therefore already correct and needs
no change.

## Steps that passed

1. **Clean tree.** Built from `e509a01bc74067caf5e96ee39890ee1d4e8f03db`, so the
   image carries code that exists on a commit rather than in someone's checkout.
2. **Fingerprints from the repository.** `f30e6dc0…` over 30 files,
   `7876ac73…` over 4.
3. **Build for `linux/amd64`,** stamped with commit, build time and the code
   fingerprint. The build re-computes the fingerprint over the files it copied and
   fails if the stamp disagrees — see `01-docker-build.txt`.
4. **Fingerprint re-verified inside the image,** recomputed from the files
   actually present rather than read off the label
   (`02-in-image-provenance.json`): `renderCodeSha256` `f30e6dc0…`,
   `renderCodeMatch: true`, over the same 30 files. And `assemble_scene.py` as
   baked hashes `6ba991ba6957782aab98e8d3ba49e590f7b95e0bdf2fe601330a8d10a655c8ab`,
   which is what the file hashes in this checkout.

`04-local-image-labels.json` is what the registry would have served:

```
ddp.source.commit      e509a01bc74067caf5e96ee39890ee1d4e8f03db
ddp.render.code.sha256 f30e6dc010c6fdbdb184478da1b24d4a3fe9e236010e17a5536c0c1f4dd1c207
ddp.worker.build.time  2026-08-13T14:51:31Z
```

## The step that did not

`docker push` failed: `unauthorized: unauthenticated`
(`03-docker-push.txt`). No GHCR credential is present in this environment, and the
`ghs_` GitHub App installation token that is available is refused write on the
package (`06-publish-blocked.txt`):

```
POST /v2/doodledashtv/ddp-runpod-blender/blobs/uploads/  ->  HTTP 403
permission_denied: installation not allowed to Write organization package
```

Anonymous *pull* from the same repository works, so this is missing write scope
rather than a reachability problem.

An image digest is assigned by the registry when a manifest is accepted, so an
unpublished image has none — `05-no-digest-without-publish.txt` shows
`RepoDigests=[]`. The local content id `sha256:f752b1de…` is a config-blob id, not
a manifest digest, and pinning it would be meaningless: `WORKER_IMAGE` stays
`PENDING_REBUILD`, which the image-reference gate rejects before anything can
reach Runpod.

## To finish this

Provide a GHCR credential with `write:packages` on `doodledashtv`, as
`GHCR_USER` / `GHCR_TOKEN`, then:

```
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
scripts/cloud/build-worker-image.sh          # resumes through push and prints the pin
```

Steps 5 to 7 of that script then publish, read the digest back out of the
registry, verify the published labels anonymously the way preflight will, and
print the four constants to paste into `common.ts`.
