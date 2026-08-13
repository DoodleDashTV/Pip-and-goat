# The one FINAL_1080P cloud confirmation render

Everything the next cloud acceptance job will do, and everything that has to be
true before it can. Nothing here creates a pod. `launch.ts` is the only file that
can, and it refuses until the pins agree with the working tree.

## What the job is

| | |
| --- | --- |
| Shot | `meadow-map-mystery`, Pip and Goat with the AdventureMap in the meadow |
| Lighting | `DAY_KEY`, named explicitly in `shotMeta` rather than left to the cloud |
| Output | 1080x1920, 90 frames, 30 fps, EEVEE at 24 samples |
| GPU | RTX 4090, `cloudType: 'SECURE'` — never community, never a different class |
| Pods | one, and only if the account has none. No fallback GPU, no second render |
| Retry | none. If pod creation fails, the authorization is not consumed and the job stops |
| Spend cap | `HARD_CAP_USD = 0.25` total |
| Hard kill | `floor(0.25 / actualRate * 60 * 0.90)` minutes, from the pod's **real** `costPerHr`, re-derived if Runpod ever reports a different rate mid-run |
| Termination | `terminatePod` runs in a `finally`, retries once, then polls `myself.pods` until the pod is gone and reports whether anything billable remains |

## Three gates stand between a repaired checkout and a paid render

**1. The image must be pinned by digest, and the digest's own labels must agree
with this checkout.** The scene-assembly code is baked into the worker image, so a
pullable, digest-pinned, correctly-labelled image can still render code that is
not this commit's. That has happened: image
`sha256:e80cf523…` renders `c4afa39c…`, which is the lighting from before the
picture-quality remediation. Preflight reads `ddp.source.commit`,
`ddp.worker.build.time` and `ddp.render.code.sha256` back out of the registry
anonymously and refuses on any disagreement.

**2. The approved assets must match their pinned fingerprint.** The `.blend` files
are not baked in — the worker downloads them from R2 — so they are pinned
separately by `computeRenderAssetFingerprint`. Editing a character then has to be
re-pinned deliberately instead of being uploaded under a fresh key.

**3. Both pins are checked again inside `launch.ts`**, after preflight has passed,
before the Runpod client is even constructed. Preflight may have run hours ago;
anything edited since would otherwise be rendered without review.

Break any of them and watch them refuse:

```bash
pnpm cloud:faults
```

## Running it

```bash
pnpm cloud:preflight-offline        # free, no credentials, creates nothing
pnpm cloud:accept1080p:preflight    # needs R2 + Runpod; still creates nothing
```

`launch.ts` has no `pnpm` alias, deliberately: it is the only billable command in
the repository and it should be typed out in full, after preflight is entirely
PASS and with explicit authorization for that one render.

```bash
pnpm --filter @doodle-dash/database exec tsx ../../scripts/cloud/acceptance-1080p/launch.ts
pnpm --filter @doodle-dash/database exec tsx ../../scripts/cloud/acceptance-1080p/postrun.ts
```

`cloud:preflight-offline` covers the 14 checks that need no credentials: local
files, the public registry, and the GPU price, which Runpod's `gpuTypes` query
answers unauthenticated. It does not cover R2 authentication, the bucket
read/write, the asset upload and readback, the pod inventory or the manifest
upload, all of which need credentials and are checked by the full preflight.

The rate and the total are separate checks, because the cap is on the total. A
rate above $0.25/hr is not by itself a problem; 20 minutes of it would be.

| | |
| --- | --- |
| `RATE` | the live SECURE on-demand quote for the RTX 4090, read now |
| `14` | 90 frames at that rate against the unchanged $0.25 total cap |
| `15` | where the hard kill would arm at that rate — 90% of the cap, in minutes |

The quote asks for `secureCloud: true` explicitly. Without that filter the API
returns the cheapest offer across community and secure both, which for the RTX
4090 quoted $0.34/hr while a secure pod billed $0.74/hr. Launches are SECURE, so
an estimate taken at the community price understates by about half.

## Current state

The pins in `common.ts` are `PENDING_REBUILD`. That is not an oversight: every
image ever published from this repository predates the picture-quality remediation
and the shadow-caster repair, both of which changed `scripts/blender/`, which is
baked in. There is no published image that would render this checkout, so there is
no digest to pin, and the placeholder is refused by gate 1 before anything reaches
Runpod.

To move forward, rebuild and publish:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
pnpm cloud:build-worker-image      # builds, verifies in-image, pushes, prints the pins
```

That needs a GHCR credential with `write:packages` on the `ddp-runpod-blender`
package. A read-only token gets
`permission_denied: installation not allowed to Write organization package` from
`POST /v2/.../blobs/uploads/`, which is the whole publish step.
