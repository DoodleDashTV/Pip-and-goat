"""Isolated Botaniq production lookdev stills, then optional camera proof."""

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
from forest_botaniq_production_recovery_v1 import (
    apply_botaniq_production_recovery,
    missing_owned_paths,
)
from forest_lookdev_isolation_v1 import (
    CAMERA_NAME,
    COLLECTION_NAME,
    apply_forest_lookdev_isolation,
    install_studio_rig,
    isolate_for_lookdev,
    restore_production,
    verify_production_camera,
)
from vendor_reference_lookdev_v1 import apply_cycles_bounce_lift
from vendor_reference_render_v1 import AUDIT_SHA256, SOURCE_SHA256, build_scene, png_dimensions

SHOTS = (
    ("LOOKDEV_BARK_PRODUCTION_V2", ("TJ_ProdLookdevBark",), "trunk"),
    (
        "LOOKDEV_GROUND_PRODUCTION_V2",
        ("TJ_LookdevGroundPatch", "TJ_LookdevLitterPatch", "TJ_LookdevMossMound", "TJ_LookdevStone"),
        "ground",
    ),
    ("LOOKDEV_BUSH_PRODUCTION_V2", ("TJ_LookdevBush",), "bush"),
    ("LOOKDEV_LEAF_PRODUCTION_V2", ("TJ_LookdevLeaf",), "leaf"),
    ("LOOKDEV_GRASS_FERN_PRODUCTION_V2", ("TJ_LookdevGrass", "TJ_LookdevFlower"), "grass"),
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
    parser.add_argument("--bark-kind", default="tilia")
    parser.add_argument("--camera-proof", action="store_true")
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


def _shot_objects(scene, prefixes):
    selected = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("TJ_HiddenEcoKit"):
            continue
        if any(obj.name.startswith(prefix) for prefix in prefixes):
            obj.hide_viewport = False
            obj.hide_render = False
            selected.append(obj)
    return selected


def _exclusive_visibility(scene, keep) -> list[str]:
    keep_set = set(keep)
    visible = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        show = obj in keep_set
        obj.hide_render = not show
        obj.hide_viewport = not show
        try:
            obj.hide_set(not show)
        except Exception:
            pass
        if show:
            visible.append(obj.name)
    return visible


def _shot_aim(objects, kind: str):
    from mathutils import Vector

    subject = objects[0]
    if kind == "trunk":
        height = max(float(subject.dimensions.z), 2.15)
        loc = Vector(subject.location)
        if loc.length < 1.0:
            loc = Vector((90.0, 0.0, 0.0))
        return loc + Vector((0.0, 0.0, height * 0.48))
    if kind == "leaf":
        return Vector(subject.location) + Vector((0.0, 0.0, 0.45))
    if kind == "ground":
        patch = next((obj for obj in objects if obj.name.startswith("TJ_LookdevGroundPatch")), objects[0])
        return Vector(patch.location) + Vector((0.0, 0.0, 0.05))
    center = Vector((0.0, 0.0, 0.0))
    for obj in objects:
        center += obj.location
    return center / max(len(objects), 1)


def _frame_shot(camera, objects, kind: str) -> None:
    from mathutils import Vector

    target = _shot_aim(objects, kind)
    if kind == "trunk":
        subject = objects[0]
        height = max(float(subject.dimensions.z), 1.6)
        camera.location = (target.x + 1.05, target.y - max(2.55, height * 1.25), target.z + 0.22)
        camera.data.lens = 70.0
    elif kind == "ground":
        camera.location = (target.x + 0.35, target.y - 3.05, target.z + 2.35)
        camera.data.lens = 50.0
    elif kind == "bush":
        camera.location = (target.x + 0.55, target.y - 2.65, target.z + 1.15)
        camera.data.lens = 70.0
    elif kind == "leaf":
        camera.location = (target.x + 0.22, target.y - 2.25, target.z + 0.28)
        camera.data.lens = 70.0
    else:
        camera.location = (target.x + 0.25, target.y - 2.05, target.z + 0.55)
        camera.data.lens = 70.0
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.dof.use_dof = False


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
            "schema": "TIVVLEJOY_BOTANIQ_FOREST_PRODUCTION_RECOVERY_PROOF_V1",
            "result": "BLOCKED",
            "missing": missing,
            "paidCreateCount": 0,
            "paidSpendUsd": 0,
        }
        (out_dir / "FOREST_BOTANIQ_PRODUCTION_RECOVERY_PROOF_V1.json").write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        print(json.dumps(receipt, sort_keys=True))
        return 2

    apply_image_bindings(json.loads(args.image_bindings_json))
    remap_backslash_image_paths()
    activate_all_ecokit_cycles_outputs()
    scene, camera, placed, composition = build_scene(args)
    configure_lookdev_render(scene, args.samples)
    bpy.context.window.scene = scene
    production = apply_botaniq_production_recovery(scene, mode="production", bark_kind=args.bark_kind)
    lookdev = apply_forest_lookdev_isolation(scene)
    recovery = apply_botaniq_production_recovery(scene, mode="lookdev", bark_kind=args.bark_kind)
    locks = verify_production_camera(scene)

    collection = bpy.data.collections[COLLECTION_NAME]
    lookdev_camera = scene.objects.get(CAMERA_NAME)
    isolation = isolate_for_lookdev(scene)

    stills = {}
    for name, prefixes, kind in SHOTS:
        visible = _shot_objects(scene, prefixes)
        if not visible:
            stills[name] = {"missing": True, "prefixes": list(prefixes)}
            continue
        if kind == "trunk" and len(visible[0].data.vertices) > 200:
            stills[name] = {
                "missing": True,
                "reason": "BARK_SUBJECT_NOT_CYLINDER",
                "object": visible[0].name,
                "vertices": len(visible[0].data.vertices),
            }
            continue
        shown = _exclusive_visibility(scene, visible)
        scene.camera = lookdev_camera
        bpy.context.view_layer.update()
        _frame_shot(lookdev_camera, visible, kind)
        install_studio_rig(collection, visible[0], aim=_shot_aim(visible, kind))
        bpy.context.view_layer.update()
        stills[name] = render_path(scene, out_dir / f"{name}.png")
        stills[name]["subjects"] = shown
        stills[name]["subjectVerts"] = [len(obj.data.vertices) for obj in visible]

    restore_production(scene, isolation)
    for obj in collection.objects:
        if obj.type == "MESH" and obj.get("tj_recovery"):
            obj.hide_render = True
    locks_after = verify_production_camera(scene)
    if scene.camera is None or scene.camera.name != camera.name:
        scene.camera = camera

    camera_proof = None
    if args.camera_proof:
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 720
        scene.cycles.samples = max(int(args.samples), 28)
        camera_proof = render_path(scene, out_dir / "FOREST_MATERIAL_RECOVERY_CAMERA_PROOF_V1.png")

    receipt = {
        "schema": "TIVVLEJOY_BOTANIQ_FOREST_PRODUCTION_RECOVERY_PROOF_V1",
        "result": "RENDERED",
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
        "samples": args.samples,
        "device": "CPU",
        "productionCamera": locks_after,
        "placed": placed,
        "composition": composition,
        "production": production,
        "lookdevIsolation": lookdev,
        "lookdevRecovery": recovery,
        "stills": stills,
        "cameraProof": camera_proof,
        "visualApproval": False,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "lightingChanged": False,
        "compositionChanged": False,
    }
    (out_dir / "FOREST_BOTANIQ_PRODUCTION_RECOVERY_PROOF_V1.json").write_text(
        json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "schema": receipt["schema"],
        "stills": {key: item.get("path") for key, item in stills.items()},
        "cameraProof": None if camera_proof is None else camera_proof.get("path"),
        "cameraChanged": False,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
