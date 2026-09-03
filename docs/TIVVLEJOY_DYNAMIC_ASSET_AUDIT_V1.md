# TIVVLEJOY_DYNAMIC_ASSET_AUDIT_V1

Read-only Preview audit that reconciles every `PURCHASED_TOOL_PACKAGES` catalog entry against private R2 upload/source receipts.

The audit has **no hard-coded asset total**. Adding a future catalog entry automatically changes `catalogAssetCount`.

## Output

Each source reports identity, receipt presence, stored size, SHA-256, inspection, duplicate/canonical state, World Builder eligibility, production usability, blockers, and warnings.

Aggregate counts are derived from the current catalog and receipts:

- catalogAssetCount
- uploadedCount
- sizeVerifiedCount
- hashVerifiedCount
- inspectionPendingCount
- inspectionPassedCount
- usableCount
- archivalCount
- duplicateCount
- blockedCount
- missingCount

## Safety

This audit does not delete, rename, or modify R2 objects, install add-ons, execute Blender or commercial files, launch RunPod or GPU, spend money, auto-approve assets, mutate Production, or change Pip, Goat, or voices.

Uploaded is not usable. World Builder may consume only `worldBuilderEligible=true`.

Botaniq remains immutable. Geo-Scatter remains not integrated. STORE_ONLY is not production usable. INSTALL_LATER is not automatically installed.

## Preview

Open `/purchased-assets/audit`. Paste the existing studio token and tap **Refresh Audit** to load private receipts.
