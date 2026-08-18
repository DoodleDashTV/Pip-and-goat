"""Inspect one temporary .blend copy without executing embedded scripts."""
from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import emit, parse_blender_args  # noqa: E402
SCHEMA_VERSION = "TIVVLEJOY_SCENERY_BLENDER_INSPECTION_V1"

def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    value.add_argument("--source-id", required=True)
    value.add_argument("--source-copy", required=True)
    value.add_argument("--report", required=True)
    return value

def main() -> int:
    args = parse_blender_args(parser())
    source, report_path = Path(args.source_copy).resolve(), Path(args.report).resolve()
    if not source.is_file() or source.suffix.lower() != ".blend":
        emit("REFUSED", "A materialized .blend copy is required."); return 2
    if os.environ.get("TIVVLEJOY_BLENDER_NETWORK_ISOLATED") != "1":
        emit("REFUSED", "An isolated network namespace is required."); return 2
    if source == report_path or report_path.suffix.lower() != ".json":
        emit("REFUSED", "The report must be a separate JSON path."); return 2
    import bpy  # type: ignore
    before = (source.stat().st_size, source.stat().st_mtime_ns)
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    missing_images = sorted(image.filepath for image in bpy.data.images if image.source == "FILE" and image.filepath and not Path(bpy.path.abspath(image.filepath)).exists())
    geometry_nodes = sorted(group.name for group in bpy.data.node_groups if group.bl_idname == "GeometryNodeTree")
    triangles = {}
    for mesh in bpy.data.meshes:
        mesh.calc_loop_triangles(); triangles[mesh.name] = len(mesh.loop_triangles)
    payload = {
        "schemaVersion": SCHEMA_VERSION, "sourceId": args.source_id,
        "blenderExecuted": True, "blenderVersionDetected": bpy.app.version_string,
        "factoryStartup": True, "autoExecutionDisabled": True, "networkAccess": False,
        "sourceWasTemporaryCopy": True, "sourceModified": False, "automaticallyApproved": False,
        "scenes": len(bpy.data.scenes), "collections": len(bpy.data.collections),
        "objects": len(bpy.data.objects), "meshes": len(bpy.data.meshes),
        "materials": len(bpy.data.materials), "images": len(bpy.data.images),
        "cameras": len(bpy.data.cameras), "lights": len(bpy.data.lights),
        "armatures": len(bpy.data.armatures), "animations": len(bpy.data.actions),
        "geometryNodes": geometry_nodes,
        "linkedLibraries": sorted(lib.filepath for lib in bpy.data.libraries if lib.filepath),
        "missingExternalFiles": missing_images, "triangleCounts": triangles,
    }
    payload["sourceModified"] = before != (source.stat().st_size, source.stat().st_mtime_ns)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if payload["sourceModified"]:
        emit("REFUSED", "The temporary source copy changed during inspection."); return 3
    emit("OK", "Isolated Blender inspection complete.", report=str(report_path)); return 0

if __name__ == "__main__":
    raise SystemExit(main())
