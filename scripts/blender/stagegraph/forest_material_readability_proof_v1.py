"""Render targeted material-readability crops, then one locked 1280x720 still."""

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
from cinematic_forest_lighting_repair_v1 import EXPOSURE, apply_cinematic_forest_lighting_repair
from ecokit_cycles_alpha_v1 import (
    activate_all_ecokit_cycles_outputs,
    configure_cycles_transparency,
    prepare_ecokit_cycles_alpha,
    remap_backslash_image_paths,
)
from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
from vendor_reference_lookdev_v1 import apply_cycles_bounce_lift
from vendor_reference_render_v1 import SOURCE_SHA256, AUDIT_SHA256, build_scene, png_dimensions

CROPS = {
    "BARK_PROOF": (0.14, 0.40, 0.18, 0.70),
    "FOREST_FLOOR_PROOF": (0.12, 0.88, 0.00, 0.36),
    "FLORA_PROOF": (0.02, 0.52, 0.06, 0.42),
    "CANOPY_DEPTH_PROOF": (0.18, 0.82, 0.52, 0.98),
    "SKY_DEPTH_PROOF": (0.28, 0.72, 0.68, 0.96),
}


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default=SOURCE_SHA256)
    parser.add_argument("--dependency-audit-sha256", default=AUDIT_SHA256)
    parser.add_argument("--owned-hdri", required=True)
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--crop-samples", type=int, default=16)
    parser.add_argument("--skip-full", action="store_true")
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


def render_path(scene, path: Path) -> dict:
    import bpy

    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.context.window.scene = scene
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not path.is_file():
        raise RuntimeError("PROOF_FRAME_MISSING:" + path.name)
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "dimensions": png_dimensions(path),
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
    apply_forest_canopy_lighting_repair(scene)
    cinematic = apply_cinematic_forest_lighting_repair(scene)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    crops = {}
    scene.cycles.samples = int(args.crop_samples)
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    for name, (xmin, xmax, ymin, ymax) in CROPS.items():
        scene.render.border_min_x = xmin
        scene.render.border_max_x = xmax
        scene.render.border_min_y = ymin
        scene.render.border_max_y = ymax
        crops[name] = render_path(scene, out_dir / f"{name}.png")

    full = None
    if not args.skip_full:
        scene.render.use_border = False
        scene.render.use_crop_to_border = False
        scene.cycles.samples = int(args.samples)
        full = render_path(scene, out_dir / "FOREST_MATERIAL_READABILITY_PROOF_V1.png")
        if full["dimensions"] != [1280, 720]:
            raise RuntimeError("PROOF_DIMENSION_MISMATCH")

    receipt = {
        "schema": "TIVVLEJOY_FOREST_MATERIAL_READABILITY_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": args.samples,
        "cropSamples": args.crop_samples,
        "device": "CPU",
        "camera": {
            "name": camera.name,
            "lensMm": camera.data.lens,
            "location": [round(float(v), 4) for v in camera.location],
            "changed": False,
        },
        "placed": placed,
        "composition": composition,
        "exposure": EXPOSURE,
        "crops": crops,
        "full": full,
        "cinematicRepair": {
            "colorManagement": cinematic.get("colorManagement"),
            "world": cinematic.get("world"),
            "ground": cinematic.get("ground"),
            "trunks": cinematic.get("trunks"),
            "floraShader": cinematic.get("floraShader"),
            "cameraChanged": False,
            "geometryRebuilt": False,
        },
        "visualApproval": False,
        "vendorReferenceReproducedApproved": False,
    }
    (out_dir / "FOREST_MATERIAL_READABILITY_PROOF_V1.json").write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "schema": receipt["schema"],
        "crops": {name: item["path"] for name, item in crops.items()},
        "full": None if full is None else full["path"],
        "fullSha256": None if full is None else full["sha256"],
        "cameraChanged": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
