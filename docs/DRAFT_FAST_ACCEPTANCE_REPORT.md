# DRAFT_FAST Acceptance Report

**Status: PASS**

AUDIT_FAST left unchanged (2.65s PASS).

## FIRST RUN
- Runtime: **315.15 s** (~5.3 min)
- Resolution: **540×960**
- FPS: **30**
- Frames: **360** (5 shots)
- Blender startups: **1**
- Daemon reuse: **4** (5 jobs / 1 process)
- Average render/frame: **0.85 s**
- Encode time: **~2.3 s** (shot encodes + assemble)
- Cache hit rate: **0%** (cold)

## IDENTICAL SECOND RUN
- Runtime: **0.07 s**
- Cache hit rate: **100%**
- Shots reused: **5**
- Shots rerendered: **0**
- Speedup: **~4439×**

## ONE-SHOT EDIT TEST
- Changed shot: **3** (description only)
- Shots invalidated: **1**
- Shots reused: **4**
- Shots rerendered: **1**
- Runtime: **70.26 s**

## PIP ANIMATION TEST
- Result: **PASS** (1 render / 4 reuse)

## PIP BASE ASSET INVALIDATION
- Result: **PASS** (5/5 invalidate; checksum restored)

## GOAT DEPENDENCY INVALIDATION
- Result: **PASS** (5/5 invalidate; checksum restored)

## CHARACTER LOCK
- Pip: **PASS** — yellow chick, red crest, orange beak/feet (inspect frames)
- Goat: **PASS** — cream body, horns, pink nose, collar+tag present
- Goat collar text: **PASS** at asset level (`Goat_Tag_Text` stamped `"Goat"`; draft distance/res limits legibility)

## SLOWEST REMAINING OPERATION
EEVEE `frame_render` on CPU (~65s per 75-frame shot @ 540×960 / 8 samples)

## RECOMMENDED OPTIMIZATION
GPU EEVEE worker when available; keep persistent daemon; optional geometry reuse across shots (append-per-shot is already cheap at ~10ms total assets).

## Artifacts
- `artifacts/episodes/extreme-speed-acceptance/draft_fast/ExtremeSpeed_DRAFT_FAST.mp4`
- `artifacts/performance/draft-fast/draft-fast-acceptance.json`
