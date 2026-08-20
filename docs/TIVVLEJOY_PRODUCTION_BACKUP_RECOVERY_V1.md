# TIVVLEJOY_PRODUCTION_BACKUP_RECOVERY_V1

Export / import contract for a production workspace.

## Export contents

- backup schema
- workspace identity
- entity counts
- latest valid snapshot
- event journal
- content hashes
- `backupSha256`
- `secretsExcluded: true`
- `commercialBytesExcluded: true`

Metadata and references only. No commercial bytes. No secrets. No
signed URLs.

Maximum encoded size: 8 MiB.

## Import

Import must:

1. require explicit confirmation
2. validate schema
3. validate `backupSha256`
4. validate size limits
5. reject secrets
6. detect duplicates
7. detect the wrong workspace
8. reject unsupported future versions

Malformed backups are never auto-imported. A rejected import leaves
existing state unchanged.

## Schema evolution

Inspect / migrate helpers return:

- `MIGRATION_NOT_REQUIRED`
- `MIGRATION_AVAILABLE`
- `MIGRATION_COMPLETE`
- `MIGRATION_BLOCKED`
- `UNSUPPORTED_FUTURE_SCHEMA`

Unknown or future schemas are not destructively mutated.

## Recovery

Cold-boot: serialize → destroy the client → hydrate a **new** store →
rebuild season health, packets, continuity, batches, jobs, QC, and
delivery from records. Hashes must match.

Crash injection at write boundaries must leave last-valid records
readable and classify the incomplete operation as a safe retry.
