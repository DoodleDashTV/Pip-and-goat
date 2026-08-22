# TivvleJoy EP012 Preview execution-ledger migration V1

## Scope

The dedicated EP012 execution ledger was created in the branch-scoped Vercel Preview database only. Production, ElevenLabs, R2 objects, scenery, reservations, finalization, and the locked dialogue were not touched.

## Stack

- Base: Draft PR #94, `cursor/tivvlejoy-ep012-preview-execution-ledger-repair-73f1`
- Base SHA: `2f7ce9325b88996510f21b61aaa85ccacbee91bd`
- Migration branch: `cursor/tivvlejoy-ep012-preview-ledger-migration-73f1`
- Draft PR: #95

## Applied payload

- Migration: `20260821010000_tivvlejoy_ep012_voice_execution`
- SQL SHA-256: `3432791735d5c561eda9e96dfb96b73b24d8cf832a4409765e02e418429f192c`
- Statements applied: the one `CREATE TABLE` and one `CREATE UNIQUE INDEX` statement from that exact pinned file
- Successful carrier commit: `32668508acddf2807f945f594d61a280ac844e97`
- Successful Preview deployment: `dpl_CsEEs3m9NdVAS4ot4XiASJZFmZ7Y`
- Deployment target: Preview (`target: null`)
- Deployment state: READY

The dedicated ledger database had non-authoritative Prisma migration history, so a broad `prisma migrate deploy` was refused. The carrier instead applied only the exact pinned migration SQL in a PostgreSQL transaction after confirming the reconciled Preview ledger identity.

## Fail-closed evidence

Earlier carrier attempts did not write schema data:

- `633a0df3b61f3630f82784653ebff211adc963de` refused an unexpected Prisma pending-migration set.
- `2a8a246710e7b39d5b475191da1134fce9d0985d` stopped on a sanitized Prisma `P2010` before DDL.
- `25e49c5a96bcac94d711d2ec57f0c9b3e7909d63` identified the unsupported advisory-lock probe and stopped before DDL.

The successful carrier replaced the unsupported advisory lock with a standard row lock on the verified `preview-voice-ledger` state row. Before DDL it required:

- exact Vercel Preview runtime, branch, team, and project;
- exact migration file hash and statement set;
- monthly ledger tables readable;
- reconciled state exactly `4` paid requests and `235` paid characters;
- zero failed attempts, reservations, reserved characters, and unfinalized items;
- the EP012 execution table absent.

After DDL it required the execution ledger to have the exact expected columns, primary key, unique segment index, and zero rows.

## Read-only verification after migration

The already-live PR #94 deployment independently returned:

- HTTP 200
- `status: READY`
- `executionLedgerReadable: true`
- `serverGates.allPassed: true`
- `readyForProviderContact: true`
- blockers: none
- global ledger: `4 / 235`
- EP012 succeeded: `0 / 11` requests and `0 / 460` characters
- reserved requests: `0`
- reserved characters: `0`
- unfinalized count: `0`
- failed attempts: `0`
- provider requests made: `0`

No Generate POST or authorized paid canary was performed. A paid canary still requires separate explicit authorization.

## Cleanup

The one-time migration script, its test, and the Vercel build hook were removed after the successful Preview migration. They are not part of the final branch tree.
