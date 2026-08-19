# TIVVLEJOY_CONTINUITY_LEDGER_V1

Symbolic, versioned continuity across shots and episodes.

This ledger does **not** modify Pip or Goat assets. It records facts only.

## Fact identity

Each fact has:

- `continuityFactId`
- `continuityVersion`
- `effectiveEpisode`
- `effectiveShot`
- `state`
- `source`
- `dependencySha256`

Topics include character identity/scale/accessories, carried props, story
props, prop ownership/state, location identity/variant, season, weather,
time of day, screen direction, entry/exit, camera side, lighting, damage,
map state, doors/windows, consumed items, signage, and recurring backgrounds.

## Evaluation

`evaluateContinuity` compares observations to the latest prior fact:

- CONTINUITY_VALID
- CONTINUITY_MISSING (no prior PROP_CARRIER / PROP_STATE / SIGNAGE fact)
- CONTINUITY_STALE (unjustified change across episodes)
- CONTINUITY_CONFLICT (unjustified change in the same episode)

Justified changes must be explicit:

- `TRANSFER:...`
- `STORED...`
- `TRANSITION:...`

Examples:

- Pip carries the map in shot 5 → it cannot vanish in shot 6 unless transferred or stored.
- Goat enters screen-right → the next connected shot cannot reverse without a justified cut.
- A snowing bakery cannot become summer-clear without a transition.
- Bakery sign identity persists across episodes unless explicitly changed.

Conflicts on one subject do not invalidate unrelated subjects.
