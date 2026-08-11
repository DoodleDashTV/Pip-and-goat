"""Load a character asset into the current Blender scene."""

from __future__ import annotations

import argparse

from _common import add_asset_arg, emit, parse_blender_args, require_asset


def main() -> None:
    parser = argparse.ArgumentParser(description="Load a Doodle Dash character asset.")
    add_asset_arg(parser, "character_asset", "character")
    parser.add_argument("--character-id", required=True, help="Stable character id/code for scene metadata.")
    parser.add_argument("--collection", default="Characters", help="Target Blender collection name.")
    args = parse_blender_args(parser)
    asset_path = require_asset(args.character_asset, "character")
    emit("OK", "Character asset validated for loading.", characterId=args.character_id, path=asset_path, collection=args.collection)


if __name__ == "__main__":
    main()
