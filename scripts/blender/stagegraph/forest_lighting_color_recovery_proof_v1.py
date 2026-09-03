"""Locked-camera lighting/color-management diagnostics and production proofs."""

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
from forest_lighting_color_recovery_v1 import (
    DIAGNOSTIC_VARIANTS,
    apply_lighting_variant,
    baseline_values,
    snapshot_color_management,
    suppress_ecokit_visual_noise,
)
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
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--bark-kind", default="tilia")
    parser.add_argument("--mode", choices=("diagnose", "production"), default="diagnose")
    parser.add_argument("--variant", default="")
    parser.add_argument("--proof-name", default="FOREST_LIGHTING_COLOR_RECOVERY_CAMERA_PROOF_V1.png")
    parser.add_argument("--exposure", type=float, default=None)
    parser.add_argument("--gamma", type=float, default=None)
    parser.add_argument("--hdri-strength", type=float, default=None)
    parser.add_argument("--fill-energy", type=float, default=None)
    parser.add_argument("--bounce-energy", type=float, default=None)
    parser.add_argument("--sun-energy", type=float, default=None)
    parser.add_argument("--fill-color", default="")
    parser.add_argument("--bounce-color", default="")
    parser.add_argument("--view-transform", default="")
    parser.add_argument("--neutral-world", action="store_true")
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _rgb(text: str, fallback):
    if not text:
        return fallback
    parts = [float(item) for item in text.split(",")]
    if len(parts) != 3:
        raise RuntimeError("RGB_TRIPLET_INVALID")
    return tuple(parts)


def render_still(scene, path: Path) -> dict:
    import bpy

    if path.exists():
        raise RuntimeError("PROOF_WOULD_OVERWRITE:" + path.name)
    scene.render.filepath = str(path)
    started = time.time()
    bpy.ops.render.render(write_still=True)
    elapsed = round(time.time() - started, 2)
    if not path.is_file():
        raise RuntimeError("LIGHTING_PROOF_MISSING:" + path.name)
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "dimensions": png_dimensions(path),
        "seconds": elapsed,
    }


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
    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = False
    scene.cycles.samples = max(int(args.samples), 8)
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
    configure_cycles_transparency(scene)
    apply_cycles_bounce_lift(scene)
    production = apply_botaniq_production_recovery(scene, mode="production", bark_kind=args.bark_kind)
    cover = apply_camera_ground_cover(scene)
    noise = suppress_ecokit_visual_noise(scene)
    locks = verify_production_camera(scene)
    scene.camera = camera
    return {
        "scene": scene,
        "camera": camera,
        "placed": placed,
        "composition": composition,
        "production": production,
        "groundCover": cover,
        "ecoKitNoiseRemoved": noise,
        "productionCamera": locks,
        "colorManagementBefore": snapshot_color_management(scene),
        "lightingBefore": baseline_values(),
    }


def production_variant(args) -> dict:
    variant = dict(DIAGNOSTIC_VARIANTS["baseline"])
    variant["class"] = "production"
    if args.exposure is not None:
        variant["exposure"] = args.exposure
    if args.gamma is not None:
        variant["gamma"] = args.gamma
    if args.hdri_strength is not None:
        variant["hdriStrength"] = args.hdri_strength
    if args.fill_energy is not None:
        variant["fillEnergy"] = args.fill_energy
    if args.bounce_energy is not None:
        variant["bounceEnergy"] = args.bounce_energy
    if args.sun_energy is not None:
        variant["sunEnergy"] = args.sun_energy
    if args.view_transform:
        variant["viewTransform"] = args.view_transform
    if args.fill_color:
        variant["fillColor"] = _rgb(args.fill_color, variant["fillColor"])
    if args.bounce_color:
        variant["bounceColor"] = _rgb(args.bounce_color, variant["bounceColor"])
    if args.neutral_world:
        variant["neutralWorld"] = True
    return variant


def main():
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    prepared = _prepare(args)
    scene = prepared["scene"]

    if args.mode == "diagnose":
        stills = {}
        applies = {}
        names = [args.variant] if args.variant else list(DIAGNOSTIC_VARIANTS)
        for name in names:
            variant = DIAGNOSTIC_VARIANTS[name]
            applies[name] = apply_lighting_variant(scene, variant)
            stills[name] = render_still(scene, out_dir / variant["proof"])
        receipt = {
            "schema": "TIVVLEJOY_FOREST_LIGHTING_COLOR_RECOVERY_DIAG_V1",
            "result": "RENDERED",
            "mode": "diagnose",
            "paidCreateCount": 0,
            "paidSpendUsd": 0,
            "samples": scene.cycles.samples,
            "device": "CPU",
            "baseline": prepared["lightingBefore"],
            "colorManagementBefore": prepared["colorManagementBefore"],
            "ecoKitNoiseRemoved": prepared["ecoKitNoiseRemoved"],
            "productionCamera": prepared["productionCamera"],
            "groundCover": prepared["groundCover"],
            "applies": applies,
            "stills": stills,
            "cameraChanged": False,
            "terrainChanged": False,
            "waterChanged": False,
            "compositionChanged": False,
        }
        (out_dir / "FOREST_LIGHTING_COLOR_RECOVERY_DIAG_V1.json").write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(json.dumps({
            "schema": receipt["schema"],
            "stills": {key: item["path"] for key, item in stills.items()},
            "ecoKitNoiseRemoved": [item["name"] for item in prepared["ecoKitNoiseRemoved"]],
            "paidCreateCount": 0,
        }, sort_keys=True))
        return 0

    variant = production_variant(args)
    applied = apply_lighting_variant(scene, variant)
    out_path = out_dir / args.proof_name
    still = render_still(scene, out_path)
    receipt = {
        "schema": "TIVVLEJOY_FOREST_LIGHTING_COLOR_RECOVERY_PROOF_V1",
        "result": "RENDERED",
        "mode": "production",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": scene.cycles.samples,
        "device": "CPU",
        "baseline": prepared["lightingBefore"],
        "colorManagementBefore": prepared["colorManagementBefore"],
        "colorManagementAfter": snapshot_color_management(scene),
        "variant": variant,
        "applied": applied,
        "ecoKitNoiseRemoved": prepared["ecoKitNoiseRemoved"],
        "productionCamera": prepared["productionCamera"],
        "groundCover": prepared["groundCover"],
        "still": still,
        "visualApproval": False,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundCoverArchitectureChanged": False,
        "vegetationArchitectureChanged": False,
        "hdriChanged": False,
        "cinematicLightingStarted": False,
    }
    (out_dir / (out_path.stem + ".json")).write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "schema": receipt["schema"],
        "path": still["path"],
        "sha256": still["sha256"],
        "dimensions": still["dimensions"],
        "variantClass": variant["class"],
        "paidCreateCount": 0,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
