"""Render frames for a configured Blender scene (real bpy implementation)."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from _common import emit, parse_blender_args


def main() -> None:
    import bpy

    parser = argparse.ArgumentParser(description="Render scene frames.")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--start-frame", type=int, default=1)
    parser.add_argument("--end-frame", type=int, required=True)
    parser.add_argument("--engine", choices=["EEVEE", "CYCLES"], default="EEVEE")
    parser.add_argument("--fps", type=int, choices=[24, 30, 60], default=30)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--width", type=int, default=0)
    parser.add_argument("--height", type=int, default=0)
    args = parse_blender_args(parser)

    if args.end_frame < args.start_frame:
        emit("INVALID_ARGUMENT", "end-frame must be >= start-frame.")
        raise SystemExit(2)

    scene = bpy.context.scene
    scene.frame_start = args.start_frame
    scene.frame_end = args.end_frame
    scene.render.fps = args.fps
    if args.width > 0:
        scene.render.resolution_x = args.width
    if args.height > 0:
        scene.render.resolution_y = args.height

    if args.engine == "EEVEE":
        scene.render.engine = "BLENDER_EEVEE"
        if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
            scene.eevee.taa_render_samples = max(1, args.samples)
    else:
        scene.render.engine = "CYCLES"

    if not scene.camera:
        emit("NO_CAMERA", "Scene has no camera; cannot render.")
        raise SystemExit(2)

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(out / "frame_")
    bpy.ops.render.render(animation=True)
    count = len(list(out.glob("frame_*.png")))
    emit(
        "OK",
        "Frame render completed.",
        outputDir=str(out),
        startFrame=args.start_frame,
        endFrame=args.end_frame,
        engine=scene.render.engine,
        fps=args.fps,
        frameCount=count,
    )
    (out / "render_meta.json").write_text(
        json.dumps(
            {
                "ok": True,
                "frameCount": count,
                "engine": scene.render.engine,
                "fps": args.fps,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
