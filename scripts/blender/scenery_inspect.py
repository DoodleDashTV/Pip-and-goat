"""Inspect TivvleJoy scenery sources.

Two modes:

- `--dry-run` (python3-safe): write a planning report without opening Blender,
  purchased bytes, or bpy. Used by foundation tests and Preview.
- Isolated Blender inspection: requires `--source-copy`, network isolation,
  and a temporary .blend copy. Never used by the dry-run test.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args  # noqa: E402

FOUNDATION_SCHEMA = "TIVVLEJOY_SCENERY_FOUNDATION_V1"
INSPECTION_SCHEMA = "TIVVLEJOY_SCENERY_BLENDER_INSPECTION_V1"
SUPPORTED_BLENDER_VERSION = "4.2.2"


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Inspect a scenery source. Dry-run never executes Blender.")
    value.add_argument("--source-id", required=True)
    value.add_argument("--source", help="Planning/dry-run source path. Bytes are not opened in dry-run.")
    value.add_argument("--source-copy", help="Temporary isolated .blend copy for real inspection.")
    value.add_argument("--report", required=True)
    value.add_argument("--normalize-out", help="Separate normalize output path. Never overwrites source.")
    value.add_argument("--dry-run", action="store_true")
    value.add_argument("--texture-root", action="append", default=[])
    return value


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def dry_run_report(args: argparse.Namespace) -> dict:
    return {
        "schemaVersion": FOUNDATION_SCHEMA,
        "kind": "tivvlejoy_scenery_inspect",
        "sourceId": args.source_id,
        "blenderExecuted": False,
        "blenderVersionDetected": None,
        "supportedBlenderVersion": SUPPORTED_BLENDER_VERSION,
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
            "Real Blender execution was not run.",
            "Normalization writes only to a separate output path and never overwrites source.",
        ],
        "normalizeOut": args.normalize_out,
        "sourcePathRecorded": args.source or args.source_copy,
    }


def isolated_inspect(args: argparse.Namespace) -> int:
    source, report_path = Path(args.source_copy).resolve(), Path(args.report).resolve()
    if not source.is_file() or source.suffix.lower() != ".blend":
        emit("REFUSED", "A materialized .blend copy is required.")
        return 2
    if os.environ.get("TIVVLEJOY_BLENDER_NETWORK_ISOLATED") != "1":
        emit("REFUSED", "An isolated network namespace is required.")
        return 2
    if source == report_path or report_path.suffix.lower() != ".json":
        emit("REFUSED", "The report must be a separate JSON path.")
        return 2
    import bpy  # type: ignore

    before = (source.stat().st_size, source.stat().st_mtime_ns)
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    missing_images = sorted(
        image.filepath
        for image in bpy.data.images
        if image.source == "FILE" and image.filepath and not Path(bpy.path.abspath(image.filepath)).exists()
    )
    geometry_nodes = sorted(group.name for group in bpy.data.node_groups if group.bl_idname == "GeometryNodeTree")
    triangles = {}
    for mesh in bpy.data.meshes:
        mesh.calc_loop_triangles()
        triangles[mesh.name] = len(mesh.loop_triangles)
    payload = {
        "schemaVersion": INSPECTION_SCHEMA,
        "sourceId": args.source_id,
        "blenderExecuted": True,
        "blenderVersionDetected": bpy.app.version_string,
        "factoryStartup": True,
        "autoExecutionDisabled": True,
        "networkAccess": False,
        "sourceWasTemporaryCopy": True,
        "sourceModified": False,
        "automaticallyApproved": False,
        "scenes": len(bpy.data.scenes),
        "collections": len(bpy.data.collections),
        "objects": len(bpy.data.objects),
        "meshes": len(bpy.data.meshes),
        "materials": len(bpy.data.materials),
        "images": len(bpy.data.images),
        "cameras": len(bpy.data.cameras),
        "lights": len(bpy.data.lights),
        "armatures": len(bpy.data.armatures),
        "animations": len(bpy.data.actions),
        "geometryNodes": geometry_nodes,
        "linkedLibraries": sorted(lib.filepath for lib in bpy.data.libraries if lib.filepath),
        "missingExternalFiles": missing_images,
        "triangleCounts": triangles,
    }
    payload["sourceModified"] = before != (source.stat().st_size, source.stat().st_mtime_ns)
    write_json(report_path, payload)
    if payload["sourceModified"]:
        emit("REFUSED", "The temporary source copy changed during inspection.")
        return 3
    emit("OK", "Isolated Blender inspection complete.", report=str(report_path))
    return 0


def main() -> int:
    args = parse_blender_args(parser())
    report_path = Path(args.report)
    if args.dry_run:
        write_json(report_path, dry_run_report(args))
        emit("OK", "Dry-run inspect complete. Blender was not executed.", report=str(report_path))
        return 0
    if not args.source_copy:
        emit("REFUSED", "Real inspection requires --source-copy. Use --dry-run for planning.")
        return 2
    return isolated_inspect(args)


if __name__ == "__main__":
    raise SystemExit(main())
