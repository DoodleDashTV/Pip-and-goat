"""Load a prop asset into the current Blender scene."""

from __future__ import annotations

import argparse

from _common import add_asset_arg, emit, parse_blender_args, require_asset


def main() -> None:
    parser = argparse.ArgumentParser(description="Load a Doodle Dash prop asset.")
    add_asset_arg(parser, "prop_asset", "prop")
    parser.add_argument("--prop-id", required=True, help="Stable prop id/code.")
    parser.add_argument("--collection", default="Props", help="Target Blender collection name.")
    args = parse_blender_args(parser)
    asset_path = require_asset(args.prop_asset, "prop")
    emit("OK", "Prop asset validated for loading.", propId=args.prop_id, path=asset_path, collection=args.collection)


if __name__ == "__main__":
    main()
