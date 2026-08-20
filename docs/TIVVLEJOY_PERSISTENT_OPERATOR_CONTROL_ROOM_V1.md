# TIVVLEJOY_PERSISTENT_OPERATOR_CONTROL_ROOM_V1

Preview operator persistence panel on `/production-control`.

## Displayed facts

- Current persistence mode
- Durable: YES / NO
- Preview database: CONNECTED / NOT_CONNECTED / ERROR
- Production database: NOT_CONNECTED unless truly configured
  (this increment always shows NOT_CONNECTED)
- Last successful save
- Current workspace revision
- Latest snapshot hash
- Journal event count
- Pending write conflicts
- Recovery status
- Backup available
- Persistence health

No secrets. No connection strings. No Production connect button. No
database creation button.

## Preview actions

- Export Backup
- Import Backup (explicit confirmation required)
- Refresh State
- Validate Persistence

## Save status

`Saved` is shown only after a persistence receipt
(`WRITE_ACCEPTED` or `WRITE_IDEMPOTENT`).

Other states: `Saving`, `Unsaved changes`, `Conflict detected`,
`Save failed`.

Navigation / reload warns when Preview state is dirty, where the
framework allows `beforeunload`.

## Health

`TIVVLEJOY_PERSISTENCE_HEALTH_V1` returns:

HEALTHY, DEGRADED, NOT_CONFIGURED, UNAVAILABLE, CORRUPT, CONFLICTED.

Production-mode health checks do not mutate Production.

## Honesty

Browser Preview is not durable Production persistence.
Database-ready does not mean database connected.
Stored does not mean approved.
Persisted does not mean rendered.
Render receipt does not mean QC passed.
QC passed does not mean published.
