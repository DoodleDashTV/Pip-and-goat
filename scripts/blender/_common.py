"""Shared helpers for Doodle Dash Blender automation stubs."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any


def emit(status: str, message: str, **details: Any) -> None:
    print(json.dumps({"status": status, "message": message, **details}, sort_keys=True))


def require_asset(asset_path: str | None, role: str) -> str:
    if not asset_path:
        emit("MISSING_ASSET", f"Missing {role} asset path.", role=role)
        raise SystemExit(2)
    if not os.path.exists(asset_path):
        emit("MISSING_ASSET", f"{role} asset does not exist.", role=role, path=asset_path)
        raise SystemExit(2)
    return asset_path


def add_asset_arg(parser: argparse.ArgumentParser, name: str, role: str) -> None:
    parser.add_argument(name, help=f"Path to the {role} asset. Emits MISSING_ASSET when absent.")


def parse_blender_args(parser: argparse.ArgumentParser) -> argparse.Namespace:
    """Accept direct script args and Blender '--python script.py -- ...' args."""
    argv = sys.argv[1:]
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    return parser.parse_args(argv)
