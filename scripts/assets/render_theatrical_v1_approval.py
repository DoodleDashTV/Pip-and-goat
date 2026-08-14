"""Visual-approval package for proposed theatrical v1 assets.

Hero stills: 1080x1920, 32 EEVEE samples.
Turnarounds: 540x960, 16 samples.
Labels: existing canonical | proposed theatrical v1 | diagnostic only
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from png_io import read_stored_srgb, write_stored_srgb  # noqa: E402
from theatrical_v1_common import PROPOSED, assert_not_production_library  # noqa: E402

LIB = REPO_ROOT / "production-library"
CANON = {
    "pip": LIB / "characters/pip_production.blend",
    "goat": LIB / "characters/goat_production.blend",
    "meadow": LIB / "environments/meadow_production.blend",
    "map": LIB / "props/adventure_map.blend",
}
PROP = {
    "pip": PROPOSED / "pip_theatrical_v1.blend",
    "goat": PROPOSED / "goat_theatrical_v1.blend",
    "meadow": PROPOSED / "meadow_theatrical_v1.blend",
    "creek": PROPOSED / "creek_theatrical_v1.blend",
    "map": PROPOSED / "map_theatrical_v1.blend",
    "vfx": PROPOSED / "lighting_vfx_theatrical_v1.blend",
}

LABELS = {
    "existing": "existing canonical",
    "proposed": "proposed theatrical v1",
    "diagnostic": "diagnostic only",
}
BAR = {"existing": (20, 150, 130), "proposed": (210, 150, 30), "diagnostic": (90, 90, 90)}
RES_HERO = (1080, 1920)
RES_TURN = (540, 960)
SAMPLES_HERO = 32
SAMPLES_TURN = 16
OUT = REPO_ROOT / "artifacts/theatrical-v1/previews"


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


def lights():
    bpy.ops.object.light_add(type="SUN", location=(2.4, -2.0, 5.0))
    bpy.context.object.data.energy = 3.4
    bpy.ops.object.light_add(type="AREA", location=(-1.2, -1.5, 1.3))
    bpy.context.object.data.energy = 55
    bpy.context.object.data.size = 2.0
    bpy.ops.object.light_add(type="AREA", location=(0.2, -0.6, 0.55))
    eye = bpy.context.object
    eye.name = "Light_EyeCatch"
    eye.data.energy = 20
    eye.data.size = 0.14
    eye.data.use_shadow = False


def look_at(cam, target):
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def camera(mode, subject="pip"):
    focus = (0.0, 0.0, 0.30) if subject == "pip" else (0.0, 0.0, 0.55)
    dist = 1.2 if subject == "pip" else 2.3
    elev = 0.34 if subject == "pip" else 0.68
    locs = {
        "front": (0.0, -dist, elev),
        "left": (-dist, 0.0, elev),
        "right": (dist, 0.0, elev),
        "rear": (0.0, dist, elev),
        "full_body": (0.32, -dist * 1.15, elev * 0.9),
        "closeup": (0.06, -0.52 if subject == "pip" else -0.95, 0.43 if subject == "pip" else 0.78),
        "three_quarter": (dist * 0.5, -dist * 0.85, elev),
    }
    if mode == "closeup":
        focus = (0.0, -0.04, 0.43) if subject == "pip" else (0.0, -0.22, 0.78)
    data = bpy.data.cameras.new("VACam")
    cam = bpy.data.objects.new("VACam", data)
    bpy.context.collection.objects.link(cam)
    cam.location = locs.get(mode, locs["front"])
    look_at(cam, focus)
    cam.data.lens = 50 if mode == "closeup" else 35
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
    bpy.context.scene.frame_set(12)
    return True


def set_expr(imported, smile=0.0, brow=0.0):
    for obj in imported:
        if obj.type != "MESH" or not obj.data.shape_keys:
            continue
        keys = obj.data.shape_keys.key_blocks
        if "mouth_smile" in keys:
            keys["mouth_smile"].value = smile
        if "brow_up" in keys:
            keys["brow_up"].value = brow


def stamp(path: Path, kind: str):
    pixels = read_stored_srgb(path)
    bar = BAR[kind]
    h = max(8, int(pixels.shape[0] * 0.03))
    pixels[-h:, :, 0] = bar[0]
    pixels[-h:, :, 1] = bar[1]
    pixels[-h:, :, 2] = bar[2]
    write_stored_srgb(path, pixels.astype("uint8"))


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


def still(kind, name, setup, res=RES_HERO, samples=SAMPLES_HERO):
    clear()
    setup()
    path = OUT / f"{kind}_{name}.png"
    render(path, res, samples)
    stamp(path, kind)
    return {"file": str(path.relative_to(REPO_ROOT)), "label": LABELS[kind], "name": name, "res": f"{res[0]}x{res[1]}", "samples": samples}


def setup_character(who, source, view, action=None, smile=0.0):
    def _():
        world()
        lights()
        imported = append(source)
        arm = find_arm(imported, "Pip" if who == "pip" else "Goat")
        if action:
            apply_action(arm, action)
        set_expr(imported, smile=smile, brow=0.2 if smile else 0.0)
        camera(view, subject=who)

    return _


def setup_env_scene(env_path, pip_path, goat_path, cam_loc, focus, pip_loc, goat_loc):
    def _():
        world((0.48, 0.66, 0.86), 0.75)
        lights()
        append(env_path)
        pip = append(pip_path)
        goat = append(goat_path)
        pip_arm = find_arm(pip, "Pip")
        goat_arm = find_arm(goat, "Goat")
        if pip_arm:
            pip_arm.location = pip_loc
        if goat_arm:
            goat_arm.location = goat_loc
        apply_action(pip_arm, "PIP_POINT")
        apply_action(goat_arm, "GOAT_HEAD_NOD")
        set_expr(pip, smile=0.7, brow=0.2)
        set_expr(goat, smile=0.4)
        data = bpy.data.cameras.new("VACam")
        cam = bpy.data.objects.new("VACam", data)
        bpy.context.collection.objects.link(cam)
        cam.location = cam_loc
        look_at(cam, focus)
        cam.data.lens = 32
        bpy.context.scene.camera = cam

    return _


def setup_prop(path, loc, focus, lens=40):
    def _():
        world((0.55, 0.56, 0.58), 0.55)
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


def main() -> int:
    assert_not_production_library(OUT)
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []

    # Matched turnarounds 540x960
    for view in ("front", "left", "right", "rear"):
        entries.append(still("existing", f"pip_{view}", setup_character("pip", CANON["pip"], view), RES_TURN, SAMPLES_TURN))
        entries.append(still("proposed", f"pip_{view}", setup_character("pip", PROP["pip"], view), RES_TURN, SAMPLES_TURN))
        entries.append(still("existing", f"goat_{view}", setup_character("goat", CANON["goat"], view), RES_TURN, SAMPLES_TURN))
        entries.append(still("proposed", f"goat_{view}", setup_character("goat", PROP["goat"], view), RES_TURN, SAMPLES_TURN))

    # Required 1080x1920 approval images
    heroes = [
        ("existing", "pip_full_body_1080", setup_character("pip", CANON["pip"], "full_body")),
        ("proposed", "pip_full_body_1080", setup_character("pip", PROP["pip"], "full_body")),
        ("existing", "pip_face_1080", setup_character("pip", CANON["pip"], "closeup")),
        ("proposed", "pip_face_1080", setup_character("pip", PROP["pip"], "closeup")),
        ("existing", "pip_acting_1080", setup_character("pip", CANON["pip"], "three_quarter", "PIP_POINT", 0.75)),
        ("proposed", "pip_acting_1080", setup_character("pip", PROP["pip"], "three_quarter", "PIP_POINT", 0.75)),
        ("existing", "goat_full_body_1080", setup_character("goat", CANON["goat"], "full_body")),
        ("proposed", "goat_full_body_1080", setup_character("goat", PROP["goat"], "full_body")),
        ("existing", "goat_face_1080", setup_character("goat", CANON["goat"], "closeup")),
        ("proposed", "goat_face_1080", setup_character("goat", PROP["goat"], "closeup")),
        ("existing", "goat_acting_1080", setup_character("goat", CANON["goat"], "three_quarter", "GOAT_HEAD_NOD", 0.45)),
        ("proposed", "goat_acting_1080", setup_character("goat", PROP["goat"], "three_quarter", "GOAT_HEAD_NOD", 0.45)),
        ("existing", "meadow_two_shot_1080", setup_env_scene(CANON["meadow"], CANON["pip"], CANON["goat"], (0.9, -3.4, 1.15), (0.1, 0.0, 0.45), (-0.28, 0.05, 0.0), (0.42, 0.15, 0.0))),
        ("proposed", "meadow_two_shot_1080", setup_env_scene(PROP["meadow"], PROP["pip"], PROP["goat"], (0.9, -3.4, 1.15), (0.1, 0.0, 0.45), (-0.28, 0.05, 0.0), (0.42, 0.15, 0.0))),
        ("proposed", "creek_two_shot_1080", setup_env_scene(PROP["creek"], PROP["pip"], PROP["goat"], (1.4, -3.6, 1.2), (0.0, 0.0, 0.35), (-1.15, 0.1, 0.0), (1.15, 0.2, 0.0))),
        ("existing", "map_close_1080", setup_prop(CANON["map"], (0.55, -1.2, 0.65), (0.0, 0.0, 0.02), 45)),
        ("proposed", "map_close_1080", setup_prop(PROP["map"], (0.55, -1.2, 0.65), (0.0, 0.0, 0.02), 45)),
        ("proposed", "cinematic_vertical_1080", setup_env_scene(PROP["meadow"], PROP["pip"], PROP["goat"], (1.3, -3.8, 1.35), (0.05, 0.1, 0.4), (-0.3, 0.1, 0.0), (0.4, 0.2, 0.0))),
        ("diagnostic", "pip_front", setup_character("pip", PROP["pip"], "front"), RES_TURN, SAMPLES_TURN),
    ]
    for item in heroes:
        kind, name, setup = item[0], item[1], item[2]
        res = item[3] if len(item) > 3 else RES_HERO
        samples = item[4] if len(item) > 4 else SAMPLES_HERO
        entries.append(still(kind, name, setup, res, samples))

    manifest = {"approved": False, "previews": entries}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    lines = [
        "# Theatrical v1 visual-approval previews",
        "",
        "Labels: existing canonical | proposed theatrical v1 | diagnostic only",
        "Hero stills are 1080x1920 @ 32 EEVEE samples. Not approved.",
        "",
    ]
    for e in entries:
        rel = Path("..") / ".." / e["file"]
        lines += [f"### {e['label']} — {Path(e['file']).name} ({e['res']}, {e['samples']} spp)", "", f"![{e['label']}]({rel.as_posix()})", ""]
    (REPO_ROOT / "theatrical-foundation/proposed/v1/PREVIEW_INDEX.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"status": "OK", "count": len(entries), "out": str(OUT)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
