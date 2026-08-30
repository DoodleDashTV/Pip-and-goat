#!/usr/bin/env python3
"""Isolated A–F component diagnostics. Does not assemble a full hero world.

No cinematic_valley_world_v1 assemble. No paid compute. No purchases.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

from cinematic_louis_apron_v1 import apron_z_cut, should_remove_apron_vert
from cinematic_meadow_v2 import meadow_v2_payload, meadow_v2_plan
from cinematic_hero_v3_land import channel_profile
from cinematic_riverbank_v1 import (
    DEFAULT_FILM,
    WATER_Z,
    point_on_south_shore,
    riverbank_sample,
    shoreline_distance,
)
from cinematic_shoreline_v1 import TRANSITION_WIDTH, cue_slots, transition_color
from cinematic_style_unifier_v1 import apply_style_unifier
from cinematic_water_lock_v1 import WATER_LOCK, test_cfg
from cinematic_hero_rebuild_v5 import (
    BOTANIQ_SOURCES,
    ROCK_BLEND,
    ROCK_NAMES,
    _append_blend_group,
    _append_objects,
    _dup_group,
    _dup_mesh,
    _fit_scale,
)
from owned_building_audit import audit_summary

HDRI = Path("/tmp/o14-lookdev/expanded-original14/sky_hdri/HDRi_JPG_Pack/sk2/Image0001.jpg")
LOUIS_GRASSY = Path("/tmp/o14-lookdev/expanded-original14/background_mountains/Grassy.blend")
LOUIS_MEADOW = Path("/tmp/o14-lookdev/expanded-original14/background_mountains/Meadow.blend")
CABIN = Path(
    "/tmp/o14-lookdev/expanded-original14/village_blender/Village (Blender 4.2.2)/Cabin04A.blend"
)
OUT_DEFAULT = Path("/workspace/artifacts/tivvlejoy-scenery-showcase-30s/cinematic-component-recovery-v6")
RENDER_RES = (540, 960)


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def _col(name: str) -> bpy.types.Collection:
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = RENDER_RES[0]
    scene.render.resolution_y = RENDER_RES[1]
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    if hasattr(scene, "view_settings"):
        scene.view_settings.view_transform = "AgX"
        try:
            scene.view_settings.look = "AgX - Base Contrast"
        except TypeError:
            scene.view_settings.look = "None"
        scene.view_settings.exposure = 0.26
    for marker in list(scene.timeline_markers):
        scene.timeline_markers.remove(marker)


def install_hdri(rot_z: float = 0.48, strength: float = 0.85) -> str:
    world = bpy.data.worlds.new("TJ_V6_World")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputWorld")
    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    env = nodes.new("ShaderNodeTexEnvironment")
    if HDRI.exists():
        env.image = bpy.data.images.load(str(HDRI))
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, rot_z)
    coord = nodes.new("ShaderNodeTexCoord")
    links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], env.inputs["Vector"])
    links.new(env.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])
    bpy.context.scene.world = world
    return str(HDRI) if HDRI.exists() else "missing"


def add_sun(energy: float, euler_deg: tuple[float, float, float], color=(1.0, 0.92, 0.78)) -> None:
    light = bpy.data.lights.new("TJ_V6_Sun", "SUN")
    light.energy = energy
    light.angle = math.radians(6.8)
    if hasattr(light, "color"):
        light.color = color
    obj = bpy.data.objects.new("TJ_V6_Sun", light)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = tuple(math.radians(v) for v in euler_deg)


def add_fill(name: str, loc, energy: float, size: float = 8.0, color=(1.0, 0.94, 0.86)) -> None:
    light = bpy.data.lights.new(name, "AREA")
    light.energy = energy
    light.size = size
    if hasattr(light, "color"):
        light.color = color
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc


def add_camera(name: str, loc, look, lens: float = 38.0) -> bpy.types.Object:
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_width = 32
    obj = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    target = bpy.data.objects.new(name + "_LOOK", None)
    bpy.context.scene.collection.objects.link(target)
    target.location = look
    con = obj.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    bpy.context.scene.camera = obj
    return obj


def _link(obj, col) -> None:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    col.objects.link(obj)


def build_strip_terrain(col, name: str, bounds, res, color_fn, z_fn=None) -> bpy.types.Object:
    x0, x1, y0, y1 = bounds
    xs, ys = res
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    verts = []
    colors = []
    for iy in range(ys):
        row = []
        ty = y0 + (y1 - y0) * iy / (ys - 1)
        for ix in range(xs):
            tx = x0 + (x1 - x0) * ix / (xs - 1)
            if z_fn:
                z = z_fn(tx, ty)
            else:
                z, _ = riverbank_sample(tx, ty)
            row.append(bm.verts.new((tx, ty, z)))
            colors.append(color_fn(tx, ty, z))
        verts.append(row)
    layer = bm.loops.layers.color.new("biome")
    for iy in range(ys - 1):
        for ix in range(xs - 1):
            face = bm.faces.new((verts[iy][ix], verts[iy][ix + 1], verts[iy + 1][ix + 1], verts[iy + 1][ix]))
            for loop in face.loops:
                vx, vy = loop.vert.co.x, loop.vert.co.y
                iyy = int(round((vy - y0) / (y1 - y0) * (ys - 1)))
                ixx = int(round((vx - x0) / (x1 - x0) * (xs - 1)))
                idx = max(0, min(len(colors) - 1, iyy * xs + ixx))
                loop[layer] = colors[idx]
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    subdiv = obj.modifiers.new("smooth", "SUBSURF")
    subdiv.levels = 1
    subdiv.render_levels = 1
    subdiv.subdivision_type = "CATMULL_CLARK"
    mat = bpy.data.materials.new(name + "_Mat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    vc = nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "biome"
    links.new(vc.outputs["Color"], bsdf.inputs["Base Color"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.78
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.14
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    obj.data.materials.append(mat)
    return obj


def build_water_prism(col, bounds, name="TJ_V6_Water") -> bpy.types.Object:
    """Closed 18 cm prism inside the real channel. Lock: thickness 0.18."""
    x0, x1, y0, y1 = bounds
    xs, ys = 48, 56
    thick = WATER_LOCK["prismM"]
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    top = []
    bot = []
    for iy in range(ys):
        ty = y0 + (y1 - y0) * iy / (ys - 1)
        trow = []
        brow = []
        for ix in range(xs):
            tx = x0 + (x1 - x0) * ix / (xs - 1)
            dist, _signed = channel_profile(tx, ty)
            emerge = shoreline_distance(tx, south=True)
            # Inset so the water edge is not a second traced silhouette.
            inside = dist < emerge * 0.96
            z_top = WATER_Z if inside else WATER_Z + 0.04
            trow.append(bm.verts.new((tx, ty, z_top)))
            brow.append(bm.verts.new((tx, ty, z_top - thick)))
        top.append(trow)
        bot.append(brow)
    for iy in range(ys - 1):
        for ix in range(xs - 1):
            bm.faces.new((top[iy][ix], top[iy][ix + 1], top[iy + 1][ix + 1], top[iy + 1][ix]))
            bm.faces.new((bot[iy][ix], bot[iy + 1][ix], bot[iy + 1][ix + 1], bot[iy][ix + 1]))
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def apply_locked_water_material(obj, cfg: dict) -> None:
    from cinematic_water_lock_v1 import assert_lock

    assert_lock(cfg)
    mat = bpy.data.materials.new(cfg["name"])
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    body = nodes.new("ShaderNodeBsdfPrincipled")
    body.inputs["Base Color"].default_value = (0.04, 0.07, 0.06, 1.0)
    body.inputs["Metallic"].default_value = cfg["metallic"]
    if "Specular IOR Level" in body.inputs:
        body.inputs["Specular IOR Level"].default_value = cfg["specular"]
    if "IOR" in body.inputs:
        body.inputs["IOR"].default_value = cfg["ior"]
    if "Transmission Weight" in body.inputs:
        body.inputs["Transmission Weight"].default_value = cfg["transmission"]
    if "Roughness" in body.inputs:
        body.inputs["Roughness"].default_value = 0.16
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.4
    if "Detail" in noise.inputs:
        noise.inputs["Detail"].default_value = 4.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = cfg["normalStrength"]
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], body.inputs["Normal"])
    links.new(body.outputs["BSDF"], out.inputs["Surface"])
    absorb = nodes.new("ShaderNodeVolumeAbsorption")
    absorb.inputs["Color"].default_value = cfg["volumeColor"]
    absorb.inputs["Density"].default_value = cfg["volumeDensity"]
    links.new(absorb.outputs["Volume"], out.inputs["Volume"])
    if hasattr(mat, "cycles"):
        try:
            mat.cycles.use_transparent_shadow = True
        except Exception:
            pass
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def build_creek_bed(col, bounds, cfg: dict) -> bpy.types.Object:
    def z_fn(x, y):
        z, biome = riverbank_sample(x, y)
        target = WATER_Z - cfg["bedDepth"]
        if biome in {"bed", "underwater"}:
            return min(z, target) if cfg["name"] == "WATER_TEST_B" else (z + target) * 0.5
        return z

    albedo = cfg["bedAlbedo"]

    def color_fn(x, y, z):
        dist, _ = channel_profile(x, y)
        silt = 0.5 + 0.5 * math.sin(x * 3.1 + y * 2.4)
        r = albedo[0] * (0.86 + 0.18 * silt) + 0.04 * math.sin(x * 7.0)
        g = albedo[1] * (0.86 + 0.16 * silt) + 0.03 * math.sin(y * 6.0)
        b = albedo[2] * (0.86 + 0.14 * silt)
        if dist > DEFAULT_FILM * 0.55:
            r, g, b = r * 0.92 + 0.04, g * 0.90 + 0.03, b * 0.88 + 0.02
        return (max(0.04, r), max(0.03, g), max(0.02, b), 1.0)

    obj = build_strip_terrain(col, "TJ_V6_Bed", bounds, (56, 64), color_fn, z_fn)
    mat = obj.data.materials[0]
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = cfg["bedRoughness"]
    return obj


def plant_bed_stones(col, rocks, bounds) -> int:
    if not rocks:
        return 0
    planted = 0
    slots = (
        (-6.4, -0.55, 0.42, 0.18),
        (-4.2, -0.70, 0.34, 0.20),
        (-2.1, -0.40, 0.48, 0.14),
        (0.3, -0.62, 0.30, 0.22),
        (2.1, -0.45, 0.36, 0.16),
        (-7.8, -0.28, 0.28, 0.10),
        (-1.0, -0.85, 0.52, 0.24),
        (3.6, -0.50, 0.32, 0.15),
        (-5.1, 0.05, 0.40, 0.08),
        (1.4, 0.12, 0.26, 0.06),
    )
    for i, (x, offset, scale, bury) in enumerate(slots):
        px, py = point_on_south_shore(x, offset=offset)
        z, _ = riverbank_sample(px, py)
        src = rocks[i % len(rocks)]
        fitted = _fit_scale(src, 1.65, scale)
        _dup_mesh(src, (px, py, z), fitted, 0.4 * i, bury, col, f"TJ_V6_BedStone_{i}")
        planted += 1
    return planted


def plant_shore_cues(col, rocks, library) -> dict:
    planted = {"stone": 0, "gravel": 0, "veg": 0}
    festuca = library.get("festuca_a") or library.get("carex_a") or []
    fern = library.get("fern_a") or []
    for i, (x, y, cue, scale) in enumerate(cue_slots()):
        z, biome = riverbank_sample(x, y)
        if "stone" in cue or cue == "underwater_bed":
            if rocks:
                src = rocks[i % len(rocks)]
                fitted = _fit_scale(src, 1.65, scale)
                bury = 0.22 if "submerged" in cue or cue == "underwater_bed" else 0.10
                _dup_mesh(src, (x, y, z), fitted, 0.55 * i, bury, col, f"TJ_V6_Shore_{cue}_{i}")
                planted["stone"] += 1
        elif "gravel" in cue or "soil" in cue:
            if rocks:
                src = rocks[(i + 3) % len(rocks)]
                fitted = _fit_scale(src, 1.65, scale * 0.55)
                _dup_mesh(src, (x, y, z), fitted, 1.1 * i, 0.16, col, f"TJ_V6_Shore_{cue}_{i}")
                planted["gravel"] += 1
        elif "grass" in cue:
            group = festuca or fern
            if group:
                _dup_group(group, (x, y, z), 0.70 + 0.2 * scale, 0.3 * i, 0.03, col, f"TJ_V6_ShoreRoot_{i}")
                planted["veg"] += 1
    # Sparse overhang just landward of the waterline.
    for i, x in enumerate((-5.8, -1.6, 2.4)):
        if not fern:
            break
        px, py = point_on_south_shore(x, offset=0.42)
        z, _ = riverbank_sample(px, py)
        _dup_group(fern, (px, py, z), 0.72, 0.8 * i, 0.02, col, f"TJ_V6_Overhang_{i}")
        planted["veg"] += 1
    return planted


def plant_tree_foil(col, library) -> int:
    group = library.get("beech_a") or library.get("willow_b") or []
    if not group:
        return 0
    px, py = point_on_south_shore(-3.2, offset=4.8)
    # Far / north-ish bank foil: keep off the camera-side waterline.
    z, _ = riverbank_sample(-4.2, -4.2)
    _dup_group(group, (-4.2, -4.2, max(z, WATER_Z + 0.2)), 7.2, 0.4, 0.12, col, "TJ_V6_TreeFoil")
    return 1


def apply_conservative_louis_clip(obj, south_y: float, z_frac: float = 0.16) -> dict:
    if obj.type != "MESH" or obj.data is None:
        return {"removed": 0}
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    bpy.context.view_layer.update()
    mw = obj.matrix_world
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    zs = [(mw @ v.co).z for v in bm.verts]
    if not zs:
        bm.free()
        return {"removed": 0}
    z_cut = apron_z_cut(min(zs), max(zs), z_frac)
    dead = [v for v in bm.verts if should_remove_apron_vert((mw @ v.co).y, (mw @ v.co).z, south_y=south_y, z_cut=z_cut)]
    removed = len(dead)
    if dead:
        bmesh.ops.delete(bm, geom=dead, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    _log("louis_apron_conservative", name=obj.name, southY=south_y, zCut=round(z_cut, 3), removed=removed)
    return {"removed": removed, "southY": south_y, "zCut": z_cut, "conservative": True}


def sit_louis(obj, peak_x: float, peak_y: float, scale: float, rot_z: float = 0.12) -> None:
    obj.parent = None
    obj.rotation_euler = (0.0, 0.0, rot_z)
    obj.scale = (scale, scale, scale)
    obj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    peak = None
    if obj.type == "MESH":
        peak = max((obj.matrix_world @ v.co for v in obj.data.vertices), key=lambda c: c.z, default=None)
    if peak is None:
        obj.location = (peak_x, peak_y, 0.0)
        return
    obj.location = (peak_x - peak.x, peak_y - peak.y, 0.0)
    if hasattr(obj, "visible_shadow"):
        obj.visible_shadow = False
    bpy.context.view_layer.update()
    zs = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    obj.location.z -= min(c.z for c in zs)


def load_named(blend: Path, names: tuple[str, ...]) -> list:
    if not blend.exists():
        _log("blend_missing", path=str(blend))
        return []
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        available = set(src.objects or [])
        dst.objects = [n for n in names if n in available]
        dst.images = list(src.images or [])
    loaded = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        obj.parent = None
        if obj.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(obj)
        loaded.append(obj)
    return loaded


def simple_ground(col, loc, size, color, name="TJ_V6_Ground") -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=8, y_segments=8, size=size)
    for v in bm.verts:
        v.co.z = loc[2]
        v.co.x += loc[0]
        v.co.y += loc[1]
    bm.to_mesh(mesh)
    bm.free()
    mat = bpy.data.materials.new(name + "_Mat")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.84
    obj.data.materials.append(mat)
    return obj


def render_png(path: Path, samples: int) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    _log("rendered", path=str(path), samples=samples)
    return path


def phone_size(src: Path, dest: Path, size=(180, 320)) -> Path:
    from PIL import Image

    dest.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src).convert("RGB")
    im = im.resize(size, Image.Resampling.LANCZOS)
    im.save(dest)
    return dest


def setup_common(cfg=None) -> None:
    reset_scene()
    cfg = cfg or test_cfg("C")
    install_hdri(cfg["hdriRotZ"])
    add_sun(cfg["sunEnergy"], cfg["sunEulerDeg"])
    add_fill("TJ_V6_SkyFill", (4.0, -8.0, 14.0), 380.0, 12.0)
    add_fill("TJ_V6_Bounce", (0.0, -12.0, 0.4), 220.0, 10.0, (0.86, 0.78, 0.62))


def component_shoreline(out: Path, samples: int) -> dict:
    setup_common(test_cfg("C"))
    col = _col("TJ_SHORELINE_TRANSITION_V1")
    bounds = (-10.0, 6.0, -16.5, -3.5)
    sx, sy = point_on_south_shore(-2.2, offset=0.0)

    def color_fn(x, y, z):
        return transition_color(x, y)

    build_strip_terrain(col, "TJ_V6_ShoreTerrain", bounds, (96, 110), color_fn)
    water = build_water_prism(col, bounds)
    apply_locked_water_material(water, test_cfg("C"))
    rocks = _append_objects(ROCK_BLEND, ROCK_NAMES)
    library = {k: _append_blend_group(BOTANIQ_SOURCES[k]) for k in ("festuca_a", "carex_a", "fern_a") if BOTANIQ_SOURCES[k].exists()}
    cues = plant_shore_cues(col, rocks, library)
    unify = apply_style_unifier()
    add_camera("TJ_V6_ShoreCam", (1.6, sy - 5.4, 1.55), (sx - 0.4, sy + 0.8, WATER_Z + 0.15), 42.0)
    full = out / "A_SHORELINE_TRANSITION.png"
    render_png(full, samples)
    phone = phone_size(full, out / "A_SHORELINE_TRANSITION_PHONE.png")
    return {
        "component": "shoreline",
        "system": "TJ_SHORELINE_TRANSITION_V1",
        "transitionWidthM": TRANSITION_WIDTH,
        "cues": cues,
        "style": unify,
        "path": str(full),
        "phone": str(phone),
    }


def component_water(out: Path, samples: int, which: str) -> dict:
    cfg = test_cfg(which)
    setup_common(cfg)
    col = _col(cfg["name"])
    bounds = (-9.0, 5.0, -15.5, -4.0)
    build_creek_bed(col, bounds, cfg)
    water = build_water_prism(col, bounds)
    apply_locked_water_material(water, cfg)
    rocks = _append_objects(ROCK_BLEND, ROCK_NAMES)
    stones = plant_bed_stones(col, rocks, bounds)
    foil = 0
    if cfg["treeFoil"]:
        library = {"beech_a": _append_blend_group(BOTANIQ_SOURCES["beech_a"])} if BOTANIQ_SOURCES["beech_a"].exists() else {}
        foil = plant_tree_foil(col, library)
        apply_style_unifier()
    sx, sy = point_on_south_shore(-2.0, offset=-0.35)
    add_camera("TJ_V6_WaterCam", (1.15, sy - 4.6, 1.72), (sx, sy + 0.6, WATER_Z - 0.05), 40.0)
    full = out / f"B_WATER_{cfg['name']}.png"
    render_png(full, samples)
    phone = phone_size(full, out / f"B_WATER_{cfg['name']}_PHONE.png")
    return {
        "component": "water",
        "test": cfg["name"],
        "note": cfg["note"],
        "lock": {k: cfg[k] for k in WATER_LOCK},
        "bedAlbedo": list(cfg["bedAlbedo"]),
        "volumeColor": list(cfg["volumeColor"]),
        "stones": stones,
        "treeFoil": foil,
        "path": str(full),
        "phone": str(phone),
    }


def component_meadow(out: Path, samples: int) -> dict:
    setup_common(test_cfg("C"))
    col = _col("TJ_MEADOW_SYSTEM_V2")
    bounds = (-8.0, 6.0, -18.0, -6.5)

    def color_fn(x, y, z):
        return (0.22, 0.24, 0.12, 1.0)

    def z_fn(x, y):
        z, biome = riverbank_sample(x, y)
        return z if biome not in {"bed", "underwater"} else WATER_Z + 0.08

    build_strip_terrain(col, "TJ_V6_MeadowGround", bounds, (72, 80), color_fn, z_fn)
    keys = ("festuca_a", "festuca_b", "carex_a", "carex_b", "fern_a")
    library = {k: _append_blend_group(BOTANIQ_SOURCES[k]) for k in keys if BOTANIQ_SOURCES[k].exists()}
    plan = meadow_v2_plan((-7.0, 5.0, -16.5, -7.2))
    planted = {role: 0 for role in ("foundation", "medium", "tall", "fern_margin")}
    for i, item in enumerate(plan):
        group = library.get(item["species"]) or library.get("festuca_a") or library.get("carex_a") or []
        if item["role"] == "fern_margin":
            group = library.get("fern_a") or group
        if not group:
            continue
        z, biome = riverbank_sample(item["x"], item["y"])
        if biome in {"bed", "underwater"}:
            continue
        _dup_group(group, (item["x"], item["y"], z), item["height"], 0.31 * i, 0.02, col, f"TJ_V6_Meadow_{item['role']}_{i}")
        planted[item["role"]] = planted.get(item["role"], 0) + 1
    unify = apply_style_unifier()
    add_camera("TJ_V6_MeadowCam", (2.2, -20.4, 2.55), (-2.4, -10.6, 0.85), 36.0)
    full = out / "C_MEADOW_SYSTEM_V2.png"
    render_png(full, samples)
    phone = phone_size(full, out / "C_MEADOW_SYSTEM_V2_PHONE.png")
    return {
        "component": "meadow",
        "system": "TJ_MEADOW_SYSTEM_V2",
        "payload": meadow_v2_payload(plan),
        "planted": planted,
        "style": unify,
        "path": str(full),
        "phone": str(phone),
    }


def component_vegetation(out: Path, samples: int) -> dict:
    setup_common(test_cfg("C"))
    col = _col("TJ_ENVIRONMENT_STYLE_UNIFIER_V1")
    simple_ground(col, ( -4.0, -12.0, 0.15), 14.0, (0.20, 0.22, 0.11))
    library = {}
    for key in ("beech_a", "beech_b", "willow_a"):
        if BOTANIQ_SOURCES[key].exists():
            library[key] = _append_blend_group(BOTANIQ_SOURCES[key])
    # Beech is the closest hero. Willow moves to support distance.
    if library.get("beech_a"):
        _dup_group(library["beech_a"], (-3.6, -12.4, 0.18), 8.2, 0.25, 0.10, col, "TJ_V6_HeroBeech")
    if library.get("beech_b"):
        _dup_group(library["beech_b"], (-7.4, -10.2, 0.18), 6.8, 1.1, 0.10, col, "TJ_V6_SupportBeech")
    if library.get("willow_a"):
        _dup_group(library["willow_a"], (6.8, -6.4, 0.18), 5.2, -0.8, 0.12, col, "TJ_V6_SupportWillow")
    unify = apply_style_unifier()
    add_camera("TJ_V6_VegCam", (1.8, -18.6, 2.35), (-3.4, -12.0, 3.4), 48.0)
    add_sun(2.6, (52.0, 6.0, 18.0), (1.0, 0.90, 0.72))
    full = out / "D_VEGETATION_STYLE.png"
    render_png(full, samples)
    phone = phone_size(full, out / "D_VEGETATION_STYLE_PHONE.png")
    return {
        "component": "vegetation",
        "heroSpecies": "Fagus-sylvatica_A_summer",
        "willowRole": "support",
        "style": unify,
        "path": str(full),
        "phone": str(phone),
    }


def component_mountain(out: Path, samples: int) -> dict:
    setup_common(test_cfg("C"))
    col = _col("TJ_V6_MOUNTAIN")
    simple_ground(col, (0.0, 8.0, 0.0), 40.0, (0.24, 0.22, 0.14), "TJ_V6_MountainFloor")
    loaded = load_named(LOUIS_GRASSY, ("LP_GrassyMountain1",))
    clip = {"removed": 0, "skipped": True}
    name = None
    if loaded:
        obj = loaded[0]
        name = obj.name
        sit_louis(obj, -1.2, 40.0, scale=0.26, rot_z=0.12)
        _link(obj, col)
        clip = apply_conservative_louis_clip(obj, south_y=16.0, z_frac=0.16)
        obj.hide_render = False
        obj.hide_viewport = False
    # Restrained aerial perspective AFTER geometry is correct. Not camouflage.
    world = bpy.context.scene.world
    if world and hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = True
        world.mist_settings.start = 28.0
        world.mist_settings.depth = 70.0
        world.mist_settings.falloff = "QUADRATIC"
    add_camera("TJ_V6_MtnCam", (2.45, -24.4, 5.05), (-1.2, 36.0, 10.2), 28.0)
    full = out / "E_MOUNTAIN_LOUIS.png"
    render_png(full, samples)
    phone = phone_size(full, out / "E_MOUNTAIN_LOUIS_PHONE.png")
    return {
        "component": "mountain",
        "source": name or "MISSING",
        "clip": clip,
        "atmosphere": "restrained_mist_after_geometry",
        "path": str(full),
        "phone": str(phone),
    }


def component_building(out: Path, samples: int) -> dict:
    setup_common(test_cfg("C"))
    col = _col("TJ_V6_BUILDING")
    simple_ground(col, (-12.0, 4.0, 0.05), 36.0, (0.22, 0.23, 0.12), "TJ_V6_CabinYard")
    loaded = load_named(CABIN, ("Building04_LOD0", "Roof04_LOD0"))
    placed = []
    target = Vector((-20.4, 16.8, 0.2))
    if loaded:
        cx = sum(o.location.x for o in loaded) / len(loaded)
        cy = sum(o.location.y for o in loaded) / len(loaded)
        cz = min(o.location.z for o in loaded)
        delta = target - Vector((cx, cy, cz))
        for obj in loaded:
            obj.location += delta
            _link(obj, col)
            obj.hide_render = False
            obj.hide_viewport = False
            placed.append(obj.name)
    add_camera("TJ_V6_CabinCam", (2.10, -21.45, 3.02), (-12.0, 8.0, 1.6), 34.0)
    full = out / "F_BUILDING_SUPPORTING.png"
    render_png(full, samples)
    phone = phone_size(full, out / "F_BUILDING_SUPPORTING_PHONE.png")
    audit = audit_summary()
    return {
        "component": "building",
        "placed": placed,
        "target": [-20.4, 16.8],
        "lockedVerdict": "REJECT_HERO / MIDGROUND_ACCEPTABLE",
        "status": audit.get("status"),
        "path": str(full),
        "phone": str(phone),
    }


def parse_args(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--component", default="all", choices=("shoreline", "water", "meadow", "vegetation", "mountain", "building", "all"))
    p.add_argument("--water-test", default="all", choices=("A", "B", "C", "all"))
    p.add_argument("--output-dir", default=str(OUT_DEFAULT))
    p.add_argument("--samples", type=int, default=32)
    p.add_argument("--resolution", default="540x960")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    global RENDER_RES
    RENDER_RES = tuple(int(x) for x in args.resolution.lower().split("x"))
    results = []
    wanted = ["shoreline", "water", "meadow", "vegetation", "mountain", "building"] if args.component == "all" else [args.component]
    for name in wanted:
        _log("component_start", name=name)
        if name == "shoreline":
            results.append(component_shoreline(out, args.samples))
        elif name == "water":
            tests = ("A", "B", "C") if args.water_test == "all" else (args.water_test,)
            for t in tests:
                results.append(component_water(out, args.samples, t))
        elif name == "meadow":
            results.append(component_meadow(out, args.samples))
        elif name == "vegetation":
            results.append(component_vegetation(out, args.samples))
        elif name == "mountain":
            results.append(component_mountain(out, args.samples))
        elif name == "building":
            results.append(component_building(out, args.samples))
    receipt = {
        "schema": "TIVVLEJOY_COMPONENT_RECOVERY_V6",
        "fullHeroAssembled": False,
        "paidCreate": 0,
        "livePods": [],
        "resolution": args.resolution,
        "samples": args.samples,
        "results": results,
    }
    (out / "COMPONENT_RECOVERY_V6.json").write_text(json.dumps(receipt, indent=2) + "\n")
    _log("component_recovery_done", count=len(results), out=str(out))
    return 0


if __name__ == "__main__":
    # Blender: --python this.py -- --component shoreline
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(argv))
