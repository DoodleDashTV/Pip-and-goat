# TIVVLEJOY_EDITORIAL_SYSTEM_V1

Deterministic episode timelines. No final render is required.

## Concepts

`EditorialTimeline`, `EditorialTrack`, `EditorialClip`,
`EditorialTransition`, `EditorialMarker`.

Tracks: `VIDEO`, `DIALOGUE`, `SFX`, `MUSIC`, `AMBIENCE`, `CAPTIONS`,
`MARKERS`.

Primary profile is 30 fps and remains configurable.

## Shot timing

Each shot records `inFrame`, `outFrame`, `durationFrames`, handles,
minimum readable duration, maximum hold, and dialogue/action/reaction/
transition constraints.

Pace profiles: `CALM_DISCOVERY`, `NORMAL_ADVENTURE`, `FAST_COMEDY`,
`TENSION_BUILD`, `MAGICAL_WONDER`, `ACTION_BURST`, `EMOTIONAL_HOLD`.

## Rhythm QC

`TIVVLEJOY_EDIT_RHYTHM_QC_V1` uses profile thresholds, not one global cut
rate. Findings include too many rapid cuts or long holds, short reaction /
prop insert / establishing / ending button, clipped dialogue, and action
cut mid-contact.

## Transitions

`HARD_CUT`, `MATCH_CUT`, `REACTION_CUT`, `ACTION_CUT`, `LOCATION_CUT`,
`DISSOLVE`, `FADE_IN`, `FADE_OUT`. Transitions need a reason. Dissolves are
budgeted, not default.

## J-cut / L-cut

Picture and audio may overlap conceptually. Overlaps must not duplicate
dialogue. No real audio is mixed.

## Master timeline

`TIVVLEJOY_EPISODE_MASTER_TIMELINE_V1` combines shots, dialogue, SFX,
ambience, music, captions, and markers. Hash: `masterTimelineSha256` /
`timelineSha256`. Changing one caption must not invalidate unrelated
animation. Changing shot duration updates downstream edit/audio timing.
