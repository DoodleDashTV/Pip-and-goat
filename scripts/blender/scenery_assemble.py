"""TivvleJoy scenery assembly (dry-run safe).

Consumes a scene plan. Loads only normalized assets, never purchased source
archives. Real assembly stays blocked when normalized assets are unavailable.
Never overwrites an approved scene without an explicit versioned path.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args  # noqa: E402

SCHEMA_VERSION = "TIVVLEJOY_SCENERY_FOUNDATION_V1"


def blender_available() -> bool:
    try:
        import bpy  # type: ignore  # noqa: F401

        return True
    except Exception:
        return False


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Assemble a TivvleJoy scenery plan without modifying sources.")
    parser.add_argument("--plan", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-overwrite", action="store_true")
    return parser


def write_report(path: str, payload: dict) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_blender_args(build_parser())
    output = Path(args.output)
    available = blender_available()
    dry_run = bool(args.dry_run) or not available

    plan_payload = {}
    plan_path = Path(args.plan)
    if plan_path.exists():
        plan_payload = json.loads(plan_path.read_text(encoding="utf-8"))

    if output.exists() and not args.allow_overwrite:
        emit("REFUSED", "Approved or existing scene will not be overwritten without versioning.")
        return 2

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "tivvlejoy_scenery_assemble",
        "blenderExecuted": False,
        "dryRun": True,
        "sourceModified": False,
        "sceneWritten": False,
        "outputBlendPath": None,
        "normalizedAssetsLoaded": [],
        "blockedReasons": [
            "Normalized purchased assets are unavailable.",
            "Real Blender execution was not run.",
            "Assembly stays blocked until inspected normalized assets exist.",
        ],
        "rendered": False,
        "realExecution": "not_run",
        "notes": [
            "Dry-run assembly only. No scene file was written.",
            "Purchased source archives were not opened.",
            f"Plan seed {plan_payload.get('seed', 'unknown')} was recorded. Nothing was rendered.",
        ],
    }
    write_report(args.report, report)
    emit(
        "OK",
        "TivvleJoy scenery assembly dry-run complete.",
        blenderExecuted=False,
        rendered=False,
        report=args.report,
        dryRun=dry_run,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
