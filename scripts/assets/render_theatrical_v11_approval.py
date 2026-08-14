"""Visual-approval package for proposed theatrical v1.1.

Clean 1080x1920 heroes have no in-frame bars.
Labeled comparison sheets keep captions in a header strip above the frames.
"""

from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from png_io import read_stored_srgb, write_stored_srgb  # noqa: E402
from theatrical_v11_common import PROPOSED_V11, assert_not_production_library  # noqa: E402

LIB = REPO_ROOT / "production-library"
CANON = {
    "pip": LIB / "characters/pip_production.blend",
    "goat": LIB / "characters/goat_production.blend",
    "meadow": LIB / "environments/meadow_production.blend",
    "map": LIB / "props/adventure_map.blend",
}
PROP = {
    "pip": PROPOSED_V11 / "pip_theatrical_v1_1.blend",
    "goat": PROPOSED_V11 / "goat_theatrical_v1_1.blend",
    "meadow": PROPOSED_V11 / "meadow_theatrical_v1_1.blend",
    "creek": PROPOSED_V11 / "creek_theatrical_v1_1.blend",
    "map": PROPOSED_V11 / "map_theatrical_v1_1.blend",
    "vfx": PROPOSED_V11 / "lighting_vfx_theatrical_v1_1.blend",
}
OUT = REPO_ROOT / "artifacts/theatrical-v1.1/previews"
CLEAN = OUT / "clean"
LABELED = OUT / "labeled"
RES_HERO = (1080, 1920)
RES_TURN = (540, 960)
SAMPLES_HERO = 48
SAMPLES_TURN = 24
HEADER = 72


def eevee_id(scene) -> str:
    try:
        available = {i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items}
    except Exception:
        available = set()
    return "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available else "BLENDER_EEVEE"


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def color():
    scene = bpy.context.scene
    try:
        scene.view_settings.view_transform = "Khronos PBR Neutral"
        scene.view_settings.look = "None"
    except (TypeError, ValueError):
        pass


def world(rgb=(0.62, 0.74, 0.88), strength=0.85):
    w = bpy.data.worlds.new("VAWorld")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (*rgb, 1.0)
        bg.inputs[1].default_value = strength


def lights(energy_sun=3.6, catch=32):
    bpy.ops.object.light_add(type="SUN", location=(2.6, -2.2, 5.2))
    bpy.context.object.data.energy = energy_sun
    bpy.ops.object.light_add(type="AREA", location=(-1.1, -1.6, 1.4))
    bpy.context.object.data.energy = 60
    bpy.context.object.data.size = 2.1
    bpy.ops.object.light_add(type="AREA", location=(0.22, -0.55, 0.58))
    eye = bpy.context.object
    eye.name = "Light_EyeCatch"
    eye.data.energy = catch
    eye.data.size = 0.13
    eye.data.use_shadow = False


def look_at(cam, target):
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def camera(mode, subject="pip"):
    focus = (0.0, 0.0, 0.30) if subject == "pip" else (0.0, -0.05, 0.52)
    dist = 1.15 if subject == "pip" else 1.85
    elev = 0.34 if subject == "pip" else 0.58
    locs = {
        "front": (0.0, -dist, elev),
        "left": (-dist, 0.0, elev),
        "right": (dist, 0.0, elev),
        "rear": (0.0, dist, elev),
        "full_body": (0.42, -dist * 1.05, elev * 0.92),
        "closeup": (0.05, -0.50 if subject == "pip" else -0.85, 0.43 if subject == "pip" else 0.82),
        "three_quarter": (dist * 0.55, -dist * 0.88, elev),
    }
    if mode == "closeup":
        focus = (0.0, -0.05, 0.43) if subject == "pip" else (0.0, -0.28, 0.82)
    data = bpy.data.cameras.new("VACam")
    cam = bpy.data.objects.new("VACam", data)
    bpy.context.collection.objects.link(cam)
    cam.location = locs.get(mode, locs["full_body"])
    look_at(cam, focus)
    cam.data.lens = 50 if mode == "closeup" else 38
    bpy.context.scene.camera = cam
    return cam


def append(path: Path):
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
        dst.actions = list(src.actions)
    imported = []
    for obj in dst.objects:
        if obj is None:
            continue
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)
        imported.append(obj)
    return imported


def find_arm(imported, prefix):
    return next((o for o in imported if o.type == "ARMATURE" and prefix in o.name), None)


