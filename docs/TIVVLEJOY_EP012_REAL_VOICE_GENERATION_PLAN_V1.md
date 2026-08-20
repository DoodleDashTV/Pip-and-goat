# TIVVLEJOY_EP012_REAL_VOICE_GENERATION_PLAN_V1

EP012 still has seven missing real line receipts:

- `DL_HOOK_01` — PIP_AND_GOAT
- `DL_DISCOVERY_01` — PIP
- `DL_DECISION_01` — GOAT
- `DL_ACTION_01` — PIP_AND_GOAT
- `DL_COMPLICATION_01` — PIP_AND_GOAT
- `DL_PAYOFF_01` — PIP
- `DL_BUTTON_01` — PIP_AND_GOAT

Speakers come from the current episode beats. The plan has dialogue IDs only. There is no canonical spoken text and no text hash, so character counts are null.

No old valid real receipt exists in current durable or Preview fixtures. Existing fixtures are synthetic-only and must not be bound as real.

Expected output: real audio plus at least line timing. Do not synthesize.

## Cost

`VOICE_COST_UNKNOWN_REQUIRES_AUTHORIZATION`

Pip characters, Goat characters, and total characters stay unknown until spoken text exists. Pricing is not invented.

## Timing workflow

REAL_AUDIO → TIMING_EXTRACTION → VISEME → ANIMATION → EDITORIAL → CAPTIONS

Real generation may provide audio, line timing, and sometimes word timing. Phoneme timing is not guaranteed and must not be invented. Synthetic timing may not be relabeled real.
