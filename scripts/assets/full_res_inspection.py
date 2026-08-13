"""Inspect every frame of a full-resolution local render, independently of the gate.

`local_acceptance.py` decides PASS or FAIL from four key frames and a handful of
thresholds. This walks all 90 frames of the same output and reports what they
actually measure, so the verdict can be checked rather than taken:

  * the exposure, clipping, tonal-range and saturation figures over the whole shot,
    and whether every frame clears the acceptance thresholds, not just the keys
  * temporal stability: how far mean luma travels across the shot, how big each
    frame-to-frame step is, how many times the drift changes direction, and how
    much the average and the noisiest tenth of a percent of pixels move per frame
  * each subject against the ground it stands in, from the coverage masks the
    acceptance run rendered one subject at a time
  * whether the subjects overlap on screen, and whether the map still reads as ink
    on paper

Reads the bytes the PNGs store, via `png_io`. Needs no Blender and no GPU.

  python3 scripts/assets/full_res_inspection.py \
    --dir artifacts/local-acceptance-1080p \
    --out artifacts/local-acceptance-1080p/full_res_inspection.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np  # noqa: E402
from png_io import read_stored_alpha, read_stored_srgb  # noqa: E402

#: Acceptance thresholds, imported rather than restated so this cannot drift from
#: the gate it is checking.
from local_acceptance import (  # noqa: E402
    EXPOSURE_MAX_PCT,
    EXPOSURE_MIN_PCT,
    HIGHLIGHT_CLIP_MAX,
    HIGHLIGHT_P99_MIN,
    MASK_SOLID_ALPHA,
    SATURATION_MIN,
    SHADOW_CLIP_MAX,
    SHADOW_DEPTH_MAX_RATIO,
    SHADOW_P01_MIN,
    TONAL_RANGE_MIN,
)

#: The noisiest 0.1% of pixels. A shadow that flickers moves a small number of
#: pixels a long way, which an average over two million pixels hides.
NOISY_PERCENTILE = 99.9


def luma(rgb) -> np.ndarray:
    return 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]


def saturation(rgb) -> np.ndarray:
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    return np.where(high > 0, (high - low) / np.maximum(high, 1e-6) * 128.0, 0.0)


def frame_figures(path: Path) -> dict:
    rgb = read_stored_srgb(path).astype(np.float64)
    lum = luma(rgb)
    high = rgb.max(axis=2)
    p01, p05, p95, p99 = (float(v) for v in np.percentile(lum, [1, 5, 95, 99]))
    return {
        "meanLuma": float(lum.mean()),
        "meanLumaPct": float(lum.mean()) / 255.0,
        "p01": p01,
        "p05": p05,
        "p95": p95,
        "p99": p99,
        "tonalRange": p99 - p01,
        "clippedHighlightFraction": float((high >= 254.0).mean()),
        "clippedShadowFraction": float((high <= 1.0).mean()),
        "saturation": float(saturation(rgb).mean()),
        "shape": rgb.shape,
    }


def band(values: list[float], digits: int = 4) -> dict:
    return {"min": round(min(values), digits), "max": round(max(values), digits)}


def clears_every_frame(figures: list[dict]) -> dict:
    """The acceptance thresholds, applied to all 90 frames rather than four."""
    return {
        "exposureInBand": all(
            EXPOSURE_MIN_PCT <= f["meanLumaPct"] <= EXPOSURE_MAX_PCT for f in figures
        ),
        "highlightsPresent": all(f["p99"] >= HIGHLIGHT_P99_MIN for f in figures),
        "noHighlightClipping": all(
            f["clippedHighlightFraction"] <= HIGHLIGHT_CLIP_MAX for f in figures
        ),
        "shadowsLifted": all(
            f["p01"] >= SHADOW_P01_MIN and f["clippedShadowFraction"] <= SHADOW_CLIP_MAX
            for f in figures
        ),
        "shadowDepthRetained": all(
            f["p01"] <= SHADOW_DEPTH_MAX_RATIO * f["meanLuma"] for f in figures
        ),
        "saturationHealthy": all(f["saturation"] >= SATURATION_MIN for f in figures),
        "tonalRangeHealthy": all(f["tonalRange"] >= TONAL_RANGE_MIN for f in figures),
    }


def temporal(frames: list[Path], figures: list[dict]) -> dict:
    means = [f["meanLuma"] for f in figures]
    steps = [abs(means[i] - means[i - 1]) for i in range(1, len(means))]
    directions = [1 if means[i] > means[i - 1] else -1 for i in range(1, len(means))]
    sign_changes = sum(1 for i in range(1, len(directions)) if directions[i] != directions[i - 1])

    average_delta, noisy_delta = [], []
    previous = read_stored_srgb(frames[0]).astype(np.float64)
    for path in frames[1:]:
        current = read_stored_srgb(path).astype(np.float64)
        delta = np.abs(current - previous).max(axis=2)
        average_delta.append(float(delta.mean()))
        noisy_delta.append(float(np.percentile(delta, NOISY_PERCENTILE)))
        previous = current

    # A frame whose mean luma sits more than three step-sizes off the local trend
    # is worth naming; a shot lit by one arbitrated key should have none.
    outliers = []
    for i in range(1, len(means) - 1):
        trend = (means[i - 1] + means[i + 1]) / 2.0
        if abs(means[i] - trend) > 3.0 * (sum(steps) / len(steps)):
            outliers.append(frames[i].name)

    return {
        "meanLumaRangeAcrossShot": round(max(means) - min(means), 3),
        "frameToFrameMeanLumaStep": {
            "mean": round(sum(steps) / len(steps), 4),
            "max": round(max(steps), 4),
            "signChanges": sign_changes,
        },
        "perPixelAbsDelta": {
            "avg": round(sum(average_delta) / len(average_delta), 3),
            "max": round(max(average_delta), 3),
        },
        f"perPixelP{str(NOISY_PERCENTILE).replace('.', '')}Delta": {
            "avg": round(sum(noisy_delta) / len(noisy_delta), 1),
            "max": round(max(noisy_delta), 1),
        },
        "outlierFrames": outliers,
    }


def dilate(mask, radius: int):
    out = mask.copy()
    for _ in range(max(0, radius)):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def separation(frame: Path, masks: dict[str, Path]) -> dict:
    """Each subject against the background immediately around it.

    Weber contrast rather than a bare difference, because what reads as "standing
    out" scales with how bright the background already is.
    """
    rgb = read_stored_srgb(frame).astype(np.float64)
    lum = luma(rgb)
    sat = saturation(rgb)
    height = rgb.shape[0]

    solid = {role: read_stored_alpha(path) > MASK_SOLID_ALPHA for role, path in masks.items()}
    everyone = np.zeros(lum.shape, dtype=bool)
    for mask in solid.values():
        everyone |= mask

    out = {}
    for role, mask in solid.items():
        if not mask.any():
            continue
        radius = max(1, int(round(height * 0.031)))
        near = dilate(mask, radius) & ~dilate(mask, 2) & ~everyone
        subject = lum[mask]
        background = lum[near] if near.any() else np.array([0.0])
        out[role] = {
            "screenCoveragePct": round(float(mask.mean()) * 100.0, 2),
            "subjectMeanLuma": round(float(subject.mean()), 2),
            "localBackgroundMeanLuma": round(float(background.mean()), 2),
            "lumaSeparation": round(float(subject.mean() - background.mean()), 2),
            "weberContrast": round(float((subject.mean() - background.mean()) / max(background.mean(), 1e-6)), 3),
            "subjectMeanSaturation": round(float(sat[mask].mean()), 2),
            "localBackgroundMeanSaturation": round(float(sat[near].mean()), 2) if near.any() else None,
            "subjectMaxLuma": round(float(subject.max()), 2),
            "specularFractionOfSubject": round(float((subject >= np.percentile(subject, 75)).mean()), 5),
            "subjectClippedFraction": round(float((rgb.max(axis=2)[mask] >= 254.0).mean()), 6),
            "subjectLumaSpread": round(float(subject.max() - subject.min()), 2),
        }
    return out


def overlap(masks: dict[str, Path]) -> dict:
    solid = {role: read_stored_alpha(path) > MASK_SOLID_ALPHA for role, path in masks.items()}
    roles = sorted(solid)
    out = {}
    for i, a in enumerate(roles):
        for b in roles[i + 1 :]:
            out[f"{a}_{b}"] = int((solid[a] & solid[b]).sum())
    return out


def map_readability(frame: Path, mask: Path) -> dict:
    """Does the staged map still read as ink on paper, not one flat tone?"""
    rgb = read_stored_srgb(frame).astype(np.float64)
    lum = luma(rgb)
    solid = read_stored_alpha(mask) > MASK_SOLID_ALPHA
    if not solid.any():
        return {}
    paper = lum[solid]
    p05, p95 = (float(v) for v in np.percentile(paper, [5, 95]))
    buckets = np.unique((paper // 8).astype(int))
    return {
        "screenCoveragePct": round(float(solid.mean()) * 100.0, 2),
        "meanLuma": round(float(paper.mean()), 2),
        "lumaStdDev": round(float(paper.std()), 2),
        "p05": round(p05, 2),
        "p95": round(p95, 2),
        "inkToPaperRange": round(p95 - p05, 2),
        "populatedToneBucketsOf32": int(len(buckets)),
        "darkInkFraction": round(float((paper <= p05 + (p95 - p05) * 0.2).mean()), 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", required=True, help="output directory of local_acceptance.py")
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--mask-frames",
        default="1,90",
        help="frames whose coverage masks to measure against; the acceptance run renders 1 and 90",
    )
    args = parser.parse_args()
    mask_frames = [int(f) for f in args.mask_frames.split(",") if f.strip()]

    root = Path(args.dir)
    frames = sorted((root / "production").glob("frame_*.png"))
    if not frames:
        print(f"FULLRES: no frames in {root / 'production'}")
        return 1

    figures = [frame_figures(path) for path in frames]
    shapes = {f["shape"] for f in figures}
    if len(shapes) != 1:
        print(f"FULLRES: frames disagree on resolution: {shapes}")
        return 1
    shape = shapes.pop()

    per_mask_frame = {}
    for number in mask_frames:
        masks = {}
        for role in ("pip", "goat", "map"):
            path = root / "masks" / f"mask_{role}_{number:04d}.png"
            if path.exists():
                masks[role] = path
        frame = root / "production" / f"frame_{number:04d}.png"
        if not masks or not frame.exists():
            continue
        per_mask_frame[f"frame_{number:04d}"] = {
            "separation": separation(frame, masks),
            "screenSpaceOverlapPx": overlap(masks),
            "mapReadability": map_readability(frame, masks["map"]) if "map" in masks else {},
        }

    report = {
        "frames": len(frames),
        "resolution": f"{shape[1]}x{shape[0]}",
        "allFrames": {
            key: band([f[key] for f in figures])
            for key in (
                "meanLumaPct",
                "p01",
                "p99",
                "tonalRange",
                "clippedHighlightFraction",
                "clippedShadowFraction",
                "saturation",
            )
        },
        "allFramesPassAcceptanceThresholds": clears_every_frame(figures),
        "temporalStability": temporal(frames, figures),
        "maskSolidAlpha": MASK_SOLID_ALPHA,
        "perMaskFrame": per_mask_frame,
    }
    Path(args.out).write_text(json.dumps(report, indent=1) + "\n")

    every = report["allFramesPassAcceptanceThresholds"]
    print(f"FULLRES frames={report['frames']} resolution={report['resolution']}")
    print("FULLRES_ALL_FRAMES:" + json.dumps(every))
    print("FULLRES_TEMPORAL:" + json.dumps(report["temporalStability"]))
    return 0 if all(every.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
