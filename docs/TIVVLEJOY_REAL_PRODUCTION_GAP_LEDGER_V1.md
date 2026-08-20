# TIVVLEJOY_REAL_PRODUCTION_GAP_LEDGER_V1

Each gap records:

`gapId`, category, exact dependency, affected episodes/shots, resolution type,
human / external-file / paid flags, priority, critical-path flag, and
`evidenceSha256`.

Priority order favors first-episode critical path and blocked shot count. A
missing production rig outranks cosmetic UI work.

The ledger also emits a ready-while-waiting queue and a secret-free operator
morning brief.
