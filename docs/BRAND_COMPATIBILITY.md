# Brand compatibility policy

The studio's product-facing name is **TivvleJoy Studios**. Internally it is still DDP —
"Doodle Dash Production" — and that is deliberate rather than leftover.

The internal name is load-bearing. It appears in database rows, storage prefixes,
environment variables, API contracts, worker image names and the provenance chain of a
closed acceptance render. A find-and-replace across those would be the single most
effective way to orphan accepted evidence. So the rebrand is a **presentation-layer
change with a resolver**, not a rename.

Everything lives in one module: `packages/domain/src/brand.ts`.

## What a user sees

| Constant | Value | Use |
| --- | --- | --- |
| `STUDIO_DISPLAY_NAME` | `TivvleJoy Studios` | every user-facing surface |
| `STUDIO_SHORT_NAME` | `TivvleJoy` | tight mobile headers |
| `resolveStudioDisplayName(stored)` | → display name | rendering a stored brand value |

## What is persisted and compared

| Constant | Value | Why it does not move |
| --- | --- | --- |
| `INTERNAL_BRAND_NAME` | `Doodle Dash Production` | stored in `universe.brandName`; existing tests query rows by this literal, and `cost-optimized-production` reconciles it |
| `INTERNAL_BRAND_ABBREVIATION` | `DDP` | env vars, storage prefixes, worker image tags, artifact paths, stdout prefixes |
| `PRODUCT_DISPLAY_NAME` | = `INTERNAL_BRAND_NAME` | the value the database bootstrap writes; changing it would rewrite every seeded row |
| `CHANNEL_DISPLAY_NAME` | `Doodle Dash TV` | the channel is a separate property from the studio and was explicitly excluded |
| `UNIVERSE_CANON_NAME` | `Doodle Dash Universe` | in-fiction show canon, seeded and referenced by canon facts |

## Legacy values keep loading

`LEGACY_BRAND_ALIASES` lists every brand name that has ever been persisted.
`isKnownBrandName()` recognises them case-insensitively and whitespace-tolerantly, and
`resolveStudioDisplayName()` maps any of them onto the current display name — so a row
written before the rebrand presents as TivvleJoy Studios without being migrated.

An **unrecognised** value passes through untouched. If someone deliberately named their
universe something else, that is their name and not ours to overwrite.

Adding a future brand name means appending one alias and changing
`STUDIO_DISPLAY_NAME`. Nothing else.

## Internal DDP names that stay, and why

Recorded as data in `PRESERVED_INTERNAL_DDP_NAMES` so the reasoning is available at the
point of temptation, and asserted by test so the list cannot quietly shrink.

| Name | Reason |
| --- | --- |
| `Doodle Dash Production` | persisted in `universe.brandName` on existing rows and asserted by existing tests |
| `Doodle Dash Universe` | in-fiction show canon, seeded and referenced by canon facts |
| `Doodle Dash TV` | the channel is a separate property, explicitly excluded from the rebrand |
| `Doodle Dash Shorts` | a delivery format profile matched by name in readiness and cost planning |
| `DDP` | env vars, storage prefixes, worker image tags, artifact paths |
| `DDP_ShadowShrink` | a vertex group baked into the approved character assets by the chest-seam repair |
| `@doodle-dash/*` | workspace package names; renaming churns every import for no user-visible gain |
| `ddp-runpod-blender` | published worker image name, pinned by digest in closed acceptance evidence |
| `ddp-scene-plan-v1`, `ddp-production-blueprint-v1`, `ddp-cloud-job-manifest-v1` | schema version strings that participate in cache keys and migrations |

Also unchanged: `production-library/` paths, R2 bucket and key layout, secret names, and
every historical artifact under `artifacts/`. Pip, Goat, `CHAR_PIP_001`,
`CHAR_GOAT_001`, asset ids and voice ids `pip_default_v1` / `goat_default_v1` are
character identity, not branding, and are locked.

## Adding a user-facing surface

Import `STUDIO_DISPLAY_NAME`, or `resolveStudioDisplayName()` when the value came from
the database. Never hardcode either brand name in a component, and never compare a
stored value against the display name — compare against `INTERNAL_BRAND_NAME`, or use
`isKnownBrandName()`.

## Tests

`apps/web/src/lib/brand-and-regression.test.ts` covers it: every legacy alias resolves,
unrecognised names pass through, the persisted identifier is unchanged, the seed still
writes the internal name, the preserved-names list has not shrunk, and a manifest
written before the direction layer still parses and still hashes to the same cache key.
