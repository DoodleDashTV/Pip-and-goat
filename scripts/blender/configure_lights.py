"""Configure basic lighting for a Doodle Dash scene."""

from __future__ import annotations

import argparse

from _common import emit, parse_blender_args


def main() -> None:
    parser = argparse.ArgumentParser(description="Configure scene lighting.")
    parser.add_argument("--preset", default="soft_key", help="Lighting preset name.")
    parser.add_argument("--energy", type=float, default=600.0, help="Primary light energy.")
    parser.add_argument("--world-strength", type=float, default=0.8, help="World background strength.")
    args = parse_blender_args(parser)
    emit("OK", "Lighting configuration stub completed.", preset=args.preset, energy=args.energy, worldStrength=args.world_strength)


if __name__ == "__main__":
    main()
