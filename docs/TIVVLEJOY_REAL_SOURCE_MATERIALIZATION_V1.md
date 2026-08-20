# TIVVLEJOY_REAL_SOURCE_MATERIALIZATION_V1

Conservative materialization budget:

- `maxSingleObjectBytes` default 8 MiB
- `maxTotalMaterializedBytes` default 24 MiB
- `maxConcurrentDownloads` default 2
- `timeoutMs` default 20s
- `billingUncertainty` default true

## Holds

- Botaniq multi-GB archives stay `NOT_ACTIVATED`
- Gaffer / Physical Starlight stay optional and uninstalled
- Historical duplicates and wrappers are deprioritized

## Hashing

SHA-256 is streamed in 64 KiB chunks. Multi-GB files are never loaded whole.
Interrupted materialization resumes from an existing hash receipt instead of
duplicating inspection receipts.

Temp disk is tracked and cleaned after inspection.
