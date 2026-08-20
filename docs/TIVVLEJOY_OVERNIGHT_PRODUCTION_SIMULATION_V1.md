# TIVVLEJOY_OVERNIGHT_PRODUCTION_SIMULATION_V1

Zero-cost software simulation of directing, editorial, sound, captions,
review, and packages across a synthetic 60-episode season (default 12 shots
= 720 shots).

For every episode the compiler:

1. builds creative intent and story beats
2. builds camera, staging, performance, lighting, and VFX plans
3. builds editorial timeline, dialogue, SFX, ambience, music, captions
4. compiles Final Shot Specs and a Director Package
5. binds the existing Episode Production Packet
6. evaluates master readiness
7. can persist and cold-reload hashes

No real render. No real asset approval. No fake Production Ready.

A 100-episode / 1200-shot run is a software stress test only. It is not a
claim that scenery or production is ready for 100 episodes.

If FFmpeg is installed, a synthetic proxy harness may write colored cards
and sine tones. Status is `PROXY_WRITTEN` or `PROXY_MEDIA_TOOL_UNAVAILABLE`.
`FINAL_RENDER` is never produced.

Cost forecasts use caller-supplied rates. `authorizationIssued=false`.
`paidComputeUsd=0`.
