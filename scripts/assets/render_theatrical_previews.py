"""Local labeled stills for theatrical foundation review.

Labels:
  existing approved asset
  proposed upgrade
  temporary diagnostic asset

Does not write to production-library/. Does not approve anything.
Local EEVEE / software GL only.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe blender -b -noaudio \\
      --python scripts/assets/render_theatrical_previews.py
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from png_io import read_stored_srgb, write_stored_srgb  # noqa: E402
from theatrical_shaders import apply_to_objects, assert_not_production_library, load_recipes  # noqa: E402

LIB = REPO_ROOT / "production-library"
PIP = LIB / "characters/pip_production.blend"
GOAT = LIB / "characters/goat_production.blend"
MEADOW = LIB / "environments/meadow_production.blend"
MAP = LIB / "props/adventure_map.blend"

LABELS = {
    "existing": "existing approved asset",
    "proposed": "proposed upgrade",
    "diagnostic": "temporary diagnostic asset",
}
BAR_RGB = {
    "existing": (20, 150, 130),
    "proposed": (210, 150, 30),
    "diagnostic": (90, 90, 90),
}

RES_REVIEW = (270, 480)
RES_HERO = (540, 960)
SAMPLES = 8


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render theatrical foundation previews.")
    parser.add_argument("--out", default=str(REPO_ROOT / "artifacts/theatrical-foundation/previews"))
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_color() -> None:
    scene = bpy.context.scene
    try:
        scene.view_settings.view_transform = "Khronos PBR Neutral"
    except (TypeError, ValueError):
        pass
    try:
        scene.view_settings.look = "None"
    except (TypeError, ValueError):
        pass


def setup_world(color=(0.62, 0.74, 0.88), strength=0.85) -> None:
    world = bpy.data.worlds.new("TFWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (*color, 1.0)
        bg.inputs[1].default_value = strength


def setup_lights(kind: str = "neutral") -> None:
    if kind == "neutral":
        specs = [
            ("SUN", (2.4, -2.0, 5.0), 3.2, None),
            ("AREA", (-1.3, -1.6, 1.3), 48.0, 2.0),
            ("AREA", (1.6, 1.1, 0.9), 22.0, 1.4),
        ]
    else:
        specs = [
            ("SUN", (1.2, -3.2, 4.2), 4.0, None),
            ("AREA", (-2.0, -0.8, 1.6), 70.0, 2.4),
            ("AREA", (2.2, 0.4, 0.5), 18.0, 1.2),
        ]
    for typ, loc, energy, size in specs:
        bpy.ops.object.light_add(type=typ, location=loc)
        lamp = bpy.context.object
        lamp.data.energy = energy
        if size is not None:
            lamp.data.size = size


def look_at(cam, target) -> None:
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def place_camera(mode: str, subject: str = "pip"):
    focus = (0.0, 0.0, 0.28) if subject == "pip" else (0.0, 0.0, 0.55)
    dist = 1.15 if subject == "pip" else 2.2
    elev = 0.32 if subject == "pip" else 0.65
    cams = {
        "front": (0.0, -dist, elev),
        "left": (-dist, 0.0, elev),
        "right": (dist, 0.0, elev),
        "rear": (0.0, dist, elev),
        "three_quarter": (dist * 0.55, -dist * 0.85, elev),
        "closeup": (0.08, -0.55 if subject == "pip" else -1.0, 0.42 if subject == "pip" else 0.82),
        "full_body": (0.35, -dist * 1.15, elev * 0.9),
    }
    loc = cams.get(mode, cams["front"])
    if mode == "closeup":
        focus = (0.0, -0.05, 0.42) if subject == "pip" else (0.0, -0.25, 0.82)
    cam_data = bpy.data.cameras.new("TFCam")
    cam = bpy.data.objects.new("TFCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = loc
    look_at(cam, focus)
    bpy.context.scene.camera = cam
    cam.data.lens = 50 if mode == "closeup" else 35
    return cam


def append_blend(path: Path) -> list:
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


def find_arm_mesh(imported, prefix: str):
    arm = next((o for o in imported if o.type == "ARMATURE"), None)
    mesh = next((o for o in imported if o.type == "MESH" and f"{prefix}_Character" in o.name), None)
    return arm, mesh


def apply_action(arm, name: str) -> bool:
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


def set_expr(mesh, smile: float = 0.0, brow: float = 0.0) -> None:
    if not mesh or not mesh.data.shape_keys:
        return
    keys = mesh.data.shape_keys.key_blocks
    if "mouth_smile" in keys:
        keys["mouth_smile"].value = smile
    if "brow_up" in keys:
        keys["brow_up"].value = brow


def stamp(path: Path, kind: str) -> None:
    pixels = read_stored_srgb(path)
    bar = BAR_RGB[kind]
    height = max(6, int(pixels.shape[0] * 0.035))
    pixels[-height:, :, 0] = bar[0]
    pixels[-height:, :, 1] = bar[1]
    pixels[-height:, :, 2] = bar[2]
    write_stored_srgb(path, pixels.astype("uint8"))


def eevee_engine_id(scene) -> str:
    try:
        prop = scene.render.bl_rna.properties["engine"]
        available = {item.identifier for item in prop.enum_items}
    except Exception:
        available = set()
    if "BLENDER_EEVEE_NEXT" in available:
        return "BLENDER_EEVEE_NEXT"
    return "BLENDER_EEVEE"


def render_still(path: Path, res=RES_REVIEW) -> None:
    scene = bpy.context.scene
    setup_color()
    scene.render.engine = eevee_engine_id(scene)
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = SAMPLES
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def render_character(out: Path, who: str, kind: str, view: str, action: str | None, lighting: str, res=RES_REVIEW) -> dict:
    clear_scene()
    setup_world()
    setup_lights(lighting)
    prefix = "Pip" if who == "pip" else "Goat"
    imported = append_blend(PIP if who == "pip" else GOAT)
    arm, mesh = find_arm_mesh(imported, prefix)
    if action:
        apply_action(arm, action)
        if action.endswith("POINT") or action.endswith("HAPPY"):
            set_expr(mesh, smile=0.75, brow=0.25)
        if action.endswith("HEAD_NOD"):
            set_expr(mesh, smile=0.45)
    if kind in {"proposed", "diagnostic"}:
        apply_to_objects(imported)
    place_camera(view, subject=who)
    if kind == "existing":
        filename = f"existing_approved_{who}_{view}{'_' + action.lower() if action else ''}.png"
    elif kind == "proposed":
        filename = f"proposed_upgrade_{who}_{view}{'_' + action.lower() if action else ''}{'_' + lighting if lighting != 'neutral' else ''}.png"
    else:
        filename = f"diagnostic_{who}_{view}.png"
    path = out / filename
    render_still(path, res=res)
    stamp(path, kind)
    return {
        "file": str(path.relative_to(REPO_ROOT)),
        "label": LABELS[kind],
        "subject": who,
        "view": view,
        "approved": False if kind != "existing" else "existing approved asset — not a new approval",
    }


def render_prop(out: Path, kind: str, path_in: Path, name: str, loc, lens=35) -> dict:
    clear_scene()
    setup_world((0.55, 0.58, 0.6), 0.6)
    setup_lights("neutral")
    imported = append_blend(path_in)
    if kind == "proposed":
        apply_to_objects(imported)
    cam_data = bpy.data.cameras.new("TFCam")
    cam = bpy.data.objects.new("TFCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = loc
    look_at(cam, (0.0, 0.0, 0.2))
    cam.data.lens = lens
    bpy.context.scene.camera = cam
    prefix = "existing_approved" if kind == "existing" else "proposed_upgrade"
    path = out / f"{prefix}_{name}.png"
    render_still(path)
    stamp(path, kind)
    return {"file": str(path.relative_to(REPO_ROOT)), "label": LABELS[kind], "subject": name}


def render_vertical_scene(out: Path) -> dict:
    clear_scene()
    setup_world((0.45, 0.62, 0.85), 0.7)
    setup_lights("motivated")
    meadow = append_blend(MEADOW)
    pip = append_blend(PIP)
    goat = append_blend(GOAT)
    apply_to_objects(meadow + pip + goat)
    pip_arm, pip_mesh = find_arm_mesh(pip, "Pip")
    goat_arm, goat_mesh = find_arm_mesh(goat, "Goat")
    if pip_arm:
        pip_arm.location = (-0.28, 0.05, 0.0)
    if goat_arm:
        goat_arm.location = (0.42, 0.15, 0.0)
    apply_action(pip_arm, "PIP_POINT")
    apply_action(goat_arm, "GOAT_HEAD_NOD")
    set_expr(pip_mesh, smile=0.7, brow=0.2)
    set_expr(goat_mesh, smile=0.4)
    cam_data = bpy.data.cameras.new("TFCam")
    cam = bpy.data.objects.new("TFCam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.9, -3.4, 1.15)
    look_at(cam, (0.1, 0.0, 0.45))
    cam.data.lens = 32
    bpy.context.scene.camera = cam
    path = out / "proposed_upgrade_vertical_scene_meadow.png"
    render_still(path, res=RES_HERO)
    stamp(path, "proposed")
    return {
        "file": str(path.relative_to(REPO_ROOT)),
        "label": LABELS["proposed"],
        "subject": "vertical-scene",
        "note": "Representative 9:16 still. Proposed shaders on approved meshes. Not a golden scene.",
    }


def write_index(out: Path, entries: list[dict]) -> None:
    lines = [
        "# Theatrical foundation visual previews",
        "",
        "These stills are for Justin’s review. Automated tests passing does **not** approve them.",
        "",
        "| File | Label | Subject |",
        "| --- | --- | --- |",
    ]
    for entry in entries:
        rel = entry["file"]
        lines.append(f"| `{rel}` | {entry['label']} | {entry.get('subject', '')} |")
    lines.extend(["", "## Gallery", ""])
    for entry in entries:
        rel = Path(entry["file"])
        # PREVIEW_INDEX lives in theatrical-foundation/; images in artifacts/.
        img = Path("..") / rel
        lines.append(f"### {entry['label']} — {rel.name}")
        lines.append("")
        lines.append(f"![{entry['label']}]({img.as_posix()})")
        lines.append("")
    index = REPO_ROOT / "theatrical-foundation/PREVIEW_INDEX.md"
    index.write_text("\n".join(lines) + "\n")
    (out / "manifest.json").write_text(json.dumps({"approved": False, "previews": entries}, indent=2) + "\n")


def main() -> int:
    args = parse_args()
    out = Path(args.out)
    if not out.is_absolute():
        out = (REPO_ROOT / out).resolve()
    assert_not_production_library(out)
    out.mkdir(parents=True, exist_ok=True)
    load_recipes()
    entries: list[dict] = []

    for view in ("front", "left", "right", "rear", "closeup", "full_body"):
        entries.append(render_character(out, "pip", "existing", view, None, "neutral"))
    entries.append(render_character(out, "pip", "existing", "three_quarter", "PIP_POINT", "neutral"))
    for view in ("front", "left", "right", "rear", "closeup", "full_body"):
        entries.append(render_character(out, "goat", "existing", view, None, "neutral"))
    entries.append(render_character(out, "goat", "existing", "three_quarter", "GOAT_HEAD_NOD", "neutral"))

    entries.append(render_prop(out, "existing", MEADOW, "meadow_set", (2.4, -4.2, 2.2), 28))
    entries.append(render_prop(out, "existing", MAP, "map_prop", (0.6, -1.4, 0.7), 40))

    for view in ("front", "closeup", "full_body"):
        entries.append(render_character(out, "pip", "proposed", view, None, "neutral"))
        entries.append(render_character(out, "goat", "proposed", view, None, "neutral"))

    entries.append(render_character(out, "pip", "proposed", "closeup", None, "motivated"))
    entries.append(render_character(out, "goat", "proposed", "closeup", None, "motivated"))
    entries.append(render_prop(out, "proposed", MEADOW, "meadow_set", (2.4, -4.2, 2.2), 28))
    entries.append(render_prop(out, "proposed", MAP, "map_prop", (0.6, -1.4, 0.7), 40))
    entries.append(render_vertical_scene(out))

    # Diagnostic: proposed shaders on Pip with a flat clay-adjacent world to judge form vs material.
    entries.append(render_character(out, "pip", "diagnostic", "front", None, "neutral"))

    write_index(out, entries)
    print(json.dumps({"status": "OK", "count": len(entries), "out": str(out)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
