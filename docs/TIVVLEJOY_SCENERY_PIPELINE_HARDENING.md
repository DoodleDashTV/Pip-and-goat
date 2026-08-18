# TivvleJoy scenery pipeline hardening

Checkpoint: `TIVVLEJOY_SCENERY_PIPELINE_HARDENING_V1`

Stacked on Draft PR #46 (`cursor/tivvlejoy-scenery-one-tap-upload-73f1`). Keep #44, #45, and #46 open, draft, and unmerged.

This pass turns Preview scenery intake into a recoverable, production-oriented workflow that can later process the 27 purchased files without another code change.

It does **not** upload, invent, inspect-execute, extract, convert, normalize, or approve licensed assets. Production is not retargeted. Existing Preview R2 settings are not modified.

## What the 27-file workflow does

1. An authorized TivvleJoy studio session enters the Preview-only intake token through `x-tivvlejoy-scenery-intake-token`.
2. The operator taps **Select and upload all 27 purchased files**.
3. Exact inventory filenames are matched across Village (7), Sky-HDRI (7), Stylized Forest (4), and Procedural Nature (9).
4. Pre-upload review shows matched, missing, unexpected, duplicate, incorrect, collection totals, and overall totals.
5. Eligible files hash in the browser with chunked Web Crypto / Worker hashing, then upload browser → signed private storage. They do not pass through a Vercel request body.
6. At most two files are in flight at once. Parts are sliced; the client does not hold all 27 files fully in memory for hashing or upload.
7. Every completed source object is verified before inspection readiness. Upload is not approval.

## What it refuses

- Missing, unexpected, duplicate, incorrectly named, zero-byte, and incorrectly sized files
- Traversal, control characters, Unicode-ambiguous names, and prefix-escape object keys
- The free World Shaders giveaway, unless an approved intake manifest already lists it
- Tokens in the JSON body, query, or any `NEXT_PUBLIC_` variable
- Writes outside `tivvlejoy-assets/source/` for purchased files
- Silent rename of source filenames
- Automatic approval, Blender script execution, untrusted archive extraction, paid GPU, and Production mutations

Ineligible files are refused individually. Valid eligible files stay eligible.

## Recovery behavior

Interrupted multipart uploads can continue after refresh, browser restart, temporary network loss, expired part URLs, and Preview redeployment.

- Browser recovery stores session metadata only: session id, filename, collection, size, hash, finished part numbers, and timestamps.
- Tokens, credentials, signed URLs, and upload ids are never stored in `localStorage`.
- Stale or expired sessions are detected from created/updated timestamps.
- Resume refreshes part URLs and retries only unfinished or failed parts.
- Pause keeps finished parts. Cancel/abort is idempotent. Complete is idempotent.
- If completion is ambiguous (network uncertainty) but the stored object size already matches, the session is treated as complete.

Recovered states are labeled in words: paused, retryable, failed, cancelled, stored, quarantined, duplicate, inspection-ready, expired, and stale.

## Verification and quarantine

A completed upload is not inspection-ready until verification passes.

Verification checks declared size, stored size, object presence, checksum presence, part-count consistency, and hash mismatch. Archive presence is not treated as proof that contents are safe or usable.

Quarantine reasons are deterministic. Corrupt, incomplete, unsupported, or mismatched objects stay quarantined. Original filename, collection, byte size, hash, timestamps, and source-object identity are preserved.

## Inspection-readiness meaning

Inspection-ready means a **non-executing** inspection job may be queued. It does not mean the asset is approved.

Queued jobs record expected checks for scale, units, transforms, materials, textures, missing dependencies, object counts, polygon counts, cameras, lights, rigs, animations, geometry nodes, unsupported formats, and archive structure.

Embedded scripts in `.blend` files or archives are not executed. Untrusted archives are not extracted in this pass. Reports stay dry-run and reviewable. Justin still approves later.

## Security boundaries

- Preview-only intake token, server-side, accepted only through `x-tivvlejoy-scenery-intake-token`
- Authorization failures never reflect the token in JSON, HTML, errors, telemetry, or client recovery state
- Filenames and object keys are checked for traversal, control characters, Unicode ambiguity, and prefix escape
- Purchased writes stay under the existing `tivvlejoy-assets` prefix
- JSON body size, part count, concurrent parts, concurrent files, and request rate are bounded for Preview
- Production environment configuration is not modified
- Existing Preview R2 configuration is not modified

## Preview-only limitations

- Independent server-side SHA-256 of stored R2 bytes remains unavailable in this serverless Preview
- Blender 4.2 is not executed
- Connection-ready mode still applies when private storage is absent
- The 27 purchased files are not required in this agent environment and must not be invented

## Future real upload

When Justin has the 27 purchased files:

1. Open the Preview `/scenery` page for this stacked branch, not Production.
2. Enter the Preview intake token in the studio token field. Do not commit it. Do not put it in `NEXT_PUBLIC_*`.
3. Tap **Select and upload all 27 purchased files** and choose the exact inventory filenames.
4. Confirm the review: 27 matched, 0 missing, 0 unexpected, 0 incorrect.
5. Upload or retry eligible files. Use pause, resume, retry failed parts, or cancel if a transfer is interrupted.
6. Confirm stored bytes, verification, quarantine reasons, and inspection readiness.
7. Leave the files in quarantine/verification until Justin reviews inspection reports.

Upload does not mean asset approval.

Licensed files are not committed to Git. Purchased source files are not placed under `source/` in the repository or under `production-library/`.

## Observability

Structured lifecycle events record created, resumed, cancelled, completed, duplicate, failed, quarantined, and inspection-ready counts. Events are redacted. Tokens, credentials, signed URLs, raw headers, and licensed file contents are never logged. Correlation ids contain no secrets or personal data.
