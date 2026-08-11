# Canonical Reference Policy

## PRIMARY_CANONICAL_REFERENCE

- One primary approved visual reference per character version lineage.
- Stored with SHA-256, storage URI, approval metadata, DNA version.
- **Immutable after approval** — never overwrite; new uploads become new candidate versions.
- Old episodes keep their linked reference versions.

## Reference vs model

| Artifact | Means |
|----------|--------|
| Canonical JPEG | Visual identity / conditioning / art direction |
| Production `.blend` | Authoritative 3D asset after model-to-reference review + PRODUCTION_READY gates |

Approving a JPEG **must not** set MODEL / RIG / FACIAL / ANIMATION to READY.

## AI video

AI video remains **OFF** by default. If explicitly used for Pip/Goat:

1. Cost Guardian approval required
2. Approved reference conditioning mandatory when supported
3. Failure → **FAIL CLOSED** (no text-only Pip/Goat)

## Turnaround slots

PRIMARY, FRONT, THREE_QUARTER, SIDE, BACK, EXPRESSION_SHEET, POSE_SHEET, COLOR_REFERENCE

Do not fabricate missing views or mark them approved.
