# Doodle Dash Shorts Pipeline

Production preset code: `DOODLE_DASH_SHORTS`

## Defaults

- 1080 × 1920
- 9:16 vertical
- 30 FPS (unless project config overrides)
- Allowed durations: **15 / 30 / 45 / 60** seconds (not hard-coded to one length)

## Included checks / guides

- Title-safe and caption-safe percentages
- Mobile crop preview flag
- Camera composition guides
- Character framing validation (after models load)
- Opening-hook timing guidance (~2s)
- Scene duration warnings
- Caption placement planning
- Audio peak validation (post)
- Final duration validation against allowed lengths

## BUILD EPISODE stages

Story approval → Continuity → Storyboard → Shot planning → Asset check → Voice → Animation → Preflight → Doodle Guardian → Draft render → QC → Final render → Audio/post → Captions → Publishing package

Every stage is persisted and resumable. Approvals are never bypassed.

## Kids pacing tools

Guidance metrics only (not virality claims): first-frame interest, 1–2s hook, visual change frequency, movement, dialogue density, silence risk, scene duration, emotional beat, conflict, payoff, cliffhanger, continuity.
