"""Configure camera settings for a vertical Doodle Dash render."""

from __future__ import annotations

import argparse

from _common import emit, parse_blender_args


def main() -> None:
    parser = argparse.ArgumentParser(description="Configure camera framing.")
    parser.add_argument("--camera", default="Camera", help="Camera object name.")
    parser.add_argument("--focal-length", type=float, default=35.0, help="Camera focal length in mm.")
    parser.add_argument("--resolution", choices=["270x480", "360x640", "540x960", "1080x1920"], default="1080x1920")
    parser.add_argument("--target", help="Optional target object for framing.")
    args = parse_blender_args(parser)
    emit("OK", "Camera configuration stub completed.", camera=args.camera, focalLength=args.focal_length, resolution=args.resolution, target=args.target)


if __name__ == "__main__":
    main()
