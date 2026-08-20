# TIVVLEJOY_EP012_DURABLE_LEDGER_RECONCILIATION_V1

Preview-only, no-provider, one-time reconciliation for the durable TivvleJoy voice ledger.

## Safety boundary

This endpoint does not call ElevenLabs, does not import the provider transport, does not call `generate()`, does not reserve or finalize any EP012 request, does not access scenery/R2, and does not modify the EP012 canonical dialogue lock.

Endpoint:

`POST /api/voice-production/ep012/ledger/reconcile`

Required body, with no extra fields:

```json
{
  "action": "reconcile-prior-usage",
  "confirmed": true
}
```

Required admin header:

`x-tivvlejoy-voice-ledger-admin-token: <Preview-only secret>`

## Preview-only environment

- `TIVVLEJOY_VOICE_LEDGER_DURABLE=true`
- `TIVVLEJOY_VOICE_LEDGER_DATABASE_URL=<dedicated Preview PostgreSQL URL>`
- `TIVVLEJOY_VOICE_LEDGER_RECONCILE_ADMIN_TOKEN=<random secret of at least 32 characters>`
- `TIVVLEJOY_VOICE_LEDGER_RECONCILE_REQUESTS=<exact successful request total from ElevenLabs>`
- `TIVVLEJOY_VOICE_LEDGER_RECONCILE_CHARACTERS=<exact billed character total from ElevenLabs>`
- `TIVVLEJOY_VOICE_LEDGER_RECONCILE_EVIDENCE=<short non-secret note explicitly naming ElevenLabs as the authoritative source>`

Never use the public website `DATABASE_URL` for `TIVVLEJOY_VOICE_LEDGER_DATABASE_URL`. Never put the admin token or database URL in a `NEXT_PUBLIC_*` variable.

The endpoint requires `VERCEL_ENV=preview` and refuses Production and local/development runtimes.

## Validation

The historical totals are read only from the server environment. Request totals and character totals must be canonical base-10 whole-number strings. The known historical request count cannot reset below two successful requests, and billed characters must be positive. Evidence must be 12-500 characters and explicitly identify ElevenLabs.

The endpoint requires a real PostgreSQL durable store. Shared-memory and unavailable stores are rejected. Before first import the state must be clean: no paid totals, failed attempts, reservations, reserved characters, unfinalized requests, imported status, or EP012 request entries.

## One-time behavior

The first valid call updates only the durable PostgreSQL ledger state through `importPriorUsageOnce()`.

A second call is idempotent only when request total, character total, and evidence exactly match the persisted reconciliation. Any conflicting re-import is rejected with HTTP 409 and does not replace the existing totals.

After first import, the endpoint performs a fresh authoritative read and requires:

- store kind `postgres`
- `available=true`
- `reconciled=true`
- `reconciliationStatus=imported`
- exact persisted request total
- exact persisted character total
- exact persisted evidence
- zero reserved requests/characters
- zero unfinalized requests
- zero EP012 request entries

If the authoritative read differs, the operation reports an error and paid generation remains blocked.

## Public response invariants

Every response reports:

- `providerContacted=false`
- `providerRequestsMade=0`
- `sceneryAccessed=false`
- `sceneryRequestsMade=0`
- `commercialBytesDownloaded=0`
- `dialogueLockMutated=false`
- `productionEnabled=false`

Secrets, database URLs, admin tokens, API keys, provider Voice IDs, and raw database errors are never returned.

Keep the stacked PR OPEN / DRAFT / UNMERGED / NOT READY until the real Preview ledger is configured and the subsequent no-provider EP012 preflight proves authoritative readiness.

## Preview deployment checkpoint — 2026-08-20

Operator reported the dedicated Preview PostgreSQL migration completed and the two Preview ledger environment variables configured in Vercel. This note intentionally contains no secrets. Live preflight verification remains required before treating the ledger as configured or available.
