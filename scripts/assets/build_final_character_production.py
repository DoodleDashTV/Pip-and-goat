#!/usr/bin/env python3
"""Import selected high-detail foundations into proposed working blends.

Does not overwrite original GLB/blend sources. Does not use the rejected
primitive rebuild as a starting mesh.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/build_final_character_production.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "assets"))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from theatrical_rebuild_common import assert_not_production_library  # noqa: E402

PKG = Path(
    "/tmp/pip-goat-v2-source/theatrical-foundation/proposed/v2/scource-package/"
    "TivvleJoy_Pip_Goat_3D_Source_v1_CURSOR_LITE"
)
PIP_PRISM = PKG / "Pip/models/alternates/Pip_Prism_source.glb"
GOAT_PRISM = PKG / "Goat/models/alternates/Goat_Prism_expressive_source.glb"
OUT = REPO_ROOT / "theatrical-foundation/proposed/final-character-production"
WORKING = OUT / "working"
PREVIEWS = REPO_ROOT / "artifacts/theatrical-v2/final-character-production/clean"
REPORTS = OUT / "reports"

PIP_HEIGHT = 2.05
GOAT_SCALE = 1.50
FACING = Vector((1.0, 0.0, 0.0))
CHAR_LEFT = Vector((0.0, 1.0, 0.0))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def meshes():
    return [obj for obj in bpy.data.objects if obj.type == "MESH"]


def bounds(objects=None):
    objects = objects or meshes()
    coords = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    xs, ys, zs = zip(*[(c.x, c.y, c.z) for c in coords])
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def apply_object(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def snap_and_scale(target_height: float) -> dict:
    for obj in meshes():
        apply_object(obj)
    bpy.context.view_layer.update()
    mn, mx = bounds()
    height = max(mx.z - mn.z, 1e-4)
    factor = target_height / height
    for obj in meshes():
        obj.scale *= factor
        obj.location.z -= mn.z * factor
    bpy.context.view_layer.update()
    for obj in meshes():
        apply_object(obj)
    bpy.context.view_layer.update()
    mn, mx = bounds()
    dz = -mn.z
    for obj in meshes():
        obj.location.z += dz
    bpy.context.view_layer.update()
    for obj in meshes():
        apply_object(obj)
    mn, mx = bounds()
    return {
        "from_height": height,
        "to_height": mx.z - mn.z,
        "factor": factor,
        "min": list(mn),
        "max": list(mx),
        "objects": [obj.name for obj in meshes()],
        "verts": sum(len(obj.data.vertices) for obj in meshes()),
        "faces": sum(len(obj.data.polygons) for obj in meshes()),
    }


def khronos():
    scene = bpy.context.scene
    scene.view_settings.view_transform = "Khronos PBR Neutral"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    scene.display_settings.display_device = "sRGB"


def lights():
    khronos()
    scene = bpy.context.scene
    world = bpy.data.worlds.new("FinalWorld")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.83, 0.86, 0.89, 1.0)
    bg.inputs["Strength"].default_value = 0.88
    key = bpy.data.lights.new("Key", "SUN")
    key.energy = 2.35
    key_obj = bpy.data.objects.new("Key", key)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (0.70, 0.10, 0.32)
    fill = bpy.data.lights.new("Fill", "SUN")
    fill.energy = 0.62
    fill_obj = bpy.data.objects.new("Fill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (0.95, -0.42, 3.25)


def add_camera(name, location, target, ortho):
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
    return obj


def render_path(path: Path, samples: int = 24):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1920
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.filepath = str(path)
    scene.eevee.taa_render_samples = samples
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def render_subject(stem: str) -> list[str]:
    lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    views = {
        "front": (center + FACING * radius, height * 1.28),
        "back": (center - FACING * radius, height * 1.28),
        "side": (center + CHAR_LEFT * radius, height * 1.28),
        "three_quarter": (center + (FACING * 0.72 + CHAR_LEFT * 0.72) * radius, height * 1.32),
        "face": (center + FACING * (height * 0.85) + Vector((0, 0, height * 0.28)), height * 0.52),
    }
    written = []
    for name, (loc, ortho) in views.items():
        focus = center + Vector((0, 0, height * (0.30 if name == "face" else 0.02)))
        if name == "face":
            loc = loc + Vector((0, 0, height * 0.28))
        cam = add_camera(f"{stem}_{name}", loc, focus, ortho)
        bpy.context.scene.camera = cam
        dest = PREVIEWS / f"{stem}_{name}.png"
        render_path(dest)
        written.append(str(dest.relative_to(REPO_ROOT)))
    return written


def save_blend(path: Path):
    assert_not_production_library(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)


def import_glb(path: Path, name: str):
    reset()
    bpy.ops.import_scene.gltf(filepath=str(path))
    for obj in meshes():
        obj.name = name
        obj[name + "_foundation"] = str(path)
        obj["ddp_approved"] = False
        obj["ddp_theatrical_bound"] = False


def append_blend(path: Path):
    with bpy.data.libraries.load(str(path), link=False) as (src, dst):
        dst.objects = [name for name in src.objects if name]
    imported = []
    for obj in dst.objects:
        if obj is None:
            continue
        if obj.name not in bpy.context.collection.objects:
            bpy.context.collection.objects.link(obj)
        imported.append(obj)
    return imported


def render_pair(pip_blend: Path, goat_blend: Path) -> dict:
    reset()
    pips = append_blend(pip_blend)
    goats = append_blend(goat_blend)
    pip_meshes = [obj for obj in pips if obj.type == "MESH"]
    goat_meshes = [obj for obj in goats if obj.type == "MESH"]
    for obj in pip_meshes:
        obj.location.y -= 0.95
    for obj in goat_meshes:
        obj.location.y += 1.15
    bpy.context.view_layer.update()
    lights()
    both = pip_meshes + goat_meshes
    mn, mx = bounds(both)
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    views = {
        "front": (center + FACING * span * 1.35, max(span * 1.15, height * 1.72)),
        "three_quarter": (center + (FACING * 0.75 + CHAR_LEFT * 0.75) * span * 1.25, max(span * 1.20, height * 1.78)),
        "side": (center + CHAR_LEFT * span * 1.35, max(span * 1.15, height * 1.75)),
    }
    written = []
    for name, (loc, ortho) in views.items():
        cam = add_camera(f"pair_{name}", loc, center + Vector((0, 0, height * 0.02)), ortho)
        bpy.context.scene.camera = cam
        dest = PREVIEWS / f"pair_{name}.png"
        render_path(dest, samples=28)
        written.append(str(dest.relative_to(REPO_ROOT)))
    ph = bounds(pip_meshes)
    gh = bounds(goat_meshes)
    pip_h = ph[1].z - ph[0].z
    goat_h = gh[1].z - gh[0].z
    return {
        "renders": written,
        "pip_height": pip_h,
        "goat_height": goat_h,
        "ratio": goat_h / pip_h if pip_h else 0.0,
    }


def main() -> int:
    if not PIP_PRISM.is_file() or not GOAT_PRISM.is_file():
        raise FileNotFoundError("selected Prism foundations missing from isolated package")
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    WORKING.mkdir(parents=True, exist_ok=True)

    import_glb(PIP_PRISM, "Pip_HighDetail")
    pip_info = snap_and_scale(PIP_HEIGHT)
    pip_blend = WORKING / "pip_highdetail_working.blend"
    save_blend(pip_blend)
    pip_renders = render_subject("pip_final")

    import_glb(GOAT_PRISM, "Goat_HighDetail")
    goat_info = snap_and_scale(PIP_HEIGHT * GOAT_SCALE)
    goat_blend = WORKING / "goat_highdetail_working.blend"
    save_blend(goat_blend)
    goat_renders = render_subject("goat_final")

    pair = render_pair(pip_blend, goat_blend)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "blender": bpy.app.version_string,
        "pip_foundation": str(PIP_PRISM),
        "goat_foundation": str(GOAT_PRISM),
        "primitive_rebuild_used": False,
        "pip": pip_info,
        "goat": goat_info,
        "pair": pair,
        "renders": pip_renders + goat_renders + pair["renders"],
        "outputs": {
            "pip_blend": str(pip_blend.relative_to(REPO_ROOT)),
            "goat_blend": str(goat_blend.relative_to(REPO_ROOT)),
        },
    }
    (REPORTS / "FOUNDATION_IMPORT.json").write_text(json.dumps(report, indent=2) + "\n")
    (REPO_ROOT / "artifacts/theatrical-v2/final-character-production/validation/FOUNDATION_IMPORT.json").write_text(
        json.dumps(report, indent=2) + "\n"
    )
    print(json.dumps({"ok": True, "ratio": pair["ratio"], "renders": len(report["renders"])}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
