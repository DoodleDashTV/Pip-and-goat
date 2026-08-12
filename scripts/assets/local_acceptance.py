"""Local CPU acceptance render for the DDP acceptance scene. No GPU, no Runpod.

Renders the real production shot (same ``assemble_scene.build_scene`` path the
cloud worker uses) at reduced resolution but production 9:16 aspect and shot
logic, then proves from the pixels that:

  * Pip and Goat visibly move (measured on a SECOND render with a locked-off
    camera, so camera movement cannot account for any pixel change);
  * exposure is controlled rather than washed out;
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
MIN_MOVING_PIXEL_FRACTION = 0.005


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local CPU acceptance render.")
    parser.add_argument("--out", required=True)
    parser.add_argument("--resolution", default=LOCAL_RESOLUTION)
    parser.add_argument("--frames", type=int, default=FRAMES)
    parser.add_argument("--samples", type=int, default=SAMPLES)
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    return parser.parse_args(argv)


def load_srgb(path: Path):
    """Load a rendered PNG as an HxWx3 array of 0-255 sRGB values."""
    import bpy
    import numpy as np

    img = bpy.data.images.load(str(path))
    width, height = img.size
    buf = np.empty(width * height * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    bpy.data.images.remove(img)
    rgb = buf.reshape(height, width, 4)[:, :, :3]
    # Blender hands back scene-linear floats; encode to sRGB so the numbers are
    # comparable with the 8-bit QC figures reported for the cloud render.
    low = rgb <= 0.0031308
    srgb = np.where(low, rgb * 12.92, 1.055 * np.clip(rgb, 1e-8, None) ** (1 / 2.4) - 0.055)
    return np.clip(srgb, 0.0, 1.0) * 255.0


def frame_stats(path: Path) -> dict:
    import numpy as np

    rgb = load_srgb(path)
    luma = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    saturation = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6) * 128.0, 0.0)
    return {
        "frame": path.name,
        "height": int(rgb.shape[0]),
        "width": int(rgb.shape[1]),
        "meanLuma": round(float(luma.mean()), 2),
        "minLuma": round(float(luma.min()), 2),
        "maxLuma": round(float(luma.max()), 2),
        "meanSaturation": round(float(saturation.mean()), 2),
    }


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

    mp4 = out_root / "local_acceptance_270x480.mp4"
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
        # Thresholds measured against real frames. The first cloud acceptance
        # render sat at mean luma 167-175 with a darkest pixel of 50/255 and mean
        # saturation 12.6/128: milky, no blacks, desaturated. The shadow and
        # saturation floors are what reject that look — whole-frame mean luma is
        # the weakest discriminator (it moves with how much sky is in frame), so
        # it only guards against gross under/over exposure.
        "exposureControlled": all(90.0 <= s["meanLuma"] <= 180.0 for s in stats) and bool(stats),
        "hasTrueBlacks": all(s["minLuma"] <= 40.0 for s in stats) and bool(stats),
        "hasHighlights": all(s["maxLuma"] >= 160.0 for s in stats) and bool(stats),
        "saturationHealthy": all(s["meanSaturation"] >= 30.0 for s in stats) and bool(stats),
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
        "keyFrames": kept,
        "staticCameraMovingPixelFraction": static_motion,
        "minStaticCameraMovingPixelFraction": min_static_motion,
        "thresholds": {
            "pixelDelta": PIXEL_DELTA_THRESHOLD,
            "minMovingPixelFraction": MIN_MOVING_PIXEL_FRACTION,
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
