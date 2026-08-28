# TIVVLEJOY_REAL_SCENERY_30S_V3_NATURE_LIBRARY_FIX

## Status
ZERO_COST_FIX_APPLIED

Ready for a **fresh** one-shot paid authorization. V3 authorization is exhausted. This change does **not** launch a Pod.

## What was wrong
V3 CREATE `24iy85zk8tzqk6` started the baked worker, then fail-closed on `nature_library`.

Bridge preflight used independent regex hits and reported 12/12. The worker uses greedy unique-key selection plus a 900 MiB `nature_library` cap. The only dedicated nature package is Botaniq 7.2.0 at 4915.1 MiB, so the worker rejected it.

## What was changed
1. Extracted the exact worker selector into `workers/runpod-blender/src/scenery-showcase-roles.js`.
2. Added unit tests that replay the V3 inventory:
   - independent preflight: 12/12
   - worker selector: `SCENERY_ROLE_MISSING` / `nature_library`
   - same inventory plus the alias: 12 distinct roles under the 5 GiB cap
3. Copied the purchased forest nature kit to a private compatibility key the **already baked** V3 image already understands:
   - source: `tivvlejoy-assets/source/stylized-forest/Stylized_Forest_Nature_Kit.zip`
   - alias: `tivvlejoy-assets/showcase-compat/Assets Library.zip`
   - size: 692830820 bytes / 660.7 MiB
   - fabricated: false
   - source bytes modified: false
4. Live worker-equivalent preflight after the copy: 12/12 distinct roles, 5001.4 MiB selected, under the 5 GiB cap.
5. Zero-cost GitHub workflow runs the selector tests only. It cannot CREATE.

The next paid run can keep template `6yz7wkmu34` and image `sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673`. No worker-image rebuild is required for this role gap.

## What is still missing
The 30-second MP4 does not exist. A new user authorization is required before another CREATE.

Do not reuse V1, V2, or V3 authorization files. Do not push a new `PAID_AUTHORIZATION_V3.json` change.

PR #169 remains OPEN / DRAFT / UNMERGED / NOT READY.
