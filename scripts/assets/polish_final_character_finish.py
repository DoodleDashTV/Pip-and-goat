#!/usr/bin/env python3
"""Raise Prism candidate materials/eyes toward the supplemental finish target.

Does not restart from primitives. Does not stretch fused wings or satchel.
Does not copy the prediction-image hands-on-hips pose. Multi-view sheets
remain binding for identity and laterality.

  LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \\
    /usr/local/bin/blender -b -noaudio -P scripts/assets/polish_final_character_finish.py
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "assets"))

from build_final_character_production import (  # noqa: E402
    CHAR_LEFT,
    FACING,
    add_camera,
    append_blend,
    bounds,
    khronos,
    meshes,
    render_path,
    save_blend,
)
from theatrical_rebuild_common import assert_not_production_library  # noqa: E402
from theatrical_v1_common import principled_mat  # noqa: E402

HIRES = REPO / "theatrical-foundation/proposed/final-character-production/high-resolution"
PREVIEWS = REPO / "artifacts/theatrical-v2/final-character-production/clean"
CLOSE = REPO / "artifacts/theatrical-v2/final-character-production/closeups"
FEATURE = REPO / "artifacts/theatrical-v2/final-character-production/feature"
REPORTS = REPO / "theatrical-foundation/proposed/final-character-production/reports"


def mesh_obj():
    found = meshes()
    if not found:
        raise RuntimeError("no mesh")
    return found[0]


def color_image():
    for img in bpy.data.images:
        if img.size[0] > 64 and "color" in img.name.lower() and "normal" not in img.name.lower():
            return img
    images = [img for img in bpy.data.images if img.size[0] > 64]
    return max(images, key=lambda img: img.size[0] * img.size[1]) if images else None


def sample_colors(obj, img, size=192):
    work = img.copy()
    work.scale(size, size)
    pixels = work.pixels[:]
    uv = obj.data.uv_layers.active.data
    acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0])
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            vid = obj.data.loops[li].vertex_index
            u, v = uv[li].uv
            x = min(max(int(u * size) % size, 0), size - 1)
            y = min(max(int(v * size) % size, 0), size - 1)
            i = (y * size + x) * 4
            acc[vid][0] += pixels[i]
            acc[vid][1] += pixels[i + 1]
            acc[vid][2] += pixels[i + 2]
            acc[vid][3] += 1
    colors = {vid: (r / n, g / n, b / n) for vid, (r, g, b, n) in acc.items() if n}
    bpy.data.images.remove(work)
    return colors


def polish_material(kind: str) -> dict:
    mat = next(iter(bpy.data.materials), None)
    if mat is None or not mat.use_nodes:
        return {"skipped": True}
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return {"skipped": True, "reason": "no principled"}
    color_tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and "color" in n.image.name.lower()), None)

    def set_in(name, value):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value
            return True
        return False

    set_in("Sheen Weight", 0.46 if kind == "goat" else 0.40)
    set_in("Sheen Roughness", 0.34 if kind == "goat" else 0.30)
    if "Sheen Tint" in bsdf.inputs:
        bsdf.inputs["Sheen Tint"].default_value = (0.92, 0.78, 0.48, 1.0) if kind == "goat" else (0.95, 0.82, 0.28, 1.0)
    set_in("Subsurface Weight", 0.18 if kind == "goat" else 0.14)
    if "Subsurface Radius" in bsdf.inputs:
        bsdf.inputs["Subsurface Radius"].default_value = (0.85, 0.48, 0.22)
    set_in("Coat Weight", 0.08)
    set_in("Coat Roughness", 0.18)
    set_in("Specular IOR Level", 0.58)
    set_in("IOR", 1.45)

    # Slightly soften chalky ORM roughness without rewriting the map.
    rough_links = [lk for lk in nt.links if lk.to_node == bsdf and lk.to_socket.name == "Roughness"]
    if rough_links:
        src = rough_links[0].from_socket
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 0.82
        mul.location = (-180, -80)
        nt.links.new(src, mul.inputs[0])
        nt.links.new(mul.outputs[0], bsdf.inputs["Roughness"])

    hsv = None
    if color_tex is not None:
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.location = (-360, 220)
        if kind == "pip":
            # Gentle warm chartreuse. Not the rejected neon lift.
            hsv.inputs["Hue"].default_value = 0.492
            hsv.inputs["Saturation"].default_value = 1.06
            hsv.inputs["Value"].default_value = 1.035
        else:
            hsv.inputs["Hue"].default_value = 0.498
            hsv.inputs["Saturation"].default_value = 1.03
            hsv.inputs["Value"].default_value = 1.02
        color_links = [lk for lk in nt.links if lk.from_node == color_tex and lk.to_node == bsdf]
        for lk in color_links:
            nt.links.remove(lk)
        nt.links.new(color_tex.outputs["Color"], hsv.inputs["Color"])
        nt.links.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])

    nmap = next((n for n in nt.nodes if n.type == "NORMAL_MAP"), None)
    if nmap is not None and "Strength" in nmap.inputs:
        nmap.inputs["Strength"].default_value = 1.12 if kind == "goat" else 1.08

    return {
        "material": mat.name,
        "sheen": 0.46 if kind == "goat" else 0.40,
        "sss": 0.18 if kind == "goat" else 0.14,
        "hsv": None if hsv is None else [hsv.inputs["Hue"].default_value, hsv.inputs["Saturation"].default_value, hsv.inputs["Value"].default_value],
    }


def eye_centroids(obj, colors, kind: str) -> list[Vector]:
    mw = obj.matrix_world
    mn, mx = bounds([obj])
    height = mx.z - mn.z
    pts = []
    for vid, col in colors.items():
        r, g, b = col
        w = mw @ obj.data.vertices[vid].co
        if kind == "pip":
            if g > 0.16 and g > r + 0.04 and r < 0.38 and b < 0.28 and w.z > height * 0.68 and w.x > 0.05:
                pts.append(w)
        else:
            if 0.18 < r < 0.62 and 0.12 < g < 0.48 and b < 0.22 and w.z > height * 0.70 and w.x > 0.04 and abs(w.y) > 0.04:
                # Amber iris, not the cinnamon patch (patch is redder and larger).
                if r < g + 0.22:
                    pts.append(w)
    if len(pts) < 20:
        return []
    left = [p for p in pts if p.y >= 0]
    right = [p for p in pts if p.y < 0]
    out = []
    for group in (left, right):
        if len(group) < 8:
            continue
        out.append(sum(group, Vector()) / len(group))
    return out


def add_corneas(centers: list[Vector], radius: float, name: str) -> int:
    if not centers:
        return 0
    cornea = principled_mat(
        f"{name}_Cornea",
        (0.96, 0.98, 1.0),
        roughness=0.045,
        specular=0.72,
        coat=0.42,
        coat_rough=0.05,
    )
    if "Transmission Weight" in cornea.node_tree.nodes["Principled BSDF"].inputs:
        cornea.node_tree.nodes["Principled BSDF"].inputs["Transmission Weight"].default_value = 0.22
    highlight = principled_mat(
        f"{name}_Catch",
        (1.0, 1.0, 1.0),
        roughness=0.04,
        specular=0.8,
        coat=0.5,
        emission=0.35,
    )
    count = 0
    for i, center in enumerate(centers):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=radius, location=center + FACING * (radius * 0.18))
        sph = bpy.context.active_object
        sph.name = f"{name}_Cornea_{i}"
        sph.data.materials.append(cornea)
        for poly in sph.data.polygons:
            poly.use_smooth = True
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=radius * 0.13, location=center + FACING * (radius * 0.55) + Vector((0.0, radius * 0.18, radius * 0.16)))
        catch = bpy.context.active_object
        catch.name = f"{name}_Catch_{i}"
        catch.data.materials.append(highlight)
        count += 2
    return count


def clear_lights():
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj, do_unlink=True)


def feature_lights():
    """Warm theatrical presentation. Does not replace albedo."""
    khronos()
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("FeatureWorld")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.93, 0.88, 0.80, 1.0)
    bg.inputs["Strength"].default_value = 0.78
    clear_lights()
    key = bpy.data.lights.new("FeatureKey", "SUN")
    key.energy = 2.55
    key.color = (1.0, 0.96, 0.88)
    key_obj = bpy.data.objects.new("FeatureKey", key)
    scene.collection.objects.link(key_obj)
    key_obj.rotation_euler = (0.72, 0.12, 0.38)
    fill = bpy.data.lights.new("FeatureFill", "SUN")
    fill.energy = 0.58
    fill.color = (0.92, 0.94, 1.0)
    fill_obj = bpy.data.objects.new("FeatureFill", fill)
    scene.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (1.05, -0.48, 3.15)
    rim = bpy.data.lights.new("FeatureRim", "SUN")
    rim.energy = 0.42
    rim.color = (1.0, 0.90, 0.78)
    rim_obj = bpy.data.objects.new("FeatureRim", rim)
    scene.collection.objects.link(rim_obj)
    rim_obj.rotation_euler = (0.40, 0.85, 2.40)
    if hasattr(scene.eevee, "use_raytracing"):
        scene.eevee.use_raytracing = True


def shoot(name: str, loc: Vector, focus: Vector, ortho: float, dest: Path, samples: int = 24):
    cam = add_camera(name, loc, focus, ortho)
    bpy.context.scene.camera = cam
    render_path(dest, samples=samples)
    return str(dest.relative_to(REPO))


def render_turnaround(stem: str, dest_dir: Path) -> list[str]:
    feature_lights()
    mn, mx = bounds()
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    radius = max(mx.x - mn.x, mx.y - mn.y, height) * 1.45
    views = {
        "front": (center + FACING * radius, center + Vector((0, 0, height * 0.02)), height * 1.28),
        "back": (center - FACING * radius, center + Vector((0, 0, height * 0.02)), height * 1.28),
        "side": (center + CHAR_LEFT * radius, center + Vector((0, 0, height * 0.02)), height * 1.28),
        "three_quarter": (
            center + (FACING * 0.72 + CHAR_LEFT * 0.72) * radius,
            center + Vector((0, 0, height * 0.02)),
            height * 1.32,
        ),
        "face": (
            center + FACING * (height * 0.85) + Vector((0, 0, height * 0.56)),
            center + Vector((0, 0, height * 0.58)),
            height * 0.52,
        ),
    }
    written = []
    dest_dir.mkdir(parents=True, exist_ok=True)
    for name, (loc, focus, ortho) in views.items():
        dest = dest_dir / f"{stem}_{name}.png"
        written.append(shoot(f"{stem}_{name}", loc, focus, ortho, dest))
    return written


def render_closeups(kind: str, obj) -> list[str]:
    feature_lights()
    mn, mx = bounds([obj])
    height = mx.z - mn.z
    written = []
    CLOSE.mkdir(parents=True, exist_ok=True)
    if kind == "pip":
        shots = {
            "pip_strap": (Vector((0.22, 0.12, height * 0.42)), height * 0.62),
            "pip_wing": (Vector((0.05, 0.32, height * 0.40)), height * 0.70),
            "pip_crest": (Vector((0.08, 0.00, height * 0.92)), height * 0.38),
            "pip_eye": (Vector((0.28, 0.10, height * 0.78)), height * 0.28),
        }
    else:
        shots = {
            "goat_eye_patch": (Vector((0.30, 0.16, height * 0.80)), height * 0.32),
            "goat_back_mark": (Vector((-0.28, 0.00, height * 0.58)), height * 0.55),
            "goat_horn": (Vector((0.10, 0.00, height * 0.96)), height * 0.36),
            "goat_compass": (Vector((0.32, 0.00, height * 0.68)), height * 0.30),
            "goat_fur": (Vector((0.30, 0.10, height * 0.76)), height * 0.28),
        }
    for name, (focus, ortho) in shots.items():
        if "back" in name:
            loc = focus - FACING * (ortho * 1.15)
        else:
            loc = focus + FACING * (ortho * 1.15)
        dest = CLOSE / f"{name}.png"
        written.append(shoot(name, loc, focus, ortho, dest, samples=28))
    return written


def polish_blend(path: Path, kind: str) -> dict:
    assert_not_production_library(path)
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    obj = mesh_obj()
    img = color_image()
    mat_notes = polish_material(kind)
    colors = sample_colors(obj, img) if img is not None else {}
    centers = eye_centroids(obj, colors, kind) if colors else []
    radius = 0.055 if kind == "pip" else 0.068
    cornea_n = add_corneas(centers, radius, kind.title())
    save_blend(path)
    turn = render_turnaround(f"{kind}_final", PREVIEWS)
    feature = render_turnaround(f"{kind}_feature", FEATURE)
    close = render_closeups(kind, obj)
    return {
        "blend": str(path.relative_to(REPO)),
        "material": mat_notes,
        "eye_centers": [list(c) for c in centers],
        "cornea_objects": cornea_n,
        "renders": turn + feature + close,
        "bytes": path.stat().st_size,
    }


def render_pair(pip_blend: Path, goat_blend: Path) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    pips = append_blend(pip_blend)
    goats = append_blend(goat_blend)
    pip_meshes = [obj for obj in pips if obj.type == "MESH"]
    goat_meshes = [obj for obj in goats if obj.type == "MESH"]
    for obj in pip_meshes:
        obj.location.y -= 0.95
    for obj in goat_meshes:
        obj.location.y += 1.15
    bpy.context.view_layer.update()
    feature_lights()
    both = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    mn, mx = bounds(both)
    center = (mn + mx) * 0.5
    height = max(mx.z - mn.z, 0.001)
    span = max(mx.x - mn.x, mx.y - mn.y, height)
    written = []
    views = {
        "front": (center + FACING * span * 1.35, max(span * 1.15, height * 1.72)),
        "three_quarter": (
            center + (FACING * 0.75 + CHAR_LEFT * 0.75) * span * 1.25,
            max(span * 1.20, height * 1.78),
        ),
        "side": (center + CHAR_LEFT * span * 1.35, max(span * 1.15, height * 1.75)),
    }
    for name, (loc, ortho) in views.items():
        dest = PREVIEWS / f"pair_{name}.png"
        written.append(shoot(f"pair_{name}", loc, center + Vector((0, 0, height * 0.02)), ortho, dest, samples=28))
        dest_f = FEATURE / f"pair_{name}.png"
        written.append(shoot(f"pair_feature_{name}", loc, center + Vector((0, 0, height * 0.02)), ortho, dest_f, samples=28))
    ph = bounds(pip_meshes)
    gh = bounds(goat_meshes)
    pip_h = ph[1].z - ph[0].z
    goat_h = gh[1].z - gh[0].z
    return {
        "renders": written,
        "pip_height": pip_h,
        "goat_height": goat_h,
        "ratio": goat_h / pip_h if pip_h else 0.0,
        "goat_pose": "neutral — prediction-image hands-on-hips not copied",
    }


def main() -> int:
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    CLOSE.mkdir(parents=True, exist_ok=True)
    FEATURE.mkdir(parents=True, exist_ok=True)
    pip_blend = HIRES / "pip_highres_candidate.blend"
    goat_blend = HIRES / "goat_highres_candidate.blend"
    pip = polish_blend(pip_blend, "pip")
    goat = polish_blend(goat_blend, "goat")
    pair = render_pair(pip_blend, goat_blend)
    report = {
        "approved": False,
        "canonical_mutated": False,
        "theatrical_bound": False,
        "merge": False,
        "paid_resources": False,
        "primitive_rebuild_used": False,
        "prediction_pose_copied": False,
        "completion_claimed_from_lighting_only": False,
        "blender": bpy.app.version_string,
        "pip": pip,
        "goat": goat,
        "pair": pair,
        "supplemental_target": "attached pair CGI image controls polish/finish only; multi-view sheets remain identity authority",
    }
    (REPORTS / "STAGE_FINISH_POLISH.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "ok": True,
        "ratio": pair["ratio"],
        "pip_eyes": pip["eye_centers"],
        "goat_eyes": goat["eye_centers"],
        "pip_bytes": pip["bytes"],
        "goat_bytes": goat["bytes"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
