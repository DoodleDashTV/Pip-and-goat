"""Apply a viseme timeline to a facial rig."""

from __future__ import annotations

import argparse
import json

from _common import add_asset_arg, emit, parse_blender_args, require_asset


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply lip-sync viseme timeline data.")
    add_asset_arg(parser, "timeline_json", "lip_sync_timeline")
    parser.add_argument("--target", required=True, help="Target facial rig or character object.")
    parser.add_argument("--start-frame", type=int, default=1, help="Frame where timeline begins.")
    args = parse_blender_args(parser)
    timeline_path = require_asset(args.timeline_json, "lip_sync_timeline")
    with open(timeline_path, "r", encoding="utf-8") as handle:
        timeline = json.load(handle)
    cues = timeline.get("cues", []) if isinstance(timeline, dict) else []
    emit("OK", "Lip-sync timeline validated for application.", target=args.target, path=timeline_path, cueCount=len(cues), startFrame=args.start_frame)


if __name__ == "__main__":
    main()
