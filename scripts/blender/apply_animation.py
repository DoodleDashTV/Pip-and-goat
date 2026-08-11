"""Apply an animation clip to a Blender object or rig."""

from __future__ import annotations

import argparse

from _common import add_asset_arg, emit, parse_blender_args, require_asset


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply an animation asset to a target rig/object.")
    add_asset_arg(parser, "animation_asset", "animation")
    parser.add_argument("--target", required=True, help="Target object or rig name.")
    parser.add_argument("--start-frame", type=int, default=1, help="Frame where the animation begins.")
    args = parse_blender_args(parser)
    asset_path = require_asset(args.animation_asset, "animation")
    emit("OK", "Animation asset validated for application.", target=args.target, path=asset_path, startFrame=args.start_frame)


if __name__ == "__main__":
    main()
