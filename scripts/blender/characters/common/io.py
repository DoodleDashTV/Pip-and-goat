from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def emit(status: str, message: str, **details: Any) -> None:
    print(json.dumps({"status": status, "message": message, **details}, sort_keys=True))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TivvleJoy character builder. Dry-run never launches GPU.")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--artifact-dir", default="artifacts/character-rigging/CHAR_GOAT_001")
    parser.add_argument("--working-blend", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--character-id", default="CHAR_GOAT_001")
    raw = list(sys.argv[1:] if argv is None else argv)
    if "--" in raw:
        raw = raw[raw.index("--") + 1 :]
    return parser.parse_args(raw)


def write_report(artifact_dir: str | Path, name: str, payload: dict[str, Any]) -> Path:
    directory = Path(artifact_dir)
    if "SOURCE" in directory.parts and name.lower().endswith(".blend"):
        raise RuntimeError("Refusing to write a blend into SOURCE.")
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path
