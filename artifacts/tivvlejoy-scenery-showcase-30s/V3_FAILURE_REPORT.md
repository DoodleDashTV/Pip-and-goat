# TIVVLEJOY_REAL_SCENERY_30S_V3_FAILURE_REPORT

## Result
FAILED at `PRIVATE_SCENERY_DISCOVERY` after the single authorized V3 CREATE.

- workflow run: `33130281845`
- commit: `fcf58c54eaa4bf6c757ffbfd2f6d5cec846fa88e`
- pod: `24iy85zk8tzqk6`
- pod name: `tivvlejoy-scenery-showcase-30s-v3`
- template: `6yz7wkmu34`
- transport: `RUNPOD_REST_TEMPLATE`
- worker image: `sha256:7e8bf43653ebd81d1f3fd4452bb2181a1dc11fd97c0ee69789d67b072eebf673`
- secure RTX 4090 rate: `$0.74/hr`
- create requests used: `1`
- retry create: `false`

## Important progress
The V1/V2 startup problem is resolved on the V3 template-backed REST path.

The worker started and wrote startup state:
- poll 1: exactActive=1 desired=RUNNING startup=NONE
- poll 2: exactActive=1 desired=RUNNING startup=NONE
- poll 3: exactActive=1 desired=RUNNING startup=PRIVATE_SCENERY_DISCOVERY state=FAILED

This proves the container and Node worker executed. Blender was not reached because discovery failed first.

## Exact failure
`SCENERY_ROLE_MISSING`

`Required purchased scenery role missing: nature_library`

## Corrected root cause
This is **not** a unique-key collision.

A live replay of the exact worker selector against the private inventory showed:

- Independent web/bridge preflight: 12/12 because Botaniq matches `nature_library` include with no size filter.
- Worker greedy unique-key selection: 8 roles selected, then `nature_library` has zero unused passing candidate.

The only include-hits for `nature_library` were:

| object | size | worker reject |
| --- | --- | --- |
| `botaniq_full-7.2.0.paq.zip` | 4915.1 MiB | `maxBytes>900MiB` |
| `botaniq_full_geoscatter_biomes-7.1.1.scatpack.zip` | 5.3 MiB | `exclude` `/geoscatter.*biomes/` |
| GeoScatter receipt JSON | 0 MiB | `exclude` |

The purchased forest nature kit (660.7 MiB) is already used as `forest_geometry` and does **not** match the worker `nature_library` include patterns, so it cannot fill that role unless copied to a distinct compatibility key.

Raising the 900 MiB cap to admit Botaniq is not viable for the next paid run: Botaniq alone is 4.9 GiB and would blow the 5 GiB materialization cap together with mountain/forest/sky packages.

## Cleanup
- matchedBefore: 1
- terminatedCount: 1
- remainingActiveExactName: 0
- billingCleanupConfirmed: true
- cleanup createPerformed: false
- live recheck: 0 RunPod pods

No active/billable V3 showcase pod remains.

## Authorization
V3 authorization is exhausted. Do not retry V3 and do not re-send the paid CREATE.

## Zero-cost follow-up already applied
A private compatibility alias was copied from the purchased `Stylized_Forest_Nature_Kit.zip` to:

`tivvlejoy-assets/showcase-compat/Assets Library.zip`

That key matches the already-baked worker `/assets library/i` rule, is 660.7 MiB, and is a distinct object. Worker-equivalent unique-key + maxBytes selection now returns 12/12 distinct purchased objects. Source bytes were not modified. No new CREATE was performed.

PR #169 remains OPEN / DRAFT / UNMERGED / NOT READY.
