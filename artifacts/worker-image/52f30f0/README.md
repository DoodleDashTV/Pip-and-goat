# Worker image at `52f30f0` — third publication attempt, credentials still refused

This run started with `GHCR_USER` / `GHCR_USERNAME` / `GHCR_TOKEN` injected at
boot (the previous blocker). Docker was installed and the daemon started. The
push is still refused: the injected token is rejected by GitHub as
**Bad credentials**, and both username secrets carry trailing whitespace.

No image was rebuilt or pushed. No digest exists to pin. `WORKER_IMAGE` stays
`PENDING_REBUILD`. Spend $0.

## What changed since `1fbbdf2`

| | Prior run (`1fbbdf2`) | This run (`52f30f0`) |
| --- | --- | --- |
| `GHCR_USER` / `GHCR_TOKEN` | absent from the VM | injected at boot |
| `docker` | available in prior env | installed + daemon started here |
| `GET api.github.com/user` | n/a (no token) | **HTTP 401 Bad credentials** |
| `ghcr.io` pull,push token | n/a | **HTTP 403 denied** |
| `docker login ghcr.io` | no credentials | **denied: denied** |
| Published digest | none | none |

Evidence: `08-ghcr-auth-probe.txt` (no secret values).

## Why nothing was pinned

Same as before: a digest is assigned by the registry when it accepts a manifest.
An unpublished image has none. The image-reference and provenance gates correctly
keep preflight at 12/14 on `IMG` and `PROV`.

## What is still one command away

Replace the injected secrets with a **valid** classic PAT or fine-grained token
that has `write:packages` (and `read:packages`) on the org package, with
`GHCR_USER` set to the GitHub username that owns the token and **no trailing
spaces**. Secrets land at VM boot, so a newly started run on this branch is
required after saving them. Then:

```
scripts/cloud/ghcr-login.sh
pnpm cloud:build-worker-image
```

Steps 5–7 push, read the digest, verify labels anonymously, and print the four
constants to pin in `scripts/cloud/acceptance-1080p/common.ts`.
