# TIVVLEJOY_SCENERY_COMPAT_V4_FAILURE

## Result
Zero-cost workflow `33130567944` on commit `61b045b` failed. No Pod was created.

Live Vercel POST `/api/scenery/showcase-compat-v4` returned:

`NATURE_COMPAT_SOURCE_NOT_FOUND`

## Why
The V4 compat bridge only copies a nature alias from an object that already passes the worker `nature_library` rules, excluding `showcase-compat/`.

That source does not exist:

- Botaniq 7.2.0 is 4915.1 MiB, over the 900 MiB cap
- GeoScatter biomes is excluded
- The purchased forest nature kit matches `forest_geometry`, not `nature_library`

So the bridge cannot invent a qualifying source from the raw inventory. This is the same V3 role gap, not a unique-key collision.

## Zero-cost repair
Private copies of the purchased forest nature kit now exist at both compatibility keys:

- `tivvlejoy-assets/showcase-compat/Assets Library.zip`
- `tivvlejoy-assets/showcase-compat/assets library nature role.zip`

Both are 660.7 MiB, source bytes unmodified, fabricated=false.

Worker-equivalent unique-key + maxBytes selection now returns 12/12 without creating a Pod.

This YAML touch re-runs only the zero-cost compat check against the live aliases.

PR #169 remains OPEN / DRAFT / UNMERGED / NOT READY.
