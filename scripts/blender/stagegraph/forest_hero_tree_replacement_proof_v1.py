#!/usr/bin/env python3
"""Locked-camera proof after Botaniq hero tree replacement."""

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
from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
from forest_cinematic_lighting_recovery_v1 import apply_cinematic_lighting_recovery
from forest_ground_detail_recovery_v1 import (
    LOCKED_MATERIAL_LIGHTING,
    apply_locked_material_lighting,
    hide_identified_rainbow_specks,
    replace_failed_micro_dressing,
)
from forest_hero_tree_replacement_v1 import apply_hero_tree_replacement
from forest_interior_sun_canopy_structure_v1 import apply_interior_sun_canopy_structure
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
    parser.add_argument("--samples", type=int, default=48)
    parser.add_argument("--bark-kind", default="tilia")
    parser.add_argument("--proof-name", default="FOREST_HERO_TREE_REPLACEMENT_PROOF_V1.png")
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _prepare(args):
    import bpy

    if args.source_sha256.removeprefix("sha256:") != SOURCE_SHA256:
        raise RuntimeError("SOURCE_SHA256_MISMATCH")
    if args.dependency_audit_sha256.removeprefix("sha256:") != AUDIT_SHA256:
        raise RuntimeError("DEPENDENCY_AUDIT_SHA256_MISMATCH")
    missing = missing_owned_paths()
    if missing:
        raise RuntimeError("OWNED_SOURCES_MISSING:" + "|".join(str(item) for item in missing))

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
    scene.cycles.samples = max(int(args.samples), 24)
    scene.cycles.use_denoising = False
    scene.cycles.device = "CPU"
    configure_cycles_transparency(scene)
    apply_cycles_bounce_lift(scene)
    production = apply_botaniq_production_recovery(scene, mode="production", bark_kind=args.bark_kind)
    cover = apply_camera_ground_cover(scene)
    material = apply_locked_material_lighting(scene)
    hidden = hide_identified_rainbow_specks(scene, ("prod_flower",))
    detail = replace_failed_micro_dressing(scene)
    apply_locked_material_lighting(scene)
    locks = verify_production_camera(scene)
    scene.camera = camera
    return {
        "scene": scene,
        "placed": placed,
        "composition": composition,
        "production": production,
        "groundCover": cover,
        "materialLighting": material,
        "rainbowSpeckObjectsHidden": hidden,
        "groundDetail": detail,
        "productionCamera": locks,
    }


def render_still(scene, path: Path) -> dict:
    import bpy

    if path.exists():
        raise RuntimeError("PROOF_WOULD_OVERWRITE:" + path.name)
    scene.render.filepath = str(path)
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not path.is_file():
        raise RuntimeError("HERO_TREE_PROOF_MISSING:" + path.name)
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


def main() -> int:
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    prepared = _prepare(args)
    scene = prepared["scene"]
    apply_forest_canopy_lighting_repair(scene)
    apply_cinematic_lighting_recovery(scene)
    interior = apply_interior_sun_canopy_structure(scene)
    replacement = apply_hero_tree_replacement(scene)
    if replacement.get("executionStatus") == "BLOCKED":
        (out_dir / (Path(args.proof_name).stem + ".json")).write_text(
            json.dumps(replacement, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "schema": replacement["schema"],
            "executionStatus": "BLOCKED",
            "missingPaths": replacement.get("missingPaths"),
            "finalVideoRenderStarted": False,
            "paidCreateCount": 0,
        }, sort_keys=True))
        return 2
    scene.cycles.samples = max(int(args.samples), 24)
    scene.cycles.use_denoising = False
    out_path = out_dir / args.proof_name
    still = render_still(scene, out_path)
    receipt = {
        "schema": "TIVVLEJOY_FOREST_HERO_TREE_REPLACEMENT_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": scene.cycles.samples,
        "denoising": bool(scene.cycles.use_denoising),
        "materialLightingLocked": LOCKED_MATERIAL_LIGHTING,
        "interiorRecovery": {
            "skyCardPreserved": interior.get("skyCardPreserved"),
        },
        "replacement": replacement,
        "still": still,
        "productionCamera": prepared["productionCamera"],
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundDressingChanged": False,
        "animationRendered": False,
        "finalVideoRenderStarted": False,
        "finalVideoRenderReady": False,
    }
    (out_dir / (out_path.stem + ".json")).write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "schema": receipt["schema"],
        "path": still["path"],
        "sha256": still["sha256"],
        "seconds": still["seconds"],
        "samples": scene.cycles.samples,
        "heroQualityTreesPresent": replacement.get("heroQualityTreesPresent"),
        "planted": replacement.get("planted"),
        "cameraChanged": False,
        "paidCreateCount": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
