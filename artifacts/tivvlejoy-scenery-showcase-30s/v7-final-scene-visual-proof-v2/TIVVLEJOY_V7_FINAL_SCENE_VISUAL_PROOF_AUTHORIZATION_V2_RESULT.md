# TIVVLEJOY_V7_FINAL_SCENE_VISUAL_PROOF_AUTHORIZATION_V2_RESULT

Exactly one CREATE. Worker failed before any still. Pod deleted. No retry.

## Launch

- digest: `sha256:1807fac1b13db900251c57ad4d5de7b0dab24cee660b31aa94cd9d0c0183498b`
- ineligible digest not launched: `sha256:b176ca65…`
- pod: `zq4lfe0xyknzc7` / `tj-v7-fsvp-2`
- GPU: Secure RTX 4090 @ $0.74/hr
- runtime: 140.3 s
- spend: $0.0288
- paid CREATE: 1

## Worker failure

HOST_AND_LAUNCH_CONTRACT / FINAL_HOST_CONTRACT_FAILED / VRAM_BELOW_24GIB

Locked image requires `vramMiB >= 24576`. A Secure 4090 typically reports ~24564 MiB, so the host contract can fail on a valid 4090. No Blender stills ran.

## Proof

- cameras rendered: none
- Camera C / frame 210: not rendered
- v3CompAUsed: false (no stills; V3 Comp A was not selected)
- proof images: none
- pixel suite: NOT_RUN
- E/F/J: NOT_RUN

## Cleanup / PR

- cleanup confirmed
- livePods: []
- PR #169: OPEN / DRAFT / UNMERGED / NOT READY
- no 900-frame encode
- no second CREATE

V7_FINAL_VIDEO_RENDER_READY_AWAITING_AUTHORIZATION: NO
FINAL_VIDEO_RENDER_NOT_AUTHORIZED