def apply_action(arm, name):
    if not arm:
        return False
    action = next((a for a in bpy.data.actions if a.name == name or a.name.endswith(name)), None)
    if not action:
        return False
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = action
    bpy.context.scene.frame_set(4)
    return True


def set_expr(imported, smile=0.0, brow=0.0):
    for obj in imported:
        if obj.type != "MESH" or not obj.data.shape_keys:
            continue
        keys = obj.data.shape_keys.key_blocks
        if "mouth_smile" in keys:
            keys["mouth_smile"].value = smile
        if "expr_happy" in keys:
            keys["expr_happy"].value = smile
        if "brow_up" in keys:
            keys["brow_up"].value = brow


def render(path: Path, res, samples):
    scene = bpy.context.scene
    color()
    scene.render.engine = eevee_id(scene)
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = samples
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def still(folder: Path, name, setup, res=RES_HERO, samples=SAMPLES_HERO):
    clear()
    setup()
    path = folder / f"{name}.png"
    render(path, res, samples)
    return {"file": str(path.relative_to(REPO_ROOT)), "name": name, "res": f"{res[0]}x{res[1]}", "samples": samples, "labeled": False}


def setup_character(who, source, view, action=None, smile=0.0):
    def _():
        world()
        lights()
        imported = append(source)
        arm = find_arm(imported, "Pip" if who == "pip" else "Goat")
        if action:
            apply_action(arm, action)
        set_expr(imported, smile=smile, brow=0.15 if smile else 0.0)
        camera(view, subject=who)

    return _


def setup_env(env_path, pip_path, goat_path, cam_loc, focus, pip_loc, goat_loc, pip_action, goat_action, world_rgb=(0.48, 0.66, 0.86), vfx=False, map_path=None, map_loc=None, lens=34):
    def _():
        world(world_rgb, 0.72)
        lights(energy_sun=3.2, catch=26)
        append(env_path)
        if vfx:
            append(PROP["vfx"])
        if map_path:
            maps = append(map_path)
            for obj in maps:
                obj.location = map_loc or (0.05, 0.05, 0.42)
                obj.rotation_euler = (0.55, 0.0, 0.15)
                obj.scale = (0.85, 0.85, 0.85)
        pip = append(pip_path)
        goat = append(goat_path)
        pip_arm = find_arm(pip, "Pip")
        goat_arm = find_arm(goat, "Goat")
        if pip_arm:
            pip_arm.location = pip_loc
        if goat_arm:
            goat_arm.location = goat_loc
        apply_action(pip_arm, pip_action)
        apply_action(goat_arm, goat_action)
        set_expr(pip, smile=0.55, brow=0.15)
        set_expr(goat, smile=0.35)
        data = bpy.data.cameras.new("VACam")
        cam = bpy.data.objects.new("VACam", data)
        bpy.context.collection.objects.link(cam)
        cam.location = cam_loc
        look_at(cam, focus)
        cam.data.lens = lens
        bpy.context.scene.camera = cam

    return _


def setup_prop(path, loc, focus, lens=42):
    def _():
        world((0.52, 0.53, 0.55), 0.55)
        lights()
        append(path)
        data = bpy.data.cameras.new("VACam")
        cam = bpy.data.objects.new("VACam", data)
        bpy.context.collection.objects.link(cam)
        cam.location = loc
        look_at(cam, focus)
        cam.data.lens = lens
        bpy.context.scene.camera = cam

    return _


def header_sheet(left: Path, right: Path, dest: Path, left_label: str, right_label: str):
    import numpy as np

    a = read_stored_srgb(left).astype("uint8")
    b = read_stored_srgb(right).astype("uint8")
    h = min(a.shape[0], b.shape[0])
    w = min(a.shape[1], b.shape[1])
    a = a[:h, :w]
    b = b[:h, :w]
    gap = 16
    canvas = np.full((h + HEADER, w * 2 + gap, 3), 24, dtype="uint8")
    canvas[HEADER:, :w] = a
    canvas[HEADER:, w + gap :] = b
    canvas[:HEADER, :w] = (20, 150, 130)
    canvas[:HEADER, w + gap :] = (210, 150, 30)
    dest.parent.mkdir(parents=True, exist_ok=True)
    write_stored_srgb(dest, canvas)
    return dest


