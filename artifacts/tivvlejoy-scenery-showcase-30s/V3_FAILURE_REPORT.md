# TIVVLEJOY_REAL_SCENERY_30S_V3_FAILURE_REPORT

## Result
FAILED at `PRIVATE_SCENERY_DISCOVERY` after the single authorized V3 CREATE.

- workflow run: `33130281845`
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

The web preflight had reported 12/12 roles, but its role check only tested whether at least one object matched each role independently. The worker uses a stricter greedy selection and requires a distinct unused object key for every role. The preflight therefore produced a false positive when a candidate needed by `nature_library` had already been consumed by an earlier role.

## Cleanup
- matchedBefore: 1
- terminatedCount: 1
- remainingActiveExactName: 0
- billingCleanupConfirmed: true
- cleanup createPerformed: false

No active/billable V3 showcase pod remains.

## Authorization
V3 authorization is exhausted. Do not retry V3 and do not re-send the paid CREATE.

## Next zero-cost fix
Add a worker-equivalent role-selection preflight using the exact unique-key selection rules. If the only collision is `nature_library`, create one private compatibility alias copied from an actual purchased nature-library candidate, then prove all 12 roles can be selected as 12 distinct private objects before requesting any new paid authorization.

PR #169 remains OPEN / DRAFT / UNMERGED / NOT READY.
