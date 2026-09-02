"""Build the StageGraph vendor-reference EcoKit scene; render only with explicit one-frame authorization."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
import sys
from collections import Counter
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
if str(SCRIPT_DIR.parent) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR.parent))

from asset_certify_blender_v1 import apply_image_bindings
from ecokit_cycles_alpha_v1 import (
    activate_all_ecokit_cycles_outputs,
    configure_cycles_transparency,
    count_dual_material_outputs,
    prepare_ecokit_cycles_alpha,
    remap_backslash_image_paths,
)
from forest_canopy_lighting_repair_v1 import apply_forest_canopy_lighting_repair
from vendor_reference_lookdev_v1 import (
    ACTIVE_LOOKDEV,
    CAMERA_LENS_MM,
    CAMERA_LOCATION,
    CAMERA_LOOK_AT,
    SEED,
    apply_atmosphere_material,
    apply_color_management,
    apply_cycles_bounce_lift,
    apply_ground_material,
    apply_key_and_fill_lights,
    apply_separation_lights,
    apply_world,
    assert_composition_locked,
    lookdev_receipt,
)

SOURCE_SHA256 = "8370295466ae2255d6e0c0b4b36bb7f8cddbef8e9cdf5e5b847016254073c79a"
AUDIT_SHA256 = "3c6804cbda061ed16a5d7027618089583ea7e99d2d0b96a6d2541bff89bbfdf0"
AUTH_SCOPE = "EXACTLY_ONE_VENDOR_REFERENCE_FRAME"
if SEED != 7301:
    raise RuntimeError("COMPOSITION_SEED_CHANGED")

TREE_COLLECTIONS = ["Tree_1", "Tree_2", "Tree_3", "Tree_4", "Tree_5"]
GRASS_COLLECTIONS = [f"Grass_{i}" for i in range(9)]
FERN_COLLECTIONS = [f"Fern_{i}" for i in range(1, 6)]
BUSH_COLLECTIONS = ["Bushes_1", "Bushes_2"]
LEAF_COLLECTIONS = ["Fallen Leaf_0", "Fallen Leaf_1"]
FLORAL_COLLECTIONS = ["Floral_1", "Floral_2"]


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--source-sha256", default=SOURCE_SHA256)
    parser.add_argument("--dependency-audit-sha256", default=AUDIT_SHA256)
    parser.add_argument("--owned-hdri", required=True)
    parser.add_argument("--image-bindings-json", default="[]")
    parser.add_argument("--authorization-json", default="{}")
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--out", default="")
    parser.add_argument("--receipt", required=True)
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_authorization(auth: dict):
    blockers = []
    if auth.get("actorClass") != "HUMAN":
        blockers.append("PAID_AUTHORIZATION_HUMAN_REQUIRED")
    if auth.get("scope") != AUTH_SCOPE:
        blockers.append("AUTHORIZATION_SCOPE_INVALID")
    if int(auth.get("createCount", 0) or 0) != 1:
        blockers.append("CREATE_COUNT_MUST_BE_ONE")
    retry_count = auth.get("retryCount")
    if retry_count is None or int(retry_count) != 0:
        blockers.append("RETRY_MUST_BE_ZERO")
    spend = float(auth.get("maxSpendUsd", 0) or 0)
    if not (0 < spend <= 15):
        blockers.append("BEAUTY_PROOF_SPEND_CEILING_INVALID")
    authorization_sha = str(auth.get("authorizationSha256", "")).removeprefix("sha256:")
    if not re.fullmatch(r"[a-f0-9]{64}", authorization_sha):
        blockers.append("AUTHORIZATION_SHA256_REQUIRED")
    if blockers:
        raise RuntimeError("BEAUTY_FRAME_NOT_AUTHORIZED:" + "|".join(blockers))
    return spend


def collection_meshes(names: list[str]):
    import bpy

    objects = []
    missing = []
    for name in names:
        collection = bpy.data.collections.get(name)
        if collection is None:
            missing.append(name)
            continue
        objects.extend(obj for obj in collection.objects if obj.type == "MESH" and not obj.hide_render)
    if missing:
        raise RuntimeError("VERIFIED_COLLECTION_MISSING:" + "|".join(missing))
    if not objects:
        raise RuntimeError("VERIFIED_COLLECTIONS_EMPTY")
    return objects


def make_mesh_object(name, vertices, faces, collection):
    import bpy

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def make_ground(collection):
    import bpy

    obj = make_mesh_object(
        "TJ_VendorGround",
        [(-16, -5, 0), (16, -5, 0), (16, 32, 0), (-16, 32, 0)],
        [(0, 1, 2, 3)],
        collection,
    )
    apply_ground_material(obj)
    return obj


def duplicate_at(source, collection, location, desired_size, rng, size_axis="Z"):
    from mathutils import Vector

    obj = source.copy()
    obj.data = source.data
    collection.objects.link(obj)
    obj.location = Vector(location)
    dimensions = source.dimensions.copy()
    axis_index = {"X": 0, "Y": 1, "Z": 2, "MAX": None}[size_axis]
    base = max(dimensions) if axis_index is None else dimensions[axis_index]
    base = max(float(base), 0.001)
    factor = float(desired_size) / base
    obj.scale = tuple(float(value) * factor for value in source.scale)
    obj.rotation_euler = source.rotation_euler.copy()
    obj.rotation_euler.z += rng.uniform(-math.pi, math.pi)
    return obj


def aim_at(obj, target):
    from mathutils import Vector

    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_world(scene, hdri_path: Path):
    apply_world(scene, hdri_path)


def add_lighting(collection):
    apply_key_and_fill_lights(collection)
    apply_separation_lights(collection)


def add_atmosphere(collection):
    vertices = [
        (-18, -8, 0), (18, -8, 0), (18, 36, 0), (-18, 36, 0),
        (-18, -8, 18), (18, -8, 18), (18, 36, 18), (-18, 36, 18),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    volume = make_mesh_object("TJ_Atmosphere", vertices, faces, collection)
    apply_atmosphere_material(volume)


def configure_camera(scene, collection):
    import bpy

    camera_data = bpy.data.cameras.new("TJ_VendorReference_Camera")
    camera_data.lens = CAMERA_LENS_MM
    camera_data.sensor_width = 36.0
    camera_data.dof.use_dof = True
    camera_data.dof.focus_distance = 20.0
    camera_data.dof.aperture_fstop = 4.0
    camera = bpy.data.objects.new("TJ_VendorReference_Camera", camera_data)
    collection.objects.link(camera)
    camera.location = CAMERA_LOCATION
    aim_at(camera, CAMERA_LOOK_AT)
    scene.camera = camera
    return camera


def configure_render(scene, require_cycles: bool = False):
    try:
        scene.render.engine = "CYCLES"
    except Exception:
        if require_cycles:
            raise RuntimeError("CYCLES_UNAVAILABLE")
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    if require_cycles and scene.render.engine != "CYCLES":
        raise RuntimeError("CYCLES_UNAVAILABLE")
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.render.engine == "CYCLES" and hasattr(scene, "cycles"):
        scene.cycles.samples = 128
        scene.cycles.use_denoising = True
        configure_cycles_transparency(scene)
        apply_cycles_bounce_lift(scene)
    apply_color_management(scene)


def enable_cycles_gpu(scene) -> str:
    import bpy

    if scene.render.engine != "CYCLES" or not hasattr(scene, "cycles"):
        raise RuntimeError("CYCLES_UNAVAILABLE")
    addon = bpy.context.preferences.addons.get("cycles")
    if addon is None:
        raise RuntimeError("CYCLES_GPU_DEVICE_MISSING")
    prefs = addon.preferences
    scene.cycles.device = "GPU"
    for compute in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = compute
            if hasattr(prefs, "get_devices"):
                prefs.get_devices()
        except Exception:
            continue
        enabled = 0
        for device in getattr(prefs, "devices", []) or []:
            device_type = str(getattr(device, "type", ""))
            if device_type == "CPU":
                device.use = False
            elif device_type in {compute, "OPTIX", "CUDA"}:
                device.use = True
                enabled += 1
        if enabled:
            return compute
    raise RuntimeError("CYCLES_GPU_DEVICE_MISSING")


def png_dimensions(path: Path) -> list[int]:
    header = path.read_bytes()[:24]
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("OUTPUT_NOT_PNG")
    import struct

    width, height = struct.unpack(">II", header[16:24])
    return [int(width), int(height)]


def build_scene(args):
    import bpy

    rng = random.Random(SEED)
    scene = bpy.data.scenes.new("TJ_VENDOR_REFERENCE_GOLDEN_FOREST")
    root = bpy.data.collections.new("TJ_VENDOR_REFERENCE_ROOT")
    scene.collection.children.link(root)

    hdri = Path(args.owned_hdri)
    if not hdri.is_file():
        raise RuntimeError("OWNED_HDRI_MISSING")
    make_world(scene, hdri)
    make_ground(root)
    add_atmosphere(root)
    add_lighting(root)
    camera = configure_camera(scene, root)
    configure_render(scene)

    trees = collection_meshes(TREE_COLLECTIONS)
    grasses = collection_meshes(GRASS_COLLECTIONS)
    ferns = collection_meshes(FERN_COLLECTIONS)
    bushes = collection_meshes(BUSH_COLLECTIONS)
    leaves = collection_meshes(LEAF_COLLECTIONS)
    florals = collection_meshes(FLORAL_COLLECTIONS)

    placed = Counter()

    tree_positions = [
        (-7.5, 1.5, 0, 10.5), (7.2, 2.0, 0, 11.0),
        (-5.4, 7.0, 0, 8.0), (5.7, 7.8, 0, 8.6), (-8.5, 10.0, 0, 9.5), (8.8, 11.0, 0, 9.2),
        (-4.3, 15.0, 0, 8.7), (4.7, 16.2, 0, 8.4), (-9.5, 18.0, 0, 10.0), (9.8, 19.0, 0, 9.8),
        (-6.0, 24.0, 0, 11.5), (-1.8, 25.5, 0, 10.7), (2.8, 25.0, 0, 10.9), (7.0, 24.4, 0, 11.3),
    ]
    for x, y, z, height in tree_positions:
        duplicate_at(rng.choice(trees), root, (x, y, z), height * rng.uniform(0.94, 1.08), rng)
        placed["trees"] += 1

    def scatter(pool, label, count, y_min, y_max, size_min, size_max, exclusion=2.3):
        made = 0
        attempts = 0
        while made < count and attempts < count * 15:
            attempts += 1
            x = rng.uniform(-10.5, 10.5)
            y = rng.uniform(y_min, y_max)
            if 4.0 < y < 14.0 and abs(x) < exclusion and rng.random() < 0.86:
                continue
            duplicate_at(rng.choice(pool), root, (x, y, 0.015), rng.uniform(size_min, size_max), rng)
            made += 1
        if made != count:
            raise RuntimeError(f"SCATTER_COUNT_SHORT:{label}:{made}/{count}")
        placed[label] += made

    scatter(grasses, "grass", 70, -0.5, 23.0, 0.35, 1.05, exclusion=2.0)
    scatter(ferns, "ferns", 28, 0.5, 21.0, 0.55, 1.25, exclusion=2.6)
    scatter(bushes, "bushes", 24, 1.0, 22.0, 0.75, 1.75, exclusion=3.0)
    scatter(florals, "floral", 16, 2.0, 19.0, 0.35, 0.9, exclusion=2.4)
    scatter(leaves, "fallenLeaves", 65, -1.0, 20.0, 0.18, 0.45, exclusion=1.4)

    composition = assert_composition_locked(camera, dict(placed))
    return scene, camera, dict(placed), composition


def main():
    import bpy

    args = parse_args()
    if args.source_sha256.removeprefix("sha256:") != SOURCE_SHA256:
        raise RuntimeError("SOURCE_SHA256_MISMATCH")
    if args.dependency_audit_sha256.removeprefix("sha256:") != AUDIT_SHA256:
        raise RuntimeError("DEPENDENCY_AUDIT_SHA256_MISMATCH")

    bindings = apply_image_bindings(json.loads(args.image_bindings_json))
    path_remap = remap_backslash_image_paths()
    cycles_outputs = activate_all_ecokit_cycles_outputs()
    scene, camera, placed, composition = build_scene(args)
    root = scene.collection.children.get("TJ_VENDOR_REFERENCE_ROOT")
    placed_objects = list(root.objects) if root is not None else []
    alpha_repair = prepare_ecokit_cycles_alpha(placed_objects)
    transparency = configure_cycles_transparency(scene) if scene.render.engine == "CYCLES" else {}
    bounce_lift = apply_cycles_bounce_lift(scene) if scene.render.engine == "CYCLES" else {}
    dual_after = count_dual_material_outputs()
    lookdev = lookdev_receipt(ACTIVE_LOOKDEV)
    canopy_repair = apply_forest_canopy_lighting_repair(scene)

    receipt = {
        "schema": "TIVVLEJOY_STAGEGRAPH_VENDOR_REFERENCE_PREFLIGHT_V1",
        "status": "PASS",
        "sourceId": args.source_id,
        "sourceSha256": SOURCE_SHA256,
        "dependencyAuditSha256": AUDIT_SHA256,
        "prepareOnly": bool(args.prepare_only),
        "rendered": False,
        "videoEncoded": False,
        "scene": scene.name,
        "renderEngine": scene.render.engine,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "camera": {"name": camera.name, "lensMm": camera.data.lens, "location": [round(v, 4) for v in camera.location]},
        "placed": placed,
        "ownedHdriBasename": Path(args.owned_hdri).name,
        "dependencyBindings": bindings,
        "backslashImagePathsRemapped": len(path_remap),
        "ecokitCyclesAlpha": {
            "materialsRepaired": alpha_repair.get("materialsRepaired"),
            "alphaLinksAdded": alpha_repair.get("alphaLinksAdded"),
            "blendHashed": alpha_repair.get("blendHashed"),
            "cyclesOutputsActivated": int(cycles_outputs),
            "warnings": alpha_repair.get("warnings"),
            "transparentMaxBounces": transparency.get("transparentMaxBounces"),
            "dualMaterialOutputsAfterRepair": dual_after,
        },
        "lookdev": {
            **lookdev,
            "diffuseBounces": bounce_lift.get("diffuseBounces", lookdev.get("diffuseBounces")),
            "composition": composition,
        },
        "forestCanopyLightingRepair": {
            "feature": "forest_canopy_lighting_repair_v1",
            "applied": True,
            "globalExposureDelta": canopy_repair.get("globalExposureDelta"),
            "materialsChanged": (canopy_repair.get("materials") or {}).get("materialsChanged"),
            "verify": canopy_repair.get("verify"),
            "vendorBlendSaved": False,
        },
        "authorizationRequiredForRender": True,
        "paidCreateCount": 0,
        "visualApproval": False,
    }

    if not args.prepare_only:
        max_spend = validate_authorization(json.loads(args.authorization_json))
        if not args.out:
            raise RuntimeError("OUTPUT_PATH_REQUIRED")
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(out)
        configure_render(scene, require_cycles=True)
        gpu_compute = enable_cycles_gpu(scene)
        bpy.context.window.scene = scene
        bpy.ops.render.render(write_still=True)
        if not out.is_file():
            raise RuntimeError("VENDOR_REFERENCE_FRAME_MISSING")
        dimensions = png_dimensions(out)
        if dimensions != [1280, 720]:
            raise RuntimeError("VENDOR_REFERENCE_DIMENSION_MISMATCH")
        receipt.update({
            "rendered": True,
            "renderEngine": scene.render.engine,
            "artifactSha256": sha256_file(out),
            "authorizationScope": AUTH_SCOPE,
            "maxSpendUsd": max_spend,
            "paidCreateCount": 1,
            "gpuComputeDevice": gpu_compute,
            "imageDimensions": dimensions,
            "visualApproval": False,
            "humanVisualDecisionRequired": True,
        })

    receipt_path = Path(args.receipt)
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"schema": receipt["schema"], "status": receipt["status"], "prepareOnly": receipt["prepareOnly"], "placed": receipt["placed"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
