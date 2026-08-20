# TIVVLEJOY_SCENERY_INSPECTION_CONTROL_ROOM_V1

Preview routes:

- `/scenery-inspection`
- `/production-control/scenery`

The control room shows catalog, stored, hash-verified, inspection-ready,
inspection-complete, deep-inspection-pending, logical children, visual-review,
approved, blocked, and archival counts.

Per source: source ID, display name, format, stored size, hash status,
inspection state, dependency status, style state, child candidate count,
blocker, and next safe action.

It does not expose R2 object keys, signed URLs, or credentials.

Child review is iPhone-friendly. Classification buttons are metadata-only.
Real approval requires an explicit confirmation of the exact receipt hashes.
