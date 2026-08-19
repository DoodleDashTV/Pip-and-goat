# TIVVLEJOY_SEASON_SIMULATION_V1

Deterministic synthetic Season 1 used to stress the orchestration layer.

- 60 episodes
- 12 shots per episode (720 shots)
- ~60 second profile intent
- recurring Pip/Goat requirements
- recurring and new locations
- season / weather / time / lighting variation
- voice receipts
- approved-asset IDs
- continuity facts
- shot assembly hashes
- render preflight / QC / delivery planning (no execution)

It does **not** generate 60 copyrighted scripts. Episode/story metadata is
synthetic and labeled `PREVIEW / SYNTHETIC PRODUCTION DATA`.

## Questions the simulation answers

- How many episodes are planning-ready?
- How many items are blocked by unresolved character rigs?
- How many environment bases can be reused?
- Which locations are used most?
- Where is scenery repetition risk rising?
- Which semantic roles are under pressure?
- Which episodes group into batches?
- What invalidates if one approved mountain asset, one voice receipt, one
  bakery location, or a Pip rig version changes?
- Can old completed work be reused safely?
- Does the system avoid duplicate paid-work intent?
- Does delivery stay blocked when QC is incomplete?

Change impact is indexed. One bakery location change does not invalidate
unrelated forest assemblies. Synthetic fixtures never claim
`PRODUCTION_READY`.
