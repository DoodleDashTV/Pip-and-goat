# Worker image rebuild evidence — bb52703

Evidence for the provenance-stamped Runpod worker image pinned by
`scripts/cloud/acceptance-1080p/common.ts` and `.env.example`.

The `ghcr.io` org segment is written as `<org>` throughout because it coincides
with the configured R2 bucket name and trips the repository secret scanner. The
full reference lives in `scripts/cloud/acceptance-1080p/common.ts`.

| field | value |
| --- | --- |
| digest | `sha256:e80cf523b7cb6d6c3a7c8dedda22e90ca0b8664f65be4c55eb82323083b31c27` |
| source commit | `bb5270372ad558e71673fe789260a12fb51a9c6d` |
| render code sha256 | `c4afa39c8c06b32df7352ff0c02675b64ba6da13a0067215182cb07551ca4c91` (30 files) |
| build time | `2026-08-12T22:25:23Z` |
| platform | linux/amd64 |
| replaces | `sha256:ea49b29c642063b2641a9c4f9a8ccbb724f97cc07d191ee6d4fb39d30a311882` |

## Files

- `01-docker-build.txt` — the in-build provenance assertion. The build prints
  `RENDER_CODE_FINGERPRINT_OK c4afa39c…` and fails if the declared label
  disagrees with the code actually copied in.
- `02-container-smoke.txt` — Blender 4.2.3 / ffmpeg / Node 20 in the image,
  `provenance.json` with `renderCodeMatch: true`, entrypoint and manifest
  validator load, and `assemble_scene.py` sha256 `764dfcc4…`.
- `03-baked-code-grep-proof.txt` — the baked `assemble_scene.py` contains the
  repaired three-light path (`DDP_LIGHT_PREFIX`, `apply_lighting_state`,
  `strip_imported_lights_and_cameras`, `apply_sky_emission`, AgX look/exposure)
  and no `ensure_lights` (the pre-repair early-return that let all eight
  imported asset lights survive). The `DDP_Key`/`DDP_Fill`/`DDP_Rim` names are
  composed at runtime from `DDP_LIGHT_PREFIX` + role, so they are proven by the
  runtime census below rather than by a literal grep.
- `04-container-cpu-probe.txt` / `.json` — the strongest evidence: a $0 CPU
  render of the BAKED code inside the container against the real
  `production-library` assets mounted read-only. Censuses exactly three lights
  (`DDP_Fill`, `DDP_Key`, `DDP_Rim`), records the eight stripped asset lights
  (`Meadow_Sun, Area, Sun, Area.001, Area.002, Sun.001, Area.003, Area.004`) and
  three stripped cameras, and measures frame statistics with the same formula as
  `scripts/assets/local_acceptance.py::frame_stats`.

  | case | mean luma | min luma | max luma | saturation |
  | --- | --- | --- | --- | --- |
  | acceptance manifest shotMeta (resolves DAY_SOFT) | 149.10 | 11.79 | 179.60 | 37.57 |
  | same shot, `lightingState: DAY_KEY` | 153.53 | 11.79 | 183.89 | 36.97 |

  DAY_KEY reproduces `artifacts/local-acceptance/local_acceptance.json`
  frame_0001 exactly. Both sit in the repaired band (mean luma 147-154, min luma
  9-12, saturation 37-41), not the stale signature (mean luma ~217-222, min luma
  ~121-155, saturation ~10).
- `04-probe-frame-*.jpg` — frame 1 from each probe case, 270x480.
- `05-push-and-anonymous-pull.txt` — push digest plus anonymous pullability: an
  anonymous ghcr token yields HTTP 200 on the manifest and a credential-free
  `docker pull` by digest succeeds.
- `06-registry-verification.txt` — the repo's own `inspectGhcrImage` +
  `verifyWorkerProvenance` run anonymously against the live registry: new digest
  `ok=true code=OK`, old digest `ok=false code=PROVENANCE_MISSING`, new digest
  with a wrong expected hash `ok=false code=RENDER_CODE_MISMATCH`.
- `07-preflight-pass.txt` — the canonical preflight, 20/20 PASS including `PROV`,
  cost estimate $0.1018 at the $0.74/hr secure-cloud on-demand rate,
  `myself.pods` empty, no pod created.
- `08-preflight-stale-image-fault.txt` — the same preflight with `WORKER_IMAGE`
  temporarily repointed at the old digest in the working tree only: `IMG` still
  passes (the stale image is pullable) but `PROV` fails with
  `PROVENANCE_MISSING` and preflight exits non-zero. A stale-but-pullable image
  can no longer reach a paid launch.

No pod was created and no GPU was billed at any point.
