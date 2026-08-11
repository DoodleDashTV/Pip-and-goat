"""Load a location/environment asset into the current Blender scene."""

from __future__ import annotations

import argparse

from _common import add_asset_arg, emit, parse_blender_args, require_asset


def main() -> None:
    parser = argparse.ArgumentParser(description="Load a Doodle Dash location asset.")
    add_asset_arg(parser, "location_asset", "location")
    parser.add_argument("--location-id", required=True, help="Stable location id/code.")
    parser.add_argument("--collection", default="Locations", help="Target Blender collection name.")
    args = parse_blender_args(parser)
    asset_path = require_asset(args.location_asset, "location")
    emit("OK", "Location asset validated for loading.", locationId=args.location_id, path=asset_path, collection=args.collection)


if __name__ == "__main__":
    main()
