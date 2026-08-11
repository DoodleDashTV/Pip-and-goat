"""Render frames for a configured Blender scene."""

from __future__ import annotations

import argparse
import os

from _common import emit, parse_blender_args


def main() -> None:
    parser = argparse.ArgumentParser(description="Render scene frames.")
    parser.add_argument("--output-dir", required=True, help="Directory for rendered frames.")
    parser.add_argument("--start-frame", type=int, default=1)
    parser.add_argument("--end-frame", type=int, required=True)
    parser.add_argument("--engine", choices=["EEVEE", "CYCLES"], default="EEVEE")
    parser.add_argument("--fps", type=int, choices=[24, 30, 60], default=30)
    args = parse_blender_args(parser)
    if args.end_frame < args.start_frame:
        emit("INVALID_ARGUMENT", "end-frame must be greater than or equal to start-frame.", startFrame=args.start_frame, endFrame=args.end_frame)
        raise SystemExit(2)
    os.makedirs(args.output_dir, exist_ok=True)
    emit("OK", "Frame render stub completed.", outputDir=args.output_dir, startFrame=args.start_frame, endFrame=args.end_frame, engine=args.engine, fps=args.fps)


if __name__ == "__main__":
    main()
