# TIVVLEJOY_APPROVED_ASSET_WORLD_BUILDER_BRIDGE_V1

Planning / contract / synthetic-test only.

This stack builds the production-planning bridge from purchased source intake to
deterministic World Builder semantic resolution and Shot Assembly.

## Architecture

```
PURCHASED SOURCE
→ PRIVATE R2
→ DYNAMIC AUDIT
→ CONTROLLED INSPECTION
→ INSPECTION RECEIPT
→ EXPLICIT APPROVAL
→ APPROVED LOGICAL ASSET
→ APPROVED ASSET REGISTRY
→ WORLD BUILDER SEMANTIC REQUEST
→ DETERMINISTIC RESOLVER
→ RESOLUTION RECEIPT
→ SHOT ASSEMBLY SLOT
→ BLENDER EXECUTION READINESS
```

Rules:

- UPLOADED ≠ APPROVED
- INSPECTED ≠ APPROVED
- APPROVED SOURCE PACKAGE ≠ EVERY CHILD ASSET APPROVED
- The purchased filename is never the production identity

## Source vs approved asset identity

A ZIP/BLEND/FBX/GLB is an immutable source. Inspection may discover many logical
assets inside one source. Those logical assets receive `assetId` + `assetVersion`.

World Builder requests semantic capabilities. It never requests filename, path,
object key, zip name, blend filename, upload order, catalog index, or "latest".

## Inspection and approval evidence

`TIVVLEJOY_ASSET_INSPECTION_EVIDENCE_V1` is the contract a future controlled
inspection worker must satisfy. This PR does not inspect commercial bytes.

Hero scenery also requires explicitly approved visual evidence. Metadata alone
cannot approve a hero environment asset.

## Registry and resolver

`TIVVLEJOY_APPROVED_ASSET_REGISTRY_V1` is an immutable snapshot sorted by
`assetId` + `assetVersion`. Adding an asset changes `registrySha256`.
Reordering, filenames, and display labels do not.

The resolver uses hard eligibility filters, then a lexicographic rank tuple.
Continuity pins win when still valid. Invalid pins return
`BLOCKED_CONTINUITY_PIN_INVALID` with no silent substitute.

Already-bound resolution receipts stay immutable when the library grows.

## Canonical / duplicate

One selectable PRIMARY per `canonicalGroupId`. DUPLICATE and ARCHIVAL are never
selected. Two PRIMARY records in one group fail closed as
`BLOCKED_CANONICAL_CONFLICT`.

## Shot Assembly

Resolved slots propagate approved asset id/version and the full receipt chain.
Environment manifest hashing includes those identities. Character rig gates are
unchanged. Real Blender assembly remains unauthorized.

## Future PR #79 convergence

This stack depends on `ApprovedAuditSourceInput`, not the purchased-tools
implementation. PR #79 can later map audit reports into that shape without
rewriting the resolver.

## Safety

No commercial files read. No Blender execution. No GPU. No paid compute.
No auto-approval. Botaniq remains NOT_ACTIVATED. Geo-Scatter remains
NOT_INTEGRATED. Gaffer and Physical Starlight remain optional and not activated.
