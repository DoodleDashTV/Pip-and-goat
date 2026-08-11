"""Assemble a Doodle Dash scene for headless Blender rendering."""

from __future__ import annotations

import argparse
import json
import os

from _common import emit, parse_blender_args, require_asset


def main() -> None:
    parser = argparse.ArgumentParser(description="Assemble a scene from validated asset references.")
    parser.add_argument("--scene-id", required=True)
    parser.add_argument("--resolution", choices=["270x480", "360x640", "540x960", "1080x1920"], default="540x960")
    parser.add_argument("--fps", type=int, choices=[24, 30, 60], default=30)
    parser.add_argument("--engine", choices=["EEVEE", "CYCLES"], default="EEVEE")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--assets-json", default="[]", help="JSON array of asset refs with optional localPath.")
    args = parse_blender_args(parser)
    assets = json.loads(args.assets_json)
    if not isinstance(assets, list):
        emit("INVALID_ARGUMENT", "assets-json must decode to a list.")
        raise SystemExit(2)

    missing = []
    for asset in assets:
        local_path = asset.get("localPath") if isinstance(asset, dict) else None
        role = asset.get("role", "asset") if isinstance(asset, dict) else "asset"
        try:
            require_asset(local_path, role)
        except SystemExit:
            missing.append({"role": role, "path": local_path})

    if missing:
        emit("MISSING_ASSET", "One or more scene assets are missing.", missing=missing)
        raise SystemExit(2)

    os.makedirs(args.output_dir, exist_ok=True)
    emit("OK", "Scene assembly stub completed.", sceneId=args.scene_id, assetCount=len(assets), resolution=args.resolution, fps=args.fps, engine=args.engine, outputDir=args.output_dir)


if __name__ == "__main__":
    main()
