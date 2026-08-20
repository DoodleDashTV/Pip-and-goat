# TIVVLEJOY_SCENERY_APPROVAL_WORKFLOW_V1

States: `NOT_REVIEWED`, `TECHNICALLY_BLOCKED`, `READY_FOR_VISUAL_REVIEW`,
`VISUAL_REVIEW_REQUIRED`, `APPROVED`, `REJECTED`, `ARCHIVAL_ONLY`.

Synthetic or system actors cannot issue human approval. Hero candidates also
need visual evidence. Approval must cite:

- `candidateDependencySha256`
- `inspectionSha256`
- `visualEvidenceSha256` when visual review is required

Two reviewers cannot silently overwrite each other. A stale revision returns
`WRITE_CONFLICT`.

Preview fixture approvals must stay labeled synthetic.
