# TIVVLEJOY_PRODUCTION_STATE_GRAPH_V1

Deterministic adapter graph over existing TivvleJoy subsystems.

It does not duplicate World Builder, Shot Assembly, voice, or render-admission
logic. It reads their hashes and receipts and answers:

- What is this episode waiting on?
- Which exact dependency is blocking it?
- Is the blocker technical, creative, approval, asset, rig, voice, render, or delivery?
- Which downstream outputs become invalid if this item changes?
- Which items can proceed now?
- Which require explicit human authorization?

## Node kinds

EPISODE, SCRIPT, VOICE, LOCATION, ASSET, SHOT, CHARACTER_RIG, CAMERA,
LIGHTING, ANIMATION, SHOT_ASSEMBLY, VISUAL_APPROVAL, RENDER_PREFLIGHT,
RENDER, AUDIO, QC, DELIVERY.

## States

NOT_STARTED, PLANNED, WAITING_FOR_DEPENDENCY, WAITING_FOR_ASSET,
WAITING_FOR_RIG, WAITING_FOR_VOICE, WAITING_FOR_APPROVAL,
READY_FOR_SAFE_PLANNING, READY_FOR_ASSEMBLY, READY_FOR_RENDER_PREFLIGHT,
BLOCKED, COMPLETE.

There are no RUNNING states. This pass does not execute processes.

## Hashes

Every bindable node stores the exact dependency SHA-256 from the source
module when one exists. There is no mutable `latest`.

## Indexes

The graph precomputes `byEpisode`, `byKind`, `byState`, `byShot`, and a
reverse-dependency map. `changeImpact(graph, nodeIds)` walks dependents
only.

Paid render nodes stay `NOT_STARTED` with the human label
"Paid render authorization required".
