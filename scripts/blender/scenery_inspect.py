"""TivvleJoy scenery source inspection (dry-run safe).

Never overwrites purchased source files. Normalization, when implemented for
real Blender runs, writes only to a separate output path. This increment records
command, schema, and dry-run behavior. Real Blender execution is marked not run
when bpy is unavailable.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args  # noqa: E402

SCHEMA_VERSION = "TIVVLEJOY_SCENERY_FOUNDATION_V1"
SUPPORTED_BLENDER = "4.2.2"


def blender_available() -> bool:
    try:
        import bpy  # type: ignore  # noqa: F401

        return True
    except Exception:
        return False


def detect_blender_version() -> str | None:
    try:
        import bpy  # type: ignore

        return bpy.app.version_string
    except Exception:
        return None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Inspect a TivvleJoy scenery source without modifying it.")
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source", required=True, help="Purchased source .blend path. Never overwritten.")
    parser.add_argument("--report", required=True)
    parser.add_argument("--normalize-out", required=True, help="Separate normalized output directory.")
    parser.add_argument("--texture-root", action="append", default=[])
    parser.add_argument("--dry-run", action="store_true")
    return parser


def write_report(path: str, payload: dict) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_blender_args(build_parser())
    source_path = Path(args.source)
    normalize_out = Path(args.normalize_out)
    if source_path.resolve() == normalize_out.resolve():
        emit("REFUSED", "Normalization output must not equal the purchased source path.")
        return 2

    available = blender_available()
    dry_run = bool(args.dry_run) or not available
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "tivvlejoy_scenery_inspect",
        "sourceId": args.source_id,
        "blenderExecuted": False,
        "blenderVersionDetected": detect_blender_version() if available and not dry_run else None,
        "supportedBlenderVersion": SUPPORTED_BLENDER,
        "dryRun": True,
        "sourceModified": False,
        "normalizedWritten": False,
        "objects": [],
        "collections": [],
        "materials": [],
        "images": [],
        "nodeGroups": [],
        "missingExternalFiles": [],
        "packedTextures": [],
        "externalTextures": [],
        "geometryNodes": [],
        "unsupportedNodes": [],
        "duplicateMaterials": [],
        "duplicateImages": [],
        "dimensions": {},
        "triangleCounts": {},
        "origins": {},
        "proxyRecords": [],
        "deterministicAssetIds": [],
        "realExecution": "not_run",
        "notes": [
            "Dry-run only. Purchased source files were not opened.",
            "Real Blender execution was not run." if dry_run or not available else "Blender was present but dry-run was requested.",
            "Normalization writes only to a separate output path and never overwrites source.",
            f"Texture search roots registered: {len(args.texture_root)}.",
        ],
    }
    write_report(args.report, report)
    emit(
        "OK",
        "TivvleJoy scenery inspection dry-run complete.",
        blenderExecuted=False,
        sourceModified=False,
        report=args.report,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
