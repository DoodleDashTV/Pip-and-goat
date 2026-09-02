"""Render exactly one 1280x720 cinematic lighting proof. No animation. Camera stays locked."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_BLENDER = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(REPO_BLENDER) not in sys.path:
    sys.path.insert(0, str(REPO_BLENDER))

from asset_certify_blender_v1 import apply_image_bindings
from cinematic_forest_lighting_repair_v1 import apply_cinematic_forest_lighting_repair
from ecokit_cycles_alpha_v1 import (
    activate_all_ecokit_cycles_outputs,
    configure_cycles_transparency,
    prepare_ecokit_cycles_alpha,
    remap_backslash_image_paths,
)
from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
from vendor_reference_lookdev_v1 import apply_cycles_bounce_lift
from vendor_reference_render_v1 import SOURCE_SHA256, AUDIT_SHA256, build_scene, png_dimensions


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default=SOURCE_SHA256)
    parser.add_argument("--dependency-audit-sha256", default=AUDIT_SHA256)
    parser.add_argument("--owned-hdri", required=True)
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--out", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--samples", type=int, default=48)
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def configure_proof(scene, samples: int) -> None:
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.cycles.samples = int(samples)
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    configure_cycles_transparency(scene)
    apply_cycles_bounce_lift(scene)


def render_still(scene, path: Path) -> dict:
    import bpy

    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.context.window.scene = scene
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not path.is_file():
        raise RuntimeError("PROOF_FRAME_MISSING:" + path.name)
    dimensions = png_dimensions(path)
    if dimensions != [1280, 720]:
        raise RuntimeError("PROOF_DIMENSION_MISMATCH")
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "dimensions": dimensions,
        "seconds": elapsed,
    }


def main():
    import bpy

    args = parse_args()
    if args.source_sha256.removeprefix("sha256:") != SOURCE_SHA256:
        raise RuntimeError("SOURCE_SHA256_MISMATCH")
    if args.dependency_audit_sha256.removeprefix("sha256:") != AUDIT_SHA256:
        raise RuntimeError("DEPENDENCY_AUDIT_SHA256_MISMATCH")

    apply_image_bindings(json.loads(args.image_bindings_json))
    remap_backslash_image_paths()
    activate_all_ecokit_cycles_outputs()
    scene, camera, placed, composition = build_scene(args)
    root = scene.collection.children.get("TJ_VENDOR_REFERENCE_ROOT")
    placed_objects = list(root.objects) if root is not None else []
    prepare_ecokit_cycles_alpha(placed_objects)
    configure_proof(scene, args.samples)
    bpy.context.window.scene = scene
    canopy = apply_forest_canopy_lighting_repair(scene)
    cinematic = apply_cinematic_forest_lighting_repair(scene)
    proof = render_still(scene, Path(args.out))

    receipt = {
        "schema": "TIVVLEJOY_CINEMATIC_FOREST_LIGHTING_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": args.samples,
        "renderEngine": scene.render.engine,
        "device": "CPU",
        "resolution": [1280, 720],
        "camera": {
            "name": camera.name,
            "lensMm": camera.data.lens,
            "location": [round(float(v), 4) for v in camera.location],
            "changed": False,
        },
        "placed": placed,
        "composition": composition,
        "proof": proof,
        "canopyRepairApplied": True,
        "cinematicRepair": {
            "colorManagement": cinematic.get("colorManagement"),
            "world": cinematic.get("world"),
            "ground": cinematic.get("ground"),
            "lights": cinematic.get("lights"),
            "floraShader": cinematic.get("floraShader"),
            "treeleaf": cinematic.get("treeleaf"),
            "trunks": cinematic.get("trunks"),
            "cyclesFlora": cinematic.get("cyclesFlora"),
            "foliage": cinematic.get("foliage"),
            "atmosphere": cinematic.get("atmosphere"),
            "cameraChanged": cinematic.get("cameraChanged"),
            "geometryRebuilt": cinematic.get("geometryRebuilt"),
            "emissionShadersAdded": cinematic.get("emissionShadersAdded"),
            "vendorBlendSaved": False,
        },
        "canopyRepair": {
            "globalExposureDelta": canopy.get("globalExposureDelta"),
            "materialsChanged": (canopy.get("materials") or {}).get("materialsChanged"),
        },
        "animationRendered": False,
        "visualApproval": False,
        "vendorReferenceReproducedApproved": False,
        "vendorBlendSaved": False,
    }
    Path(args.receipt).parent.mkdir(parents=True, exist_ok=True)
    Path(args.receipt).write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": receipt["schema"],
        "proof": proof["path"],
        "sha256": proof["sha256"],
        "seconds": proof["seconds"],
        "samples": args.samples,
        "cameraChanged": False,
        "animationRendered": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
