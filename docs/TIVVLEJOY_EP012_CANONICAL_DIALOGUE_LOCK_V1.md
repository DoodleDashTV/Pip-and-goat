# TIVVLEJOY_EP012_CANONICAL_DIALOGUE_V1

Episode: `EP012` — **The Bakery Map**

Status: canonical spoken-text lock only.

This document locks the seven approved EP012 dialogue records exactly as approved. It does **not** authorize or perform voice generation, scenery download, Blender execution, rig admission, rendering, publishing, or paid compute.

Aggregate dialogue SHA-256:

`f0b85a04a301359750d59da9699b2d7c26f0acee6d517b83e80fd9420aeb1ac4`

## Canonical lines

### DL_HOOK_01 — PIP_AND_GOAT

Canonical text:

`Pip: “Goat, wait—that flour trail is shaped like our map!” Goat: “Then breakfast just became a clue.”`

Pip subsegment:

`Goat, wait—that flour trail is shaped like our map!`

Goat subsegment:

`Then breakfast just became a clue.`

### DL_DISCOVERY_01 — PIP

`Look! The trail leads behind the bakery shelves. Someone wanted us to find this.`

### DL_DECISION_01 — GOAT

`Then we follow it before the baker sweeps our clue away.`

### DL_ACTION_01 — PIP_AND_GOAT

Canonical text:

`Pip: “I’ll check the shelves.” Goat: “I’ll check the oven—carefully.”`

Pip subsegment:

`I’ll check the shelves.`

Goat subsegment:

`I’ll check the oven—carefully.`

### DL_COMPLICATION_01 — PIP_AND_GOAT

Canonical text:

`Goat: “Nothing here. Just crumbs.” Pip: “Crumbs don’t sparkle. Lift that tray!”`

Goat subsegment:

`Nothing here. Just crumbs.`

Pip subsegment:

`Crumbs don’t sparkle. Lift that tray!`

### DL_PAYOFF_01 — PIP

`It’s a missing map piece! The bakery was hiding part of the trail.`

### DL_BUTTON_01 — PIP_AND_GOAT

Canonical text:

`Goat: “Mystery solved. Bun time?” Pip: “One bun. Then we follow the map.”`

Goat subsegment:

`Mystery solved. Bun time?`

Pip subsegment:

`One bun. Then we follow the map.`

## Lock behavior

The implementation stores:

- exact dialogue IDs
- exact top-level speakers
- exact canonical text
- exact Pip/Goat spoken subsegments
- per-text SHA-256
- per-line SHA-256
- per-subsegment SHA-256
- one aggregate EP012 dialogue SHA-256

The lock verifies all hashes at module load and fails closed if text, speaker, ID, order, or a locked hash drifts.

`voiceGenerationPerformed=false`

`commercialBytesDownloaded=0`
