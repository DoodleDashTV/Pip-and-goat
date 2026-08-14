# Parent-side verification of the FINAL_1080P visual re-acceptance render

Job `accept1080-2026-08-13T00-00-09-884Z`, pod `8l0zvhp9p44lu0`, rendered 2026-08-13T00:08:22Z.

Everything below was re-measured on the parent VM from the committed `final_1080p.mp4`,
independently of the launching agent's own analysis. Frames were re-extracted with ffmpeg
rather than reusing the committed PNGs.

## Confirmed

| Claim | Independent result |
| --- | --- |
| Container spec | 1080x1920, h264 High, level 4.0, yuv420p, 30/1 fps, 90 frames, 3.000 s, 715,646 bytes |
| Streams | exactly one, video — no audio track |
| Decode integrity | `ffmpeg -f null` exit 0, zero bytes on stderr |
| Frame uniqueness | 90/90 frame hashes distinct, 0 duplicate pairs, 0 black frames |
| R2 artifact integrity | file sha256 `03c45cf2…62145` == `metadata.artifactSha256` |
| Worker provenance | sourceCommit `bb527037…`, imageDigest `sha256:e80cf523…`, buildTime `2026-08-12T22:25:23Z`, renderCodeSha256 `c4afa39c…`, renderCodeMatch true — the pod ran the rebuilt image |
| Temporal stability | 89 pairs, mean abs delta min 0.267 / mean 0.655 / max 1.042, max/mean 1.59, 0 frozen pairs, 0 pairs above 3x mean |
| Cost and safety | 432.7 s at $0.74/hr = $0.0889 of the $0.25 total cap; pod absent from `myself.pods` on first post-terminate poll and again 30 min later |

### Lighting equivalence with the approved local DAY_KEY reference

Measured through `local_acceptance.py::frame_stats` under Blender, the same code path that
produced the approved local evidence. Re-measuring the committed local keyframes reproduced
the recorded values to 0.00, which makes the comparison like-for-like.

| Frame | Cloud mean luma / sat | Local DAY_KEY mean luma / sat |
| --- | --- | --- |
| 1 | 152.73 / 38.22 | 153.53 / 36.97 |
| 45 | 150.31 / 39.91 | 149.42 / 39.65 (f60) |
| 90 | 146.63 / 42.49 | 147.48 / 40.79 |

The paired difference is a near-constant -0.8 mean luma. The rejected stale signature
(mean luma 217-222, saturation ~10) does not appear anywhere in the clip.

### Character animation, measured camera-invariantly

The shot contains a PUSH_IN, so every measure is normalised inside each character's own
bounding box; a dolly leaves such ratios constant.

- Pip (yellow mask, 90/90 frames usable): normalised centroid x spans 0.543-0.759 (21.5% of
  his own width) and silhouette aspect spans 0.326-0.536, with 52-58 direction reversals.
- Goat (white mask, 90/90 frames usable): normalised centroid y spans 0.033, aspect spans
  0.059, fill spans 0.065, with 49-67 direction reversals — a smaller, oscillating signal
  consistent with a nod.
- Neither mask ever empties, and bounding-box height grows 69->107 px (Pip) and 75->114 px
  (Goat), confirming the push-in.

## Finding: the QC brightness metric is inflated ~1.77x

`local_acceptance.py::load_srgb` loads an already-sRGB PNG through Blender and then applies
the sRGB encode a second time, so every luma figure in the local acceptance evidence — and
therefore the tuned 147-154 DAY_KEY band — is roughly 1.77x the value actually stored in the
image.

Same file, `artifacts/local-acceptance/keyframes/production_0001.png`:

- values as stored in the PNG: mean luma 86.65, min 0.93, max 122.08, mean saturation 63.65
- via `load_srgb`: mean luma 153.53, min 11.79, max 183.89, saturation 36.97
- re-encoding the stored mean (0.340) as if it were linear yields 157.6, which reproduces the
  inflated figure

This does not affect any cloud-vs-local comparison, because both sides pass through the same
transform, and it does not affect the stale-image detection, whose bands are far apart. It does
mean the gates never measured absolute exposure: a frame whose true mean luma is 34% of range
and whose brightest pixel reaches only 48% was scored as a mid-grey, well-exposed 150/255.

Left unchanged here deliberately — this run was authorised to change nothing, and correcting
the transform requires re-tuning every band that was fitted against it.

## Visual acceptance

The regression this render was authorised to test is fixed: the render carries the repaired
three-light DAY_KEY assembly with real soft cast shadows, saturated foliage and a sky brighter
than the ground, and it is pixel-comparable to the approved local reference. Both characters
demonstrably animate.

Judged against a finished-production bar, the picture is not yet acceptable, for reasons that
are present identically in the approved local reference and are therefore pre-existing rather
than cloud-path regressions:

- `AdventureMap` reads as an untextured tan slab wedged behind the centre bush and clipping its
  foliage, rather than a map the characters are examining. The shot does not depict its premise.
- Exposure is genuinely dark once the metric inflation is removed: true mean luma ~34% of range,
  brightest pixel ~48%. It reads overcast rather than sunny.
- Materials are flat matte with no rim separation between characters and background.

Two complaints raised by an independent visual reviewer were checked at full resolution and are
NOT supported: edge aliasing (edges are smooth in a 2x nearest-neighbour crop) and razor-sharp
pitch-black shadows (the ground shadow has a soft penumbra and sits at dark green, not black).

Verdict recorded by the parent: pipeline, technical, motion, cost and safety PASS; absolute
visual production acceptance FAIL on staging, exposure and shading, which is asset and
lighting-design work, not a cloud-render defect.
