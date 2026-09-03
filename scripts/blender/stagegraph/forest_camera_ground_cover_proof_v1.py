"""Locked-camera ground-cover proof. Does not rebuild lighting or vendor shaders."""

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
from ecokit_cycles_alpha_v1 import (
    activate_all_ecokit_cycles_outputs,
    configure_cycles_transparency,
    remap_backslash_image_paths,
)
from forest_botaniq_production_recovery_v1 import apply_botaniq_production_recovery, missing_owned_paths
from forest_camera_ground_cover_v1 import apply_camera_ground_cover
from forest_lookdev_isolation_v1 import verify_production_camera
from vendor_reference_lookdev_v1 import apply_cycles_bounce_lift
from vendor_reference_render_v1 import AUDIT_SHA256, SOURCE_SHA256, build_scene, png_dimensions


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default=SOURCE_SHA256)
    parser.add_argument("--dependency-audit-sha256", default=AUDIT_SHA256)
    parser.add_argument("--owned-hdri", required=True)
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=24)
    parser.add_argument("--bark-kind", default="tilia")
    parser.add_argument("--proof-name", default="FOREST_GROUND_COVER_CAMERA_PROOF_V1.png")
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    import bpy

    args = parse_args()
    if args.source_sha256.removeprefix("sha256:") != SOURCE_SHA256:
        raise RuntimeError("SOURCE_SHA256_MISMATCH")
    if args.dependency_audit_sha256.removeprefix("sha256:") != AUDIT_SHA256:
        raise RuntimeError("DEPENDENCY_AUDIT_SHA256_MISMATCH")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    missing = missing_owned_paths()
    if missing:
        receipt = {
            "schema": "TIVVLEJOY_FOREST_CAMERA_GROUND_COVER_PROOF_V1",
            "result": "BLOCKED",
            "missing": missing,
            "paidCreateCount": 0,
            "paidSpendUsd": 0,
        }
        (out_dir / "FOREST_GROUND_COVER_CAMERA_PROOF_V1.json").write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(json.dumps(receipt, sort_keys=True))
        return 2

    apply_image_bindings(json.loads(args.image_bindings_json))
    remap_backslash_image_paths()
    activate_all_ecokit_cycles_outputs()
    scene, camera, placed, composition = build_scene(args)
    bpy.context.window.scene = scene
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = False
    scene.cycles.samples = max(int(args.samples), 16)
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    configure_cycles_transparency(scene)
    apply_cycles_bounce_lift(scene)

    production = apply_botaniq_production_recovery(scene, mode="production", bark_kind=args.bark_kind)
    cover = apply_camera_ground_cover(scene)
    locks = verify_production_camera(scene)
    scene.camera = camera

    out_path = out_dir / args.proof_name
    if out_path.exists():
        raise RuntimeError("PROOF_WOULD_OVERWRITE:" + out_path.name)
    scene.render.filepath = str(out_path)
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not out_path.is_file():
        raise RuntimeError("GROUND_COVER_PROOF_MISSING")

    receipt = {
        "schema": "TIVVLEJOY_FOREST_CAMERA_GROUND_COVER_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": scene.cycles.samples,
        "device": "CPU",
        "seconds": elapsed,
        "path": str(out_path),
        "sha256": sha256_file(out_path),
        "bytes": out_path.stat().st_size,
        "dimensions": png_dimensions(out_path),
        "productionCamera": locks,
        "placed": placed,
        "composition": composition,
        "production": production,
        "groundCover": cover,
        "visualApproval": False,
        "vendorGroundShaderChanged": False,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "lightingChanged": False,
        "compositionChanged": False,
    }
    (out_dir / (out_path.stem + ".json")).write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "schema": receipt["schema"],
        "path": receipt["path"],
        "sha256": receipt["sha256"],
        "dimensions": receipt["dimensions"],
        "counts": cover.get("counts"),
        "cameraChanged": False,
        "paidCreateCount": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
