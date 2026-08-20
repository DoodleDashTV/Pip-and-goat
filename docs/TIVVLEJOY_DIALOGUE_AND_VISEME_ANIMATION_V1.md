# TIVVLEJOY_DIALOGUE_AND_VISEME_ANIMATION_V1

Voice receipts drive dialogue timing. Approved voice IDs are not changed. Voices are not synthesized here.

## Timing confidence

| Source | Meaning |
|---|---|
| `TIMING_EXACT` | Phoneme timings were supplied |
| `TIMING_WORD_LEVEL` | Word timings were supplied |
| `TIMING_LINE_LEVEL` | Duration + audio receipt only |
| `TIMING_UNAVAILABLE` | No usable timing |

Missing audio does **not** block non-dialogue acting plans. Exact beak/mouth timing stays blocked or low-confidence.

## Visemes

Generic buckets: `REST`, `CLOSED`, `SMALL_OPEN`, `MEDIUM_OPEN`, `WIDE_OPEN`, `ROUND`, `EMPHASIS`.

Pip adapter: beak openness / closure / speech rhythm.  
Goat adapter: jaw / mouth opening.

`pretendsAccurateLipSync` is always `false` unless phonemes exist, and even then the system still reports confidence instead of claiming production lip sync.

## Blink and gaze

Blinks are deterministic from duration, emotion, speaking, attention shifts, and seed. Surprise delays the first blink. Story-critical props hold gaze.
