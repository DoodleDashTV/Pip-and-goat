"""First visual-gate renders for proposed theatrical v2 sculpts.

Clean 1080x1920 stills have no in-frame labels. Labeled sheets keep captions
in a header strip. Clay and basic-color. No retopo / rig / env rebuild.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from theatrical_v2_common import CLAY, PROPOSED_V2, assert_not_production_library, principled_mat  # noqa: E402

OUT = REPO_ROOT / "artifacts/theatrical-v2/previews"
CLEAN = OUT / "clean"
LABELED = OUT / "labeled"
RES = (1080, 1920)
SAMPLES = 24
HEADER = 80

PIP_BLEND = PROPOSED_V2 / "pip_theatrical_v2.blend"
GOAT_BLEND = PROPOSED_V2 / "goat_theatrical_v2.blend"


def eevee_id(scene) -> str:
    try:
        available = {i.identifier for i in scene.render.bl_rna.properties["engine"].enum_items}
    except Exception:
        available = set()
    return "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in available else "BLENDER_EEVEE"


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def color_mgmt():
    scene = bpy.context.scene
    try:
        scene.view_settings.view_transform = "Khronos PBR Neutral"
        scene.view_settings.look = "None"
    except (TypeError, ValueError):
        pass


def world(rgb=(0.78, 0.76, 0.72), strength=0.95):
    w = bpy.data.worlds.new("V2World")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (*rgb, 1.0)
        bg.inputs[1].default_value = strength


def lights():
    bpy.ops.object.light_add(type="SUN", location=(2.4, -2.0, 5.0))
    bpy.context.object.data.energy = 3.4
    bpy.ops.object.light_add(type="AREA", location=(-1.2, -1.8, 1.6))
    bpy.context.object.data.energy = 55
    bpy.context.object.data.size = 2.0
    bpy.ops.object.light_add(type="AREA", location=(0.2, -0.6, 0.9))
    catch = bpy.context.object
    catch.name = "Light_EyeCatch"
    catch.data.energy = 28
    catch.data.size = 0.12
    catch.data.use_shadow = False
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=2.4, fill_type="NGON", location=(0, 0, 0.0))
    ground = bpy.context.object
    ground.name = "StudioGround"
    ground.rotation_euler = (0, 0, 0)
    mat = principled_mat("StudioGroundMat", (0.72, 0.70, 0.66), roughness=0.78, specular=0.08)
    if ground.data.materials:
        ground.data.materials[0] = mat
    else:
        ground.data.materials.append(mat)


def look_at(cam, target):
    cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()


def camera(mode, subject="pip"):
    if subject == "pip":
        focus = (0.0, 0.0, 0.58)
        dist, elev = 1.55, 0.62
        close_focus = (0.0, -0.06, 0.88)
        close_loc = (0.04, -0.62, 0.88)
    elif subject == "goat":
        focus = (0.0, 0.0, 0.88)
        dist, elev = 2.15, 0.92
        close_focus = (0.0, -0.08, 1.34)
        close_loc = (0.05, -0.85, 1.34)
    else:
        focus = (0.12, 0.0, 0.78)
        dist, elev = 2.55, 0.88
        close_focus = focus
        close_loc = (0.1, -1.2, 0.9)
    locs = {
        "front": (0.0, -dist, elev),
        "left": (-dist, 0.0, elev),
        "right": (dist, 0.0, elev),
        "rear": (0.0, dist, elev),
        "three_quarter": (dist * 0.58, -dist * 0.86, elev),
        "full_body": (0.35, -dist * 1.08, elev * 0.9),
        "closeup": close_loc,
    }
    data = bpy.data.cameras.new("V2Cam")
    cam = bpy.data.objects.new("V2Cam", data)
    bpy.context.collection.objects.link(cam)
    cam.location = locs.get(mode, locs["full_body"])
    look_at(cam, close_focus if mode == "closeup" else focus)
    cam.data.lens = 55 if mode == "closeup" else 38
    bpy.context.scene.camera = cam
    return cam


def append(path: Path):
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = list(src.objects)
    imported = []
    for obj in dst.objects:
        if obj is None:
            continue
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)
        imported.append(obj)
    return imported


def clay_override(imported):
    mat = principled_mat("V2_Clay", CLAY, roughness=0.62, specular=0.12, subsurface=0.06)
    for obj in imported:
        if obj.type != "MESH":
            continue
        obj.data.materials.clear()
        obj.data.materials.append(mat)


def render_still(path: Path):
    scene = bpy.context.scene
    color_mgmt()
    scene.render.engine = eevee_id(scene)
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = SAMPLES
    scene.render.resolution_x, scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def setup_one(blend: Path, view: str, subject: str, clay: bool):
    def _():
        world()
        lights()
        imported = append(blend)
        if clay:
            clay_override(imported)
        camera(view, subject=subject)

    return _


def setup_pair(clay: bool):
    def _():
        world()
        lights()
        pip = append(PIP_BLEND)
        goat = append(GOAT_BLEND)
        for obj in pip:
            obj.location.x -= 0.38
        for obj in goat:
            obj.location.x += 0.32
        if clay:
            clay_override(pip + goat)
        camera("full_body", subject="pair")

    return _


def header_sheet(src: Path, dest: Path, caption: str):
    from png_io import read_stored_srgb, write_stored_srgb

    rgb = read_stored_srgb(src)
    h, w, _c = rgb.shape
    import numpy as np

    out = np.full((h + HEADER, w, 3), 18, dtype=np.uint8)
    out[HEADER:, :, :3] = rgb[:, :, :3].astype(np.uint8)
    dest.parent.mkdir(parents=True, exist_ok=True)
    write_stored_srgb(dest, out)
    dest.with_suffix(".txt").write_text(caption + "\n")


def main():
    assert_not_production_library(OUT)
    CLEAN.mkdir(parents=True, exist_ok=True)
    LABELED.mkdir(parents=True, exist_ok=True)

    views = ["front", "left", "right", "rear", "three_quarter", "closeup", "full_body"]
    jobs = []
    for who, blend in (("pip", PIP_BLEND), ("goat", GOAT_BLEND)):
        for mode in ("color", "clay"):
            for view in views:
                name = f"{who}_{mode}_{view}"
                jobs.append((name, setup_one(blend, view, who, clay=(mode == "clay")), f"{who} {mode} {view}"))
    jobs.append(("pair_color_full_body", setup_pair(False), "pair color full-body scale"))
    jobs.append(("pair_clay_full_body", setup_pair(True), "pair clay full-body scale"))

    manifest = {
        "label": "proposed theatrical v2 first visual gate",
        "approved": False,
        "engine": "EEVEE Next",
        "viewTransform": "Khronos PBR Neutral",
        "resolution": f"{RES[0]}x{RES[1]}",
        "samples": SAMPLES,
        "previews": [],
    }
    for name, setup, caption in jobs:
        clear()
        setup()
        clean_path = CLEAN / f"{name}.png"
        render_still(clean_path)
        labeled_path = LABELED / f"{name}.png"
        header_sheet(clean_path, labeled_path, f"PROPOSED UNAPPROVED V2 — {caption}")
        manifest["previews"].append(
            {
                "name": name,
                "clean": str(clean_path.relative_to(REPO_ROOT)),
                "labeled": str(labeled_path.relative_to(REPO_ROOT)),
                "caption": caption,
            }
        )

    out_json = OUT / "manifest.json"
    out_json.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"count": len(manifest["previews"]), "out": str(OUT)}, indent=2))


if __name__ == "__main__":
    main()
