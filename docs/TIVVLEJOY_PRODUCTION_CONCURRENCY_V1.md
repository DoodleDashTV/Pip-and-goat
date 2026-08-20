# TIVVLEJOY_PRODUCTION_CONCURRENCY_V1

Optimistic concurrency for Preview operator tabs and retried writes.

## Write results

| Result | Meaning |
|---|---|
| `WRITE_ACCEPTED` | Expected revision matched. New content committed. |
| `WRITE_IDEMPOTENT` | Same entity content hash. No duplicate row. Revision unchanged. |
| `WRITE_CONFLICT` | Client revision is behind the store. Payload discarded. |
| `WRITE_STALE` | Client revision is ahead of the store. Payload discarded. |
| `WRITE_REJECTED` | Adapter refused the write (disconnected, fault, invalid). |

## Required two-tab case

Both tabs load revision 5.

- Tab A writes → revision 6, `WRITE_ACCEPTED`
- Tab B writes based on revision 5 → `WRITE_CONFLICT`

No last-writer-wins corruption.

A duplicate request with the same content hash returns
`WRITE_IDEMPOTENT` and does not create a second persistent job.

## Transactions

`commitAggregate` is the atomic boundary.

Examples:

- compile production packet + state graph snapshot + journal event
- QC receipt + delivery readiness

Preview adapters simulate atomic commit with clone / validate / swap.
A mid-write fault discards the pending clone. Current records stay at
the last valid revision. The journal records `WRITE_FAILED`.
