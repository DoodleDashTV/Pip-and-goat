"""Render isolated studio lookdev stills. Production camera stays locked."""

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
from forest_lookdev_isolation_v1 import (
    CAMERA_NAME,
    COLLECTION_NAME,
    apply_forest_lookdev_isolation,
    frame_subject,
    install_studio_rig,
    isolate_for_lookdev,
    restore_production,
    verify_production_camera,
)
from vendor_reference_lookdev_v1 import apply_cycles_bounce_lift
from vendor_reference_render_v1 import AUDIT_SHA256, SOURCE_SHA256, build_scene, png_dimensions

SHOTS = (
    ("LOOKDEV_BARK_V1", ("TJ_LookdevTrunk",), "trunk"),
    ("LOOKDEV_GROUND_V1", ("TJ_LookdevGroundPatch", "TJ_LookdevFallen", "TJ_LookdevRock", "TJ_LookdevMoss", "TJ_LookdevGroundGrass"), "ground"),
    ("LOOKDEV_BUSH_V1", ("TJ_LookdevBush",), "bush"),
    ("LOOKDEV_LEAF_V1", ("TJ_LookdevLeaf",), "leaf"),
    ("LOOKDEV_GRASS_FLOWER_V1", ("TJ_LookdevGrass", "TJ_LookdevFlower"), "grass"),
)


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
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def configure_lookdev_render(scene, samples: int) -> None:
    scene.render.engine = "CYCLES"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.use_border = False
    scene.render.use_crop_to_border = False
    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = False
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
        raise RuntimeError("LOOKDEV_FRAME_MISSING:" + path.name)
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "dimensions": png_dimensions(path),
        "seconds": elapsed,
    }


def _shot_objects(collection, prefixes):
    selected = []
    for obj in collection.objects:
        if obj.type != "MESH":
            continue
        if any(obj.name.startswith(prefix) for prefix in prefixes):
            selected.append(obj)
    return selected


def _shot_aim(objects, kind: str):
    from mathutils import Vector

    subject = objects[0]
    if kind == "trunk":
        base = subject.location
        return Vector((base.x, base.y, base.z + 1.45))
    center = Vector((0.0, 0.0, 0.0))
    for obj in objects:
        center += obj.location
    return center / max(len(objects), 1)


def _frame_shot(camera, objects, kind: str) -> None:
    from mathutils import Vector

    subject = objects[0]
    target = _shot_aim(objects, kind)
    if kind == "trunk":
        camera.location = (target.x + 1.35, target.y - 2.85, target.z + 0.20)
        camera.data.lens = 85.0
    elif kind == "ground":
        camera.location = (target.x + 0.35, target.y - 3.05, target.z + 2.45)
        camera.data.lens = 50.0
    elif kind == "bush":
        camera.location = (target.x + 0.45, target.y - 2.55, target.z + 1.05)
        camera.data.lens = 70.0
    elif kind == "leaf":
        camera.location = (target.x + 0.35, target.y - 2.05, target.z + 0.85)
        camera.data.lens = 80.0
    else:
        camera.location = (target.x + 0.25, target.y - 2.15, target.z + 0.95)
        camera.data.lens = 70.0
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


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
    configure_lookdev_render(scene, args.samples)
    bpy.context.window.scene = scene
    apply_forest_canopy_lighting_repair(scene)
    cinematic = apply_cinematic_forest_lighting_repair(scene)
    lookdev = apply_forest_lookdev_isolation(scene)
    locks = verify_production_camera(scene)

    collection = bpy.data.collections[COLLECTION_NAME]
    lookdev_camera = scene.objects.get(CAMERA_NAME)
    isolation = isolate_for_lookdev(scene)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stills = {}
    for name, prefixes, kind in SHOTS:
        visible = _shot_objects(collection, prefixes)
        if not visible:
            stills[name] = {"missing": True, "prefixes": list(prefixes)}
            continue
        for obj in collection.objects:
            if obj.type != "MESH":
                continue
            obj.hide_render = obj not in visible
        _frame_shot(lookdev_camera, visible, kind)
        install_studio_rig(collection, visible[0], aim=_shot_aim(visible, kind))
        stills[name] = render_path(scene, out_dir / f"{name}.png")

    restore_production(scene, isolation)
    locks_after = verify_production_camera(scene)
    if scene.camera is None or scene.camera.name != camera.name:
        scene.camera = camera

    receipt = {
        "schema": "TIVVLEJOY_FOREST_LOOKDEV_ISOLATION_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": args.samples,
        "device": "CPU",
        "productionCamera": locks_after,
        "placed": placed,
        "composition": composition,
        "lookdev": lookdev,
        "cinematicRepairApplied": True,
        "stills": stills,
        "visualApproval": False,
        "cameraChanged": False,
        "productionGeometryChanged": False,
    }
    (out_dir / "FOREST_LOOKDEV_ISOLATION_PROOF_V1.json").write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "schema": receipt["schema"],
        "stills": {key: item.get("path") for key, item in stills.items()},
        "cameraChanged": False,
        "barkTexture": lookdev.get("barkTexture"),
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
