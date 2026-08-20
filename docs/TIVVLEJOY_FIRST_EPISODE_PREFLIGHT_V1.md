# TIVVLEJOY_FIRST_EPISODE_PREFLIGHT_V1

Canonical first episode: **EP012 / The Bakery Map** (11 shots, SH001–SH011).

Every subsystem is one of:

`REAL_READY` · `REAL_PARTIAL` · `SYNTHETIC_ONLY` · `WAITING_EXTERNAL_INPUT` ·
`WAITING_HUMAN_APPROVAL` · `WAITING_PAID_AUTHORIZATION` · `BLOCKED`

## Honesty rule

Synthetic approved-like fixtures cannot satisfy real preflight.

If the real Pip/Goat rigs are absent, the rig column is
`WAITING_EXTERNAL_INPUT`, not ready.

The production lock stays `NOT_LOCKABLE` until real voice, scenery approvals,
rigs, and human shot approvals exist.

Operator UI: `/episode-preflight`
