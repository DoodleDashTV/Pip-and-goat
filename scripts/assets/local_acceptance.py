"""Local CPU acceptance render for the DDP acceptance scene. No GPU, no Runpod.

Renders the real production shot (same ``assemble_scene.build_scene`` path the
cloud worker uses) at reduced resolution but production 9:16 aspect and shot
logic, then proves from the pixels that:

  * Pip and Goat visibly move (measured on a SECOND render with a locked-off
    camera, so camera movement cannot account for any pixel change);
  * exposure is controlled rather than washed out;
  * both characters read against the green field and cast a shadow onto it
    (measured against coverage masks from a THIRD render, one subject at a time);
  * the map hierarchy survives assembly and only the authoritative lights exist.

Run:
  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender -b -noaudio \
      --python scripts/assets/local_acceptance.py -- \
      --out artifacts/local-acceptance
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "blender"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import assemble_scene as A  # noqa: E402
from png_io import describe_png, read_stored_alpha, read_stored_srgb  # noqa: E402
from scene_gates import ASSETS, SHOT_META  # noqa: E402

# Reduced resolution for CPU speed; identical 9:16 aspect to FINAL_1080P.
LOCAL_RESOLUTION = "270x480"
FRAMES = 90
FPS = 30
SAMPLES = 16
KEY_FRAMES = [1, 30, 60, 90]
# A pixel must change by more than this (0-255 sRGB) to count as moved.
PIXEL_DELTA_THRESHOLD = 8.0
# Fraction of the frame that must change between locked-off camera frames.
# Measured on honest stored pixels: the repaired shot moves 1.9-3.5% of the
# frame between sampled locked-off frames, so this floor is roughly 4x below
# what real character animation produces and well above encoder noise.
MIN_MOVING_PIXEL_FRACTION = 0.005

# ---------------------------------------------------------------------------
# Picture-quality thresholds.
#
# Every figure below is a fraction or a 0-255 value measured on the pixels as
# stored in the PNG. They are deliberately NOT the numbers the previous build
# produced: the earlier loader encoded already-encoded sRGB a second time, which
# inflated brightness by ~1.77x, so the old "147-154 mean luma, well exposed"
# band described a frame whose real mean luma was 83-87/255 — a third of range,
# which reads as overcast. These thresholds describe what a lit children's
# adventure short should measure, and the picture has to earn them.
#
# Every threshold below is chosen so that at least one render this project has
# already rejected fails it, and so the accepted picture clears it with margin.
# Measured on stored pixels, the two rejected looks are:
#
#   8-light "milky" 1080p : mean 33.2%, p01 0.0,  p99 ~180, sat 18.3, p99-p01 ~180
#   pre-remediation DAY_KEY (local 270x480, and the matching cloud 1080p):
#                           mean 31.9-34.0%, p01 9.8-14.5, p95 = p99 = 118.5,
#                           sat 63.6-66.7, p99-p01 104-109, shadow clip 0.0007
#
# The second one is instructive: the top of its range is pinned at 118/255 (the
# brightest thing in frame is a flat sky), so it has NO highlights at all, yet
# its p95-p05 spread measures 88-101 — higher than a properly exposed frame with
# a large evenly lit sky. A p95-p05 floor would therefore have passed the render
# this remediation exists to replace, which is why the tonal-spread gate below is
# p99-p01 instead.
# ---------------------------------------------------------------------------
#: Mean luma as a fraction of full range. Target is 45-50%; the gate allows a
#: little either side so an ordinary re-render cannot fail on rounding.
#: Rejects both baselines (32-34%).
EXPOSURE_MIN_PCT = 0.43
EXPOSURE_MAX_PCT = 0.53
#: Highlights must actually reach the top of the range. Rejects the
#: pre-remediation look, whose 99th percentile is 118.
HIGHLIGHT_P99_MIN = 200.0
#: ...without burning out: fraction of pixels with a channel at 254+.
HIGHLIGHT_CLIP_MAX = 0.002
#: Shadows lifted off the floor, so detail survives where the sun does not reach.
#: Rejects the 8-light render (p01 0.0) on the percentile and the pre-remediation
#: cloud frames (0.0015 of the frame at black) on the clip fraction.
SHADOW_P01_MIN = 6.0
SHADOW_CLIP_MAX = 0.0005
#: ...but still deep enough to model form: the darkest 1% must sit well under the
#: frame mean, otherwise the picture is flat and the characters have no contact.
SHADOW_DEPTH_MAX_RATIO = 0.55
#: Colour must survive the grade. The rejected milky render measured 18/128.
SATURATION_MIN = 45.0
#: Tonal spread from real shadow to real highlight. Rejects the pre-remediation
#: look (104-109) and is the honest version of "not milky".
TONAL_RANGE_MIN = 140.0

# ---------------------------------------------------------------------------
# Subject separation and ground contact.
#
# A frame can hit every figure above and still look wrong, because those are all
# whole-frame statistics: they cannot tell whether the characters stand out from
# the field or sit on the ground. Both were measured by eye until the eye was
# checked, and both were wrong.
#
# The measurement compares each character with the grass it is actually touching,
# using the pixels that character covers. Coverage comes from a pass rendered with
# a transparent film and only that character visible, so it is the render's own
# answer rather than a colour guess.
#
# Measured on the render this remediation replaces, whose rim was a close area
# light pouring onto the grass the characters stand on:
#   * lit side vs adjacent grass: Pip +26.3, goat +2.2 (the goat's whole body
#     measured 31 luma BELOW the grass around it);
#   * ground contact: Pip -0.9, goat -15.4 — the ground under them was BRIGHTER
#     than open grass, which is the opposite of a shadow.
# ---------------------------------------------------------------------------
#: The subjects whose separation is measured, and which of them are characters.
MASK_ROLES = ("pip", "goat", "map")
SEPARATION_ROLES = ("pip", "goat")
#: The lit half of a character must clear the grass touching its silhouette by
#: this much. Rejects the pre-remediation goat at +2.2.
SEPARATION_MIN = 20.0
#: The ground under a character must be darker than open grass at the same depth.
#: Rejects both pre-remediation characters, which sat in a pool of rim light.
CONTACT_MIN = 2.0
#: Ring and band radii as a fraction of frame height, so the same measurement
#: means the same thing at 270x480 and at 1080x1920.
RING_OUTER = 0.031
RING_INNER = 0.004
CONTACT_OUTER = 0.036
OPEN_GRASS_OUTER = 0.050
OPEN_GRASS_INNER = 0.024
#: Alpha above which a pixel counts as the subject's body rather than its
#: antialiased edge, where the background is mixed in.
MASK_SOLID_ALPHA = 229.0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local CPU acceptance render.")
    parser.add_argument("--out", required=True)
    parser.add_argument("--resolution", default=LOCAL_RESOLUTION)
    parser.add_argument("--frames", type=int, default=FRAMES)
    parser.add_argument("--samples", type=int, default=SAMPLES)
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    return parser.parse_args(argv)


def load_srgb(path: Path):
    """Load a rendered PNG as an HxWx3 array of the 0-255 sRGB values it stores.

    Blender writes 8-bit sRGB PNGs, so the honest measurement is the bytes in the
    file. This used to read the frame back through Blender and then apply an sRGB
    encode to the result — encoding already-encoded data a second time, which
    reported a stored mean luma of 86.65 as 153.53. Every exposure, shadow and
    saturation figure downstream inherited that 1.77x inflation.

    ``read_stored_srgb`` refuses any file whose colour space or transfer function
    it cannot establish, so an unexpected input fails the run instead of being
    silently measured under the wrong assumption.
    """
    return read_stored_srgb(path)


def frame_stats(path: Path) -> dict:
    import numpy as np

    rgb = load_srgb(path)
    info = describe_png(path)
    luma = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    saturation = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6) * 128.0, 0.0)
    p01, p05, p50, p95, p99, p999 = (float(v) for v in np.percentile(luma, [1, 5, 50, 95, 99, 99.9]))
    return {
        "frame": path.name,
        "height": int(rgb.shape[0]),
        "width": int(rgb.shape[1]),
        "colorspace": info["colorspace"],
        "meanLuma": round(float(luma.mean()), 2),
        "meanLumaPct": round(float(luma.mean()) / 255.0, 4),
        "minLuma": round(float(luma.min()), 2),
        "maxLuma": round(float(luma.max()), 2),
        "p01Luma": round(p01, 2),
        "p05Luma": round(p05, 2),
        "p50Luma": round(p50, 2),
        "p95Luma": round(p95, 2),
        "p99Luma": round(p99, 2),
        "p999Luma": round(p999, 2),
        # Reported, not gated: see the threshold block for why p95-p05 rewarded
        # the render this remediation replaces.
        "contrast": round(p95 - p05, 2),
        "tonalRange": round(p99 - p01, 2),
        "clippedHighlightFraction": round(float((mx >= 254.0).mean()), 6),
        "clippedShadowFraction": round(float((mx <= 1.0).mean()), 6),
        "meanSaturation": round(float(saturation.mean()), 2),
    }


def _dilate(mask, radius: int):
    """Grow a boolean mask by ``radius`` pixels, four-connected."""
    out = mask.copy()
    for _ in range(max(0, radius)):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def separation_stats(frame: Path, masks: dict[str, Path]) -> dict:
    """Measure each character against the grass it stands in.

    Returns, per character, how far its lit half sits above the grass touching
    its silhouette, and how much darker the ground directly under it is than open
    grass at a comparable depth.
    """
    import numpy as np

    rgb = read_stored_srgb(frame)
    height = rgb.shape[0]
    luma = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    red, green, blue = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    # Green-dominant pixels: the field, and nothing tan, blue or white.
    grass = (green > red + 12) & (green > blue + 12)

    solid = {}
    for role, path in masks.items():
        solid[role] = read_stored_alpha(path) > MASK_SOLID_ALPHA
    subjects = np.zeros_like(grass)
    for mask in solid.values():
        subjects |= mask

    def px(fraction: float) -> int:
        return max(1, int(round(height * fraction)))

    out = {}
    for role in SEPARATION_ROLES:
        body_mask = solid.get(role)
        if body_mask is None or not body_mask.any():
            continue
        rows = np.nonzero(body_mask.any(axis=1))[0]
        below_centre = np.zeros_like(body_mask)
        below_centre[(rows.min() + rows.max()) // 2 :, :] = True
        ring = _dilate(body_mask, px(RING_OUTER)) & ~_dilate(body_mask, px(RING_INNER)) & grass & ~subjects
        contact = _dilate(body_mask, px(CONTACT_OUTER)) & ~body_mask & grass & ~subjects & below_centre
        open_grass = (
            _dilate(body_mask, px(OPEN_GRASS_OUTER))
            & ~_dilate(body_mask, px(OPEN_GRASS_INNER))
            & grass
            & ~subjects
            & below_centre
        )
        body = luma[body_mask]
        lit = body[body >= np.percentile(body, 50)]
        entry = {
            "coveragePct": round(float(body_mask.mean()) * 100.0, 3),
            "bodyMeanLuma": round(float(body.mean()), 2),
            "litSideMeanLuma": round(float(lit.mean()), 2),
            "adjacentGrassLuma": round(float(luma[ring].mean()), 2) if ring.any() else None,
            "groundUnderSubjectLuma": round(float(luma[contact].mean()), 2) if contact.any() else None,
            "openGrassLuma": round(float(luma[open_grass].mean()), 2) if open_grass.any() else None,
        }
        entry["litSideVsAdjacentGrass"] = (
            round(entry["litSideMeanLuma"] - entry["adjacentGrassLuma"], 2)
            if entry["adjacentGrassLuma"] is not None
            else None
        )
        entry["contactDarkening"] = (
            round(entry["openGrassLuma"] - entry["groundUnderSubjectLuma"], 2)
            if None not in (entry["openGrassLuma"], entry["groundUnderSubjectLuma"])
            else None
        )
        out[role] = entry
    return out


def moving_pixel_fraction(path_a: Path, path_b: Path) -> float:
    import numpy as np

    a = load_srgb(path_a)
    b = load_srgb(path_b)
    if a.shape != b.shape:
        return 0.0
    delta = np.abs(a - b).max(axis=2)
    return round(float((delta > PIXEL_DELTA_THRESHOLD).mean()), 6)


def render_animation(out_dir: Path, shot_meta: dict, args, camera_preset: str) -> dict:
    import bpy

    width, height = A.parse_resolution(args.resolution)
    built = A.build_scene(
        assets=ASSETS,
        shot_meta=shot_meta,
        width=width,
        height=height,
        fps=FPS,
        start_frame=1,
        end_frame=args.frames,
        camera_preset=camera_preset,
        engine="EEVEE",
        samples=args.samples,
    )
    scene = bpy.context.scene
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(out_dir / "frame_")
    bpy.ops.render.render(animation=True)
    return built


def render_key_frames(out_dir: Path, shot_meta: dict, args, camera_preset: str) -> dict:
    """Render only the gate frames, with whichever camera preset is requested."""
    import bpy

    width, height = A.parse_resolution(args.resolution)
    built = A.build_scene(
        assets=ASSETS,
        shot_meta=shot_meta,
        width=width,
        height=height,
        fps=FPS,
        start_frame=1,
        end_frame=args.frames,
        camera_preset=camera_preset,
        engine="EEVEE",
        samples=args.samples,
    )
    scene = bpy.context.scene
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    for frame in KEY_FRAMES:
        scene.frame_set(frame)
        scene.render.filepath = str(out_dir / f"static_{frame:04d}")
        bpy.ops.render.render(write_still=True)
    return built


def render_subject_masks(out_dir: Path, shot_meta: dict, args, camera_preset: str, frames: list[int]) -> dict:
    """Render each subject's exact screen coverage, one role at a time.

    Same scene, same camera, same frames as the shot; everything but one role is
    hidden and the film is transparent, so the alpha channel is that role's
    coverage. Sample count is irrelevant to coverage, so it stays low.
    """
    import bpy

    width, height = A.parse_resolution(args.resolution)
    built = A.build_scene(
        assets=ASSETS,
        shot_meta=shot_meta,
        width=width,
        height=height,
        fps=FPS,
        start_frame=1,
        end_frame=args.frames,
        camera_preset=camera_preset,
        engine="EEVEE",
        samples=4,
    )
    by_role = built["importedByRole"]

    def family(objects) -> set[str]:
        names: set[str] = set()
        stack = list(objects)
        while stack:
            obj = stack.pop()
            if obj.name in names:
                continue
            names.add(obj.name)
            stack.extend(obj.children)
        return names

    scene = bpy.context.scene
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    renderable = {"MESH", "CURVE", "SURFACE", "FONT"}
    written: dict[str, dict[int, Path]] = {}
    for role in MASK_ROLES:
        keep = family(by_role.get(role, []))
        if not keep:
            continue
        for obj in bpy.data.objects:
            if obj.type in renderable:
                obj.hide_render = obj.name not in keep
        for frame in frames:
            scene.frame_set(frame)
            path = out_dir / f"mask_{role}_{frame:04d}.png"
            scene.render.filepath = str(path.with_suffix(""))
            bpy.ops.render.render(write_still=True)
            written.setdefault(role, {})[frame] = path
    return written


def main() -> int:
    import bpy

    args = parse_args(sys.argv)
    out_root = Path(args.out)
    prod_dir = out_root / "production"
    static_dir = out_root / "static-camera"

    shot_meta = dict(SHOT_META)

    # Pass 1 — the real shot, production camera move.
    built = render_animation(prod_dir, shot_meta, args, shot_meta["cameraPreset"])
    frames = sorted(prod_dir.glob("frame_*.png"))

    # Pass 2 — identical scene, locked-off camera. Any pixel change here is
    # character motion, because the camera does not move at all.
    render_key_frames(static_dir, shot_meta, args, "TWO_SHOT")
    static_frames = sorted(static_dir.glob("static_*.png"))

    # Pass 3 — coverage masks for the widest and closest framing, so separation
    # and ground contact are measured on the subjects themselves.
    separation_frames = [KEY_FRAMES[0], KEY_FRAMES[-1]]
    masks = render_subject_masks(out_root / "masks", shot_meta, args, shot_meta["cameraPreset"], separation_frames)
    separation = {}
    for frame in separation_frames:
        frame_path = prod_dir / f"frame_{frame:04d}.png"
        available = {role: paths[frame] for role, paths in masks.items() if frame in paths}
        if frame_path.exists() and available:
            separation[f"frame_{frame:04d}"] = separation_stats(frame_path, available)

    stats = [frame_stats(f) for f in frames if f.name in {f"frame_{n:04d}.png" for n in KEY_FRAMES}]
    static_motion = {}
    for earlier, later in zip(KEY_FRAMES, KEY_FRAMES[1:]):
        a = static_dir / f"static_{earlier:04d}.png"
        b = static_dir / f"static_{later:04d}.png"
        if a.exists() and b.exists():
            static_motion[f"{earlier}->{later}"] = moving_pixel_fraction(a, b)

    # Keep the beginning/middle/end frames out of the gitignored sequence dirs so
    # the representative frames survive as reviewable evidence.
    keyframe_dir = out_root / "keyframes"
    keyframe_dir.mkdir(parents=True, exist_ok=True)
    kept: list[str] = []
    for frame in KEY_FRAMES:
        for src, prefix in ((prod_dir / f"frame_{frame:04d}.png", "production"), (static_dir / f"static_{frame:04d}.png", "static_camera")):
            if src.exists():
                dst = keyframe_dir / f"{prefix}_{frame:04d}.png"
                shutil.copyfile(src, dst)
                resolved = dst.resolve()
                kept.append(str(resolved.relative_to(REPO_ROOT) if resolved.is_relative_to(REPO_ROOT) else resolved))

    mp4 = out_root / f"local_acceptance_{args.resolution}.mp4"
    encode = subprocess.run(
        [
            "ffmpeg", "-y", "-framerate", str(FPS),
            "-i", str(prod_dir / "frame_%04d.png"),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
            str(mp4),
        ],
        check=False,
        capture_output=True,
    )

    width, height = A.parse_resolution(args.resolution)
    active_lights = sorted(o.name for o in bpy.data.objects if o.type == "LIGHT")
    min_static_motion = min(static_motion.values()) if static_motion else 0.0

    checks = {
        "frameCount": len(frames) == args.frames,
        "resolution": all(s["width"] == width and s["height"] == height for s in stats) and bool(stats),
        "staticCameraFramesRendered": len(static_frames) == len(KEY_FRAMES),
        # Characters must move in the pixels of the locked-off camera render.
        "characterPixelMotion": min_static_motion >= MIN_MOVING_PIXEL_FRACTION,
        "noDuplicateLights": len(active_lights) == 3,
        # Picture quality, measured on stored pixels (see the threshold block at
        # the top of this file for why the old numbers cannot be compared).
        "exposureInBand": all(EXPOSURE_MIN_PCT <= s["meanLumaPct"] <= EXPOSURE_MAX_PCT for s in stats)
        and bool(stats),
        "highlightsPresent": all(s["p99Luma"] >= HIGHLIGHT_P99_MIN for s in stats) and bool(stats),
        "noHighlightClipping": all(s["clippedHighlightFraction"] <= HIGHLIGHT_CLIP_MAX for s in stats)
        and bool(stats),
        "shadowsLifted": all(
            s["p01Luma"] >= SHADOW_P01_MIN and s["clippedShadowFraction"] <= SHADOW_CLIP_MAX for s in stats
        )
        and bool(stats),
        "shadowDepthRetained": all(
            s["p01Luma"] <= SHADOW_DEPTH_MAX_RATIO * s["meanLuma"] for s in stats
        )
        and bool(stats),
        "saturationHealthy": all(s["meanSaturation"] >= SATURATION_MIN for s in stats) and bool(stats),
        "tonalRangeHealthy": all(s["tonalRange"] >= TONAL_RANGE_MIN for s in stats) and bool(stats),
        # Both characters must read against the field, and must sit on it.
        "subjectsMeasured": bool(separation)
        and all(set(SEPARATION_ROLES) <= set(per_frame) for per_frame in separation.values()),
        "subjectSeparation": bool(separation)
        and all(
            entry["litSideVsAdjacentGrass"] is not None
            and entry["litSideVsAdjacentGrass"] >= SEPARATION_MIN
            for per_frame in separation.values()
            for entry in per_frame.values()
        ),
        "groundContact": bool(separation)
        and all(
            entry["contactDarkening"] is not None and entry["contactDarkening"] >= CONTACT_MIN
            for per_frame in separation.values()
            for entry in per_frame.values()
        ),
        "videoEncoded": mp4.exists() and mp4.stat().st_size > 1000,
    }
    ok = all(checks.values())

    report = {
        "ok": ok,
        "status": "PASS" if ok else "FAIL",
        "gate": {"LOCAL_VISUAL_ACCEPTANCE": ok},
        "resolution": args.resolution,
        "aspect": "9:16 (same as FINAL_1080P)",
        "frames": len(frames),
        "fps": FPS,
        "samples": args.samples,
        "checks": checks,
        "keyFrameStats": stats,
        "subjectSeparation": separation,
        "keyFrames": kept,
        "staticCameraMovingPixelFraction": static_motion,
        "minStaticCameraMovingPixelFraction": min_static_motion,
        "thresholds": {
            "pixelDelta": PIXEL_DELTA_THRESHOLD,
            "minMovingPixelFraction": MIN_MOVING_PIXEL_FRACTION,
            "exposurePctBand": [EXPOSURE_MIN_PCT, EXPOSURE_MAX_PCT],
            "highlightP99Min": HIGHLIGHT_P99_MIN,
            "highlightClipMax": HIGHLIGHT_CLIP_MAX,
            "shadowP01Min": SHADOW_P01_MIN,
            "shadowClipMax": SHADOW_CLIP_MAX,
            "shadowDepthMaxRatio": SHADOW_DEPTH_MAX_RATIO,
            "saturationMin": SATURATION_MIN,
            "tonalRangeMin": TONAL_RANGE_MIN,
            "separationMin": SEPARATION_MIN,
            "contactMin": CONTACT_MIN,
        },
        # Recorded so a report can never be read as if it described a different
        # measurement convention than the one that produced it.
        "measurement": {
            "source": "stored PNG bytes (scripts/assets/png_io.py)",
            "colorspace": sorted({s["colorspace"] for s in stats}) if stats else [],
        },
        "activeLights": active_lights,
        "lighting": built["lighting"],
        "placementRoots": built["placementRoots"],
        "appliedActions": built["appliedActions"],
        "strippedFromAssets": built["stripped"],
        "video": str(mp4) if mp4.exists() else None,
        "ffmpegOk": encode.returncode == 0,
        "blenderVersion": bpy.app.version_string,
    }
    (out_root / "local_acceptance.json").write_text(json.dumps(report, indent=2))
    print("DDP_LOCAL_ACCEPTANCE:" + json.dumps({"status": report["status"], "checks": checks}))
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
