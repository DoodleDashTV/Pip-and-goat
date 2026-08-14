# Local FINAL_1080P picture-quality evidence

Local CPU render at the delivery resolution, 1080x1920 for 90 frames at 24 samples.
No GPU pod was created and nothing was billed to produce any of this.

Every figure here is measured from the bytes the PNG stores, via
`scripts/assets/png_io.py`. Nothing is read back through Blender's colour
management, and nothing is encoded a second time.

| File | What it holds |
| --- | --- |
| `local_acceptance.json` | The acceptance report for the 1080p run: 16 checks, per-key-frame statistics, and the per-character separation and contact measurements. |
| `full_res_inspection.json` | Independent inspection of all 90 full-resolution frames: exposure band, clipping, tonal range, temporal stability, per-subject separation, screen-space overlap and map readability. |
| `colour_management_measurement.txt` | The same two frames measured honestly and then through the loader defect this change fixes, so the inflation the old QC applied is visible next to the corrected numbers. |
| `new_gates_reject_previous_lighting.json` | The previous lighting re-measured against the new gates. It clears every whole-frame gate and still fails subject separation and ground contact, which is why those two gates exist. |
| `before_after_frame45.png` | Frame 45 as the cloud re-acceptance rendered it, beside frame 45 as this change renders it. |
| `map_readability_crop.png` | One-to-one crop of the staged AdventureMap from the 1080p frame. |

## Regenerating

```bash
pnpm test:color        # colour-management regression tests
pnpm gates:scene       # rig, lighting, hierarchy and prop-clearance gates
pnpm gates:faults      # each gate proven to fail on an injected defect
pnpm gates:local       # 270x480 acceptance render, the fast committed gate

# this evidence: the same acceptance script at delivery resolution
LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender -b -noaudio \
  --python scripts/assets/local_acceptance.py -- \
  --out artifacts/local-acceptance-1080p --resolution 1080x1920 --samples 24
```

The 270x480 evidence in `artifacts/local-acceptance/` is the gate that runs
routinely; it reproduces the figures below to within 0.02 luma. This directory
is the full-resolution confirmation of the same picture.
