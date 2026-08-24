from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


class ModeError(ValueError):
    pass


def emit(status: str, message: str, **details: Any) -> None:
    print(json.dumps({"status": status, "message": message, **details}, sort_keys=True))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TivvleJoy character builder. Dry-run never launches GPU.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--artifact-dir", default="artifacts/character-rigging/CHAR_GOAT_001")
    parser.add_argument("--working-blend", default="")
    parser.add_argument("--source-zip", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--character-id", default="CHAR_GOAT_001")
    parser.add_argument("--inject-stage-failure", default="")
    raw = list(sys.argv[1:] if argv is None else argv)
    if "--" in raw:
        raw = raw[raw.index("--") + 1 :]
    args = parser.parse_args(raw)
    env_mode = os.environ.get("CHARACTER_EXECUTION_MODE", "").strip()
    if not args.dry_run and not args.execute:
        if env_mode == "live":
            args.execute = True
        elif env_mode == "dry-run":
            args.dry_run = True
    if args.dry_run and args.execute:
        raise ModeError("CONFLICTING_EXECUTION_FLAGS: --dry-run and --execute are mutually exclusive.")
    if not args.dry_run and not args.execute:
        raise ModeError(
            "EXECUTION_MODE_REQUIRED: the guarded dispatcher must pass exactly one of --dry-run or --execute."
        )
    if not args.working_blend:
        args.working_blend = os.environ.get("CHARACTER_WORKING_BLEND", "")
    if not args.source_zip:
        args.source_zip = os.environ.get("CHARACTER_SOURCE_ZIP", "")
    args.execution_mode = "live" if args.execute else "dry-run"
    return args


def write_report(artifact_dir: str | Path, name: str, payload: dict[str, Any]) -> Path:
    directory = Path(artifact_dir)
    locked = ("tivvlejoy-assets", "characters", "CHAR_GOAT_001", "source")
    parts = directory.parts
    if any(parts[i : i + 4] == locked for i in range(max(0, len(parts) - 3))):
        raise RuntimeError("Refusing to write into the locked source prefix.")
    if "SOURCE" in directory.parts and name.lower().endswith(".blend"):
        raise RuntimeError("Refusing to write a blend into SOURCE.")
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path