def write_zip():
    archive = OUT / "theatrical-v1.1-previews.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for folder in (CLEAN, LABELED):
            for path in sorted(folder.glob("*.png")):
                zf.write(path, arcname=f"{folder.name}/{path.name}")
        if (OUT / "manifest.json").exists():
            zf.write(OUT / "manifest.json", arcname="manifest.json")
    return archive


def main() -> int:
    assert_not_production_library(OUT)
    CLEAN.mkdir(parents=True, exist_ok=True)
    LABELED.mkdir(parents=True, exist_ok=True)
    entries = []

    for view in ("front", "left", "right", "rear"):
        entries.append(still(CLEAN, f"existing_pip_{view}", setup_character("pip", CANON["pip"], view), RES_TURN, SAMPLES_TURN))
        entries.append(still(CLEAN, f"proposed_pip_{view}", setup_character("pip", PROP["pip"], view, "PIP_POSE_NEUTRAL"), RES_TURN, SAMPLES_TURN))
        entries.append(still(CLEAN, f"existing_goat_{view}", setup_character("goat", CANON["goat"], view), RES_TURN, SAMPLES_TURN))
        entries.append(still(CLEAN, f"proposed_goat_{view}", setup_character("goat", PROP["goat"], view, "GOAT_POSE_NEUTRAL"), RES_TURN, SAMPLES_TURN))

    heroes = [
        ("existing_pip_full_body_1080", setup_character("pip", CANON["pip"], "full_body")),
        ("proposed_pip_full_body_1080", setup_character("pip", PROP["pip"], "full_body", "PIP_POSE_NEUTRAL")),
        ("existing_pip_face_1080", setup_character("pip", CANON["pip"], "closeup")),
        ("proposed_pip_face_1080", setup_character("pip", PROP["pip"], "closeup", "PIP_POSE_NEUTRAL")),
        ("existing_pip_acting_1080", setup_character("pip", CANON["pip"], "three_quarter", "PIP_POINT", 0.7)),
        ("proposed_pip_point_1080", setup_character("pip", PROP["pip"], "three_quarter", "PIP_POSE_POINT_CURIOUS", 0.55)),
        ("proposed_pip_discovery_1080", setup_character("pip", PROP["pip"], "three_quarter", "PIP_POSE_DISCOVERY", 0.8)),
        ("proposed_pip_brave_1080", setup_character("pip", PROP["pip"], "three_quarter", "PIP_POSE_BRAVE", 0.2)),
        ("existing_goat_full_body_1080", setup_character("goat", CANON["goat"], "full_body")),
        ("proposed_goat_full_body_1080", setup_character("goat", PROP["goat"], "full_body", "GOAT_POSE_NEUTRAL")),
        ("existing_goat_face_1080", setup_character("goat", CANON["goat"], "closeup")),
        ("proposed_goat_face_1080", setup_character("goat", PROP["goat"], "closeup", "GOAT_POSE_NEUTRAL")),
        ("existing_goat_acting_1080", setup_character("goat", CANON["goat"], "three_quarter", "GOAT_HEAD_NOD", 0.4)),
        ("proposed_goat_nod_1080", setup_character("goat", PROP["goat"], "three_quarter", "GOAT_POSE_NOD", 0.35)),
        ("proposed_goat_playful_1080", setup_character("goat", PROP["goat"], "three_quarter", "GOAT_POSE_PLAYFUL", 0.7)),
        ("proposed_goat_surprise_1080", setup_character("goat", PROP["goat"], "three_quarter", "GOAT_POSE_SURPRISE", 0.15)),
        (
            "existing_meadow_two_shot_1080",
            setup_env(CANON["meadow"], CANON["pip"], CANON["goat"], (0.95, -3.5, 1.15), (0.1, 0.1, 0.42), (-0.30, 0.08, 0.0), (0.46, 0.18, 0.0), "PIP_POINT", "GOAT_HEAD_NOD"),
        ),
        (
            "proposed_meadow_two_shot_1080",
            setup_env(PROP["meadow"], PROP["pip"], PROP["goat"], (0.85, -3.2, 1.05), (0.08, 0.2, 0.40), (-0.32, 0.12, 0.0), (0.48, 0.22, 0.0), "PIP_POSE_LOOK_GOAT", "GOAT_POSE_LOOK_PIP"),
        ),
        (
            "proposed_creek_two_shot_1080",
            setup_env(PROP["creek"], PROP["pip"], PROP["goat"], (0.15, -3.4, 1.15), (0.05, 0.2, 0.38), (-0.95, -0.15, 0.0), (1.05, 0.05, 0.0), "PIP_POSE_POINT_CURIOUS", "GOAT_POSE_NOD", vfx=True),
        ),
        ("existing_map_close_1080", setup_prop(CANON["map"], (0.55, -1.15, 0.62), (0.0, 0.0, 0.02), 45)),
        ("proposed_map_close_1080", setup_prop(PROP["map"], (0.52, -1.05, 0.58), (0.0, 0.0, 0.02), 45)),
        (
            "proposed_map_interaction_1080",
            setup_env(
                PROP["meadow"],
                PROP["pip"],
                PROP["goat"],
                (0.55, -2.4, 1.05),
                (0.05, 0.05, 0.38),
                (-0.28, 0.02, 0.0),
                (0.42, 0.10, 0.0),
                "PIP_POSE_MAP",
                "GOAT_POSE_MAP",
                map_path=PROP["map"],
                map_loc=(0.04, 0.08, 0.38),
                lens=40,
            ),
        ),
        (
            "proposed_lighting_vfx_1080",
            setup_env(
                PROP["meadow"],
                PROP["pip"],
                PROP["goat"],
                (0.35, -1.55, 0.72),
                (0.0, 0.05, 0.42),
                (-0.22, 0.05, 0.0),
                (0.38, 0.12, 0.0),
                "PIP_POSE_DISCOVERY",
                "GOAT_POSE_SURPRISE",
                world_rgb=(0.42, 0.58, 0.78),
                vfx=True,
                lens=45,
            ),
        ),
        (
            "proposed_cinematic_vertical_1080",
            setup_env(
                PROP["meadow"],
                PROP["pip"],
                PROP["goat"],
                (-0.15, -2.8, 0.55),
                (2.4, 4.6, 0.85),
                (-0.55, 0.35, 0.0),
                (0.15, 0.55, 0.0),
                "PIP_POSE_DISCOVERY",
                "GOAT_POSE_LOOK_PIP",
                world_rgb=(0.30, 0.42, 0.62),
                vfx=True,
                lens=28,
            ),
        ),
    ]
    for name, setup in heroes:
        entries.append(still(CLEAN, name, setup))

    pairs = [
        ("pip_full_body", "existing_pip_full_body_1080", "proposed_pip_full_body_1080", "existing canonical", "proposed theatrical v1.1"),
        ("pip_face", "existing_pip_face_1080", "proposed_pip_face_1080", "existing canonical", "proposed theatrical v1.1"),
        ("pip_acting", "existing_pip_acting_1080", "proposed_pip_point_1080", "existing canonical", "proposed theatrical v1.1"),
        ("goat_full_body", "existing_goat_full_body_1080", "proposed_goat_full_body_1080", "existing canonical", "proposed theatrical v1.1"),
        ("goat_face", "existing_goat_face_1080", "proposed_goat_face_1080", "existing canonical", "proposed theatrical v1.1"),
        ("goat_acting", "existing_goat_acting_1080", "proposed_goat_nod_1080", "existing canonical", "proposed theatrical v1.1"),
        ("meadow_two_shot", "existing_meadow_two_shot_1080", "proposed_meadow_two_shot_1080", "existing canonical", "proposed theatrical v1.1"),
        ("map_close", "existing_map_close_1080", "proposed_map_close_1080", "existing canonical", "proposed theatrical v1.1"),
    ]
    for key, left, right, ll, rl in pairs:
        dest = LABELED / f"compare_{key}.png"
        header_sheet(CLEAN / f"{left}.png", CLEAN / f"{right}.png", dest, ll, rl)
        entries.append({"file": str(dest.relative_to(REPO_ROOT)), "name": f"compare_{key}", "labeled": True, "left": ll, "right": rl})

    archive = write_zip()
    manifest = {
        "approved": False,
        "label": "proposed theatrical v1.1",
        "engine": "EEVEE Next",
        "viewTransform": "Khronos PBR Neutral",
        "heroRes": "1080x1920",
        "heroSamples": SAMPLES_HERO,
        "archive": str(archive.relative_to(REPO_ROOT)),
        "previews": entries,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"status": "OK", "count": len(entries), "out": str(OUT), "zip": str(archive)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
