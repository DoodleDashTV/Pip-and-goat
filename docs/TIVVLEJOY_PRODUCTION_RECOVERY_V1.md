# TIVVLEJOY_PRODUCTION_RECOVERY_V1

Deterministic job identity and idempotency for a studio that must survive
browser restarts, worker crashes, partial jobs, stale receipts, duplicated
requests, retries, failed renders, and dependency hash changes.

## Job identity

- `jobId`
- `jobType`
- `inputDependencySha256`
- `attemptNumber`
- `idempotencyKey`
- `checkpointRef`
- `resultReceiptRef`
- `retryClass`

Retry classes: SAFE_RETRY, REQUIRES_REVALIDATION, REQUIRES_HUMAN_REVIEW,
REQUIRES_NEW_AUTHORIZATION, DO_NOT_RETRY.

## Paid-work protection

Same job input + same authorization receipt + existing successful result
→ `REUSE_EXISTING_RESULT`.

A UI retry must not launch a second paid render. This pass never issues a
real authorization.

## Stale detection

If an asset, voice, shot, or approval hash changed, an old execution result
cannot silently satisfy the new dependency (`STALE_RESULT`).
