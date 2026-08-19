# TIVVLEJOY_SCENERY_LONGEVITY_AND_REPETITION_RISK_V1

Planning / synthetic validation only.

## Why the fixed 48 was removed

`estimatedEpisodeCoverage: 48` was a **planning placeholder**, not a hard
production limit. It implied a scenery ceiling that TivvleJoy does not have.

48 WAS A PLANNING PLACEHOLDER, NOT A HARD PRODUCTION LIMIT.

Scenery longevity is not:

- number of files
- number of ZIPs
- number of approved packs
- a Cartesian product of season × weather × time

There is no simple episode ceiling. Creative direction, shot design, and story
requirements change how long a library stays fresh.

## Capacity vs repetition

**Capacity / coverage strength** answers: can this library support a
*caller-supplied* season target?

**Repetition risk** answers: given actual or inferred usage, how likely are
viewers to notice repeated environments?

The engine evaluates `requestedEpisodeCount`. It never invents
"you can make exactly X episodes" unless X is that supplied target.

## Approved asset contribution

When a PR #80 Approved Asset Registry snapshot is supplied, only selectable
approved logical assets count:

- APPROVED
- world-builder and shot-assembly eligible
- receipts and hashes present
- not DUPLICATE / ARCHIVAL / BLOCKED / QUARANTINED
- not license-blocked
- not STORE_ONLY / Botaniq-only

Canonical group identity matters. Ten files of the same tree are one choice.

## Visual signatures

`environmentVisualSignatureSha256` hashes location, archetype, approved hero
IDs, supporting families, interior shell, background/terrain/path families,
season, weather, time of day, lighting family, and major dressing state.

It excludes episode number, filename, display label, and array order.

Two bakery episodes can have different signatures if weather, season,
background, or dressing change in a meaningful way.

## Usage windows

`recentWindowSize` is analysis configuration. The default is 10 recent
episodes. That is not a production limit. Callers may choose another window.

## Hero / interior / background pressure

Hero environments weigh more than tiny props. Interiors report shell count and
reuse pressure separately. Background families (mountain, sky, fill) can
refresh a reused hero location without a new purchase.

Semantic roles report UNDERUSED / HEALTHY / BUSY / OVERUSED from demand versus
selectable canonical supply.

## Specialty gaps and purchase

Specialty roles such as `CAVE_HERO_CRYSTAL` are flagged only when a planned
story requires them.

Purchase decisions:

- `NO_PURCHASE_NEEDED`
- `OPTIONAL_EXPANSION` (pressure only; not a buy order)
- `PURCHASE_MAY_BE_JUSTIFIED` only after approved registry, native procedural,
  derivative, kitbash, background substitution, and rewrite options fail

No "buy more because repetition is 72%" logic.

## Confidence

- HIGH: approved-production-plan evidence plus detailed usage/plan
- MEDIUM: approved-production-plan evidence but limited history
- LOW: synthetic Preview / planning archetypes only

Synthetic Preview data must not pretend to be live R2 approvals.

## Flow

```
CALLER SEASON TARGET
→ WORLD BUILDER LOCATIONS / ARCHETYPES
→ OPTIONAL APPROVED ASSET REGISTRY
→ OPTIONAL USAGE HISTORY
→ VISUAL SIGNATURES + MEANINGFUL VARIANTS
→ ROLE / LOCATION / ARCHETYPE PRESSURE
→ REPETITION RISK + REASONS
→ SPECIALTY GAPS
→ PURCHASE DECISION
```
