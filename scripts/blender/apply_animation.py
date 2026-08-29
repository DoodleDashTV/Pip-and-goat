"""Apply an animation clip to a Blender object or rig."""

from __future__ import annotations

import argparse

from _common import add_asset_arg, emit, parse_blender_args, require_asset
from animation.motion_polish import MOTION_PROFILES, get_motion_profile


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply an animation asset to a target rig/object.")
    add_asset_arg(parser, "animation_asset", "animation")
    parser.add_argument("--target", required=True, help="Target object or rig name.")
    parser.add_argument("--start-frame", type=int, default=1, help="Frame where the animation begins.")
    parser.add_argument(
        "--motion-profile",
        choices=tuple(MOTION_PROFILES),
        default="ORGANIC_ACTION",
        help="Approved interpolation/deformation profile recorded with the application.",
    )
    args = parse_blender_args(parser)
    asset_path = require_asset(args.animation_asset, "animation")
    profile = get_motion_profile(args.motion_profile)
    emit(
        "OK",
        "Animation asset validated for application.",
        target=args.target,
        path=asset_path,
        startFrame=args.start_frame,
        motionProfile=profile.profile_id,
        interpolation=profile.interpolation,
        squashStretchLimit=profile.squash_stretch_limit,
        profilePurpose=profile.purpose,
    )


if __name__ == "__main__":
    main()
