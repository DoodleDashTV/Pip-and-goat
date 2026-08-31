"""SHOT_02 cinematic hero V5 — recovered-asset rebuild.

Assembles TJ_HERO_V5_WORLD from Botaniq Full, EcoKit rocks, the reusable
riverbank/meadow systems, Louis mountains, and a receded Village cabin.
Does not stack on the failed V2/V3 visible world. Water physics stay locked.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

from cinematic_master_look_v1 import apply_cinematic_daylight, apply_compositor_finish
from runtime_roots_v1 import find_named, require_named, resolve_assets_root
from cinematic_meadow_v1 import meadow_payload, meadow_scatter_plan
from cinematic_riverbank_v1 import (
    WATER_Z,
    controls_payload,
    point_on_south_shore,
    riverbank_sample,
    rock_slots,
)
from memory_safe_asset_loader_v1 import append_named_objects, append_primary_group, sit_from_bound_box
from owned_building_audit import audit_summary


BOTANIQ_BASENAMES = {
    "willow_a": "bq_Tree_Salix-babylonica_A_summer.blend",
    "willow_b": "bq_Tree_Salix-babylonica_B_summer.blend",
    "beech_a": "bq_Tree_Fagus-sylvatica_A_summer.blend",
    "beech_b": "bq_Tree_Fagus-sylvatica_B_summer.blend",
    "hazel_a": "bq_Shrub_Corylus-avellana_A_spring-summer.blend",
    "hazel_b": "bq_Shrub_Corylus-avellana_B_spring-summer.blend",
    "fern_a": "bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn.blend",
    "fern_b": "bq_Plant_Dryopteris-carthusiana_B_spring-summer-autumn.blend",
    "fern_d": "bq_Plant_Dryopteris-carthusiana_D_spring-summer-autumn.blend",
    "carex_a": "bq_Grass_Carex-oshimensis_A_spring.blend",
    "carex_b": "bq_Grass_Carex-oshimensis_B_spring.blend",
    "festuca_a": "bq_Grass_Festuca_glauca_A_spring.blend",
    "festuca_b": "bq_Grass_Festuca_glauca_B_spring.blend",
    "moss_a": "bq_Moss_Rhytidiadelphus-squarrosus_A_spring-summer-autumn.blend",
    "moss_b": "bq_Moss_Rhytidiadelphus-squarrosus_B_spring-summer-autumn.blend",
}


def ROCK_BLEND() -> Path:
    return require_named(resolve_assets_root(), "Rock_Models.blend", kind="file")


def VILLAGE_NRM() -> Path:
    found = find_named(resolve_assets_root(), "Village (Textures)", kind="dir")
    if found is None:
        raise FileNotFoundError("Village textures directory missing under TIVVLEJOY_SCENERY_ASSETS_ROOT")
    return found


def BOTANIQ_SOURCES() -> dict:
    root = resolve_assets_root()
    out = {}
    for key, name in BOTANIQ_BASENAMES.items():
        found = find_named(root, name, kind="file")
        if found is None:
            raise FileNotFoundError(f"Botaniq source missing under assets root: {name}")
        out[key] = found
    return out

ROCK_NAMES = (
    "Rock_Model_Large_001", "Rock_Model_Large_003", "Rock_Model_Large_005",
    "Rock_Model_Large_007", "Rock_Model_Large_009",
    "Rock_Model_Small_5_001", "Rock_Model_Small_5_011", "Rock_Model_Small_5_021",
)

COMP_CAMERAS = {
    "A": {
        "name": "TJ_V5_COMP_A",
        "location": (2.10, -21.45, 3.02),
        "look": (-3.45, -10.7, 1.32),
        "lens": 34.0,
        "note": "creek-leading landscape",
    },
    "B": {
        "name": "TJ_V5_COMP_B",
        "location": (1.15, -18.85, 2.32),
        "look": (-3.75, -11.1, 0.82),
        "lens": 38.0,
        "note": "lower / stronger water foreground",
    },
    "C": {
        "name": "TJ_V5_COMP_C",
        "location": (3.15, -23.70, 3.68),
        "look": (-2.15, -8.2, 1.88),
        "lens": 30.0,
        "note": "wider meadow-cabin-mountain reveal",
    },
}

CROP_CAMERAS = {
    "FG": {
        "name": "TJ_V5_CROP_FG",
        "location": (1.42, -17.55, 1.70),
        "look": (-2.85, -13.85, -0.12),
        "lens": 42.0,
        "note": "creek + bank + Botaniq + rocks",
    },
    "MG": {
        "name": "TJ_V5_CROP_MG",
        "location": (-0.15, -12.40, 3.35),
        "look": (-13.2, 8.4, 2.55),
        "lens": 32.0,
        "note": "meadow + receded cabin + vegetation",
    },
    "BG": {
        "name": "TJ_V5_CROP_BG",
        "location": (2.45, -24.40, 5.05),
        "look": (-5.5, 22.0, 10.2),
        "lens": 28.0,
        "note": "forest + Louis mountain + atmosphere",
    },
}

LIGHT_MOODS = {
    "A": {
        "note": "warm morning",
        "sun": {"energy": 2.40, "angleDeg": 9.2, "eulerDeg": [34.0, 12.0, 62.0], "color": (1.0, 0.88, 0.70)},
        "skyFill": 500.0,
        "groundBounce": 480.0,
        "forestFill": 220.0,
        "creekFill": 130.0,
        "exposure": 0.32,
        "mistStart": 22.0,
        "mistDepth": 62.0,
        "hazeScale": 0.32,
    },
    "B": {
        "note": "late-afternoon adventure",
        "sun": {"energy": 3.85, "angleDeg": 5.6, "eulerDeg": [54.0, 8.0, -24.0], "color": (1.0, 0.80, 0.56)},
        "skyFill": 250.0,
        "groundBounce": 360.0,
        "forestFill": 145.0,
        "creekFill": 80.0,
        "exposure": 0.18,
        "mistStart": 16.0,
        "mistDepth": 50.0,
        "hazeScale": 0.40,
    },
    "C": {
        "note": "clean cinematic daylight",
        "sun": {"energy": 3.25, "angleDeg": 6.8, "eulerDeg": [44.0, 10.0, 32.0], "color": (1.0, 0.92, 0.78)},
        "skyFill": 390.0,
        "groundBounce": 410.0,
        "forestFill": 180.0,
        "creekFill": 110.0,
        "exposure": 0.26,
        "mistStart": 20.0,
        "mistDepth": 56.0,
        "hazeScale": 0.34,
    },
}

TREE_GROUPS = (
    # (species, xy, height_m, yaw, role)
    ("willow_a", (-4.85, -14.35), 7.8, 0.35, "hero"),
    ("willow_b", (-11.60, -12.80), 6.4, 1.15, "hero"),
    ("beech_a", (-16.40, -9.20), 8.6, 0.55, "support"),
    ("beech_b", (-14.10, -5.40), 7.1, 2.05, "support"),
    ("beech_a", (-18.20, -13.10), 6.0, -0.70, "support"),
    ("willow_b", (8.20, -8.60), 5.4, -1.10, "support"),
    ("beech_b", (-12.80, -16.40), 4.6, 1.70, "young"),
    ("beech_a", (-9.40, -6.80), 6.8, 0.90, "support"),
    ("hazel_a", (-8.90, -10.40), 2.4, 0.40, "understory"),
    ("hazel_b", (6.10, -9.10), 2.1, -0.85, "understory"),
    ("hazel_a", (-15.50, -7.20), 2.6, 1.25, "understory"),
)

FERN_PLAN = (
    (-5.40, 0.85, 0.85, 0.4),
    (-2.55, 0.70, 0.72, 1.5),
    (1.05, 0.90, 0.78, 2.1),
    (-8.20, 1.10, 0.66, 0.7),
    (-7.85, 1.40, 0.80, -0.4),
    (-3.60, 1.20, 0.58, 1.9),
    (3.20, 0.95, 0.62, -1.1),
    (-10.70, 0.75, 0.70, 0.2),
)


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def ensure_v5_collection() -> bpy.types.Collection:
    col = bpy.data.collections.get("TJ_HERO_V5_WORLD")
    if col is None:
        col = bpy.data.collections.new("TJ_HERO_V5_WORLD")
        bpy.context.scene.collection.children.link(col)
    return col


def link_v5(obj, col: bpy.types.Collection) -> None:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    col.objects.link(obj)


def hide_legacy_visuals() -> dict:
    hidden = {"v2": 0, "v3": 0, "carrier": 0, "trees": 0, "eco": 0, "lumps": 0, "nature": 0, "cabin_b": 0}
    for obj in list(bpy.data.objects):
        name = obj.name
        low = name.lower()
        if name.startswith("TJ_V5_") or name.startswith("bq_"):
            continue
        if name.startswith("TJ_River_") or name.startswith("TJ_Key") or name.startswith("TJ_Louis"):
            continue
        if "louis" in low or name.startswith("LP_"):
            continue
        if name.startswith("TJ_V2_"):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["v2"] += 1
            continue
        if name.startswith("TJ_V3_"):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["v3"] += 1
            continue
        if name == "TJ_Ground_ValleyCarrier":
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["carrier"] += 1
            continue
        if name.startswith("TJ_MeadowEco_"):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["eco"] += 1
        if any(name.startswith(prefix) for prefix in (
            "TJ_HeroMacroRock_", "TJ_HeroGravel_", "TJ_WaterlineStone_",
            "TJ_IsolineRock_", "TJ_WetIsland_", "TJ_FgBankRock", "TJ_HeroStone",
        )):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["lumps"] += 1
        village_tree = any(token in name for token in ("Tree01", "Tree02", "Tree03"))
        if village_tree or ("tree" in low and not name.startswith("TJ_")):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["trees"] += 1
        if any(token in name for token in ("Tree_Trunk_", "Tree_Canopy_", "Grass_Lg", "Grass_Sm", "Leafy_")):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["nature"] += 1
        if any(token in name for token in ("Cabin01B", "Cabin02B", "Cabin03B", "Cabin04B", "Cabin05B")):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["cabin_b"] += 1
        clutter = any(token in name for token in ("Cart01", "Fence01", "Gate01", "Door01", "Frame01"))
        if clutter:
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["cabin_b"] += 1
    v3 = bpy.data.collections.get("TJ_HERO_V3_WORLD")
    if v3 is not None:
        v3.hide_render = True
        v3.hide_viewport = True
    v2 = bpy.data.collections.get("TJ_HERO_V2_WORLD")
    if v2 is not None:
        v2.hide_render = True
        v2.hide_viewport = True
    _log("v5_legacy_hidden", **hidden)
    return hidden


def _append_blend_group(blend: Path) -> list:
    if not blend.exists():
        _log("v5_blend_missing", path=str(blend))
        return []
    receipt = append_primary_group(blend, hide_as_library=True)
    loaded = list(receipt.get("objects") or [])
    for obj in loaded:
        obj["tj_v5_lib"] = 1
        obj.location = (obj.location.x, obj.location.y - 900.0, obj.location.z - 80.0)
    _log(
        "v5_append",
        blend=blend.name,
        objects=len(loaded),
        images=len(receipt.get("newImageNames") or []),
        sourceImages=receipt.get("sourceImageCount"),
        explicitAllImages=False,
    )
    return loaded


def _largest_mesh(objs: list):
    meshes = [obj for obj in objs if obj.type == "MESH" and obj.data]
    if not meshes:
        return None
    return max(meshes, key=lambda obj: len(obj.data.vertices))


def _dup_group(loaded: list, loc, height: float, yaw: float, bury: float, col, name: str):
    hero = _largest_mesh(loaded)
    if hero is None:
        return None
    copies = []
    for src in loaded:
        obj = src.copy()
        obj.data = src.data
        obj.parent = None
        obj.matrix_parent_inverse.identity()
        bpy.context.scene.collection.objects.link(obj)
        obj.hide_render = False
        obj.hide_viewport = False
        if "tj_v5_lib" in obj:
            del obj["tj_v5_lib"]
        copies.append((src, obj))
    hero_copy = next(obj for src, obj in copies if src == hero)
    dim = max(float(hero.dimensions.z), 0.05)
    scale = height / dim
    for _src, obj in copies:
        obj.scale = (scale, scale, scale)
        obj.rotation_euler = (
            obj.rotation_euler.x,
            obj.rotation_euler.y,
            obj.rotation_euler.z + yaw,
        )
    for _src, obj in copies:
        if obj.parent is None:
            obj.matrix_world = obj.matrix_basis
    if hero.parent is None:
        hero.matrix_world = hero.matrix_basis
    hero_world = hero.matrix_world.copy()
    for src, obj in copies:
        if src.parent is None:
            src.matrix_world = src.matrix_basis
        rel = hero_world.inverted() @ src.matrix_world
        obj.matrix_world = hero_copy.matrix_world @ rel
    corners = []
    for _src, obj in copies:
        if obj.type != "MESH":
            continue
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    lowest = min((c.z for c in corners), default=0.0)
    delta = Vector((loc[0] - hero_copy.location.x, loc[1] - hero_copy.location.y, loc[2] - lowest - bury))
    for _src, obj in copies:
        obj.location += delta
        link_v5(obj, col)
        obj["tj_v5"] = 1
    hero_copy.name = name
    return hero_copy


def _append_objects(blend: Path, names: tuple[str, ...]) -> list:
    if not blend.exists():
        _log("v5_rock_blend_missing", path=str(blend))
        return []
    receipt = append_named_objects(blend, names, hide_as_library=True, library_park=(0.0, -800.0, -80.0))
    loaded = list(receipt.get("objects") or [])
    for obj in loaded:
        obj.parent = None
        obj.matrix_parent_inverse.identity()
        obj.location = (0.0, -800.0, -80.0)
    _log(
        "v5_rocks_appended",
        count=len(loaded),
        images=len(receipt.get("newImageNames") or []),
        sourceImages=receipt.get("sourceImageCount"),
        explicitAllImages=False,
    )
    return loaded


def _fit_scale(src, target: float, requested: float) -> float:
    dim = max(float(src.dimensions.x), float(src.dimensions.y), float(src.dimensions.z), 0.01)
    return (target * requested) / dim


def _base_offset(obj) -> float:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return min(c.z for c in corners)


def _dup_mesh(src, loc, scale: float, yaw: float, bury: float, col, name: str):
    if src is None:
        return None
    obj = src.copy()
    obj.data = src.data
    obj.parent = None
    obj.matrix_parent_inverse.identity()
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = False
    obj.hide_viewport = False
    if "tj_v5_lib" in obj:
        del obj["tj_v5_lib"]
    obj.matrix_world = Matrix.Identity(4)
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (0.15 * (hash(name) % 5 - 2), 0.12 * (hash(name) % 3 - 1), yaw)
    sit_from_bound_box(obj, loc, bury)
    obj.name = name
    obj["tj_v5"] = 1
    link_v5(obj, col)
    return obj


def build_hero_terrain(col: bpy.types.Collection) -> dict:
    mesh = bpy.data.meshes.new("TJ_V5_HeroTerrain")
    obj = bpy.data.objects.new("TJ_V5_HeroTerrain", mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    xs, ys = 168, 186
    x0, x1 = -18.0, 12.0
    y0, y1 = -25.5, 8.0
    verts = []
    colors = []
    for iy in range(ys):
        row = []
        ty = y0 + (y1 - y0) * iy / (ys - 1)
        for ix in range(xs):
            tx = x0 + (x1 - x0) * ix / (xs - 1)
            z, biome = riverbank_sample(tx, ty)
            row.append(bm.verts.new((tx, ty, z)))
            colors.append(_bank_color(z, biome))
        verts.append(row)
    color_layer = bm.loops.layers.color.new("biome")
    for iy in range(ys - 1):
        for ix in range(xs - 1):
            face = bm.faces.new((verts[iy][ix], verts[iy][ix + 1], verts[iy + 1][ix + 1], verts[iy + 1][ix]))
            for loop in face.loops:
                vx, vy = loop.vert.co.x, loop.vert.co.y
                # Color from this vertex, not one face-corner biome. No razor isoline.
                idx = int(round((vy - y0) / (y1 - y0) * (ys - 1))) * xs + int(round((vx - x0) / (x1 - x0) * (xs - 1)))
                idx = max(0, min(len(colors) - 1, idx))
                loop[color_layer] = colors[idx]
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    subdiv = obj.modifiers.new("TJ_V5_BankSmooth", "SUBSURF")
    subdiv.levels = 1
    subdiv.render_levels = 1
    subdiv.subdivision_type = "CATMULL_CLARK"
    obj.data.materials.append(_terrain_material())
    _log("v5_terrain_built", verts=xs * ys, subdiv=1)
    return {"verts": xs * ys, "system": "TJ_RIVERBANK_GENERATOR_V1", "subdiv": 1}


def _bank_color(z: float, biome: str) -> tuple[float, float, float, float]:
    """Continuous wet-to-earth-to-olive. Meadow green is vegetation, not a painted plane."""
    t = max(0.0, min(1.0, (z - WATER_Z) / 1.55))
    wet = (0.20, 0.14, 0.09)
    soil = (0.30, 0.20, 0.11)
    earth = (0.26, 0.22, 0.12)
    olive = (0.20, 0.24, 0.11)
    if t < 0.16:
        u = t / 0.16
        r = wet[0] * (1.0 - u) + soil[0] * u
        g = wet[1] * (1.0 - u) + soil[1] * u
        b = wet[2] * (1.0 - u) + soil[2] * u
    elif t < 0.55:
        u = (t - 0.16) / 0.39
        r = soil[0] * (1.0 - u) + earth[0] * u
        g = soil[1] * (1.0 - u) + earth[1] * u
        b = soil[2] * (1.0 - u) + earth[2] * u
    else:
        u = (t - 0.55) / 0.45
        r = earth[0] * (1.0 - u) + olive[0] * u
        g = earth[1] * (1.0 - u) + olive[1] * u
        b = earth[2] * (1.0 - u) + olive[2] * u
    if biome in {"gravel", "bed", "underwater"}:
        r, g, b = (0.30 * r + 0.18, 0.30 * g + 0.15, 0.30 * b + 0.11)
    return (r, g, b, 1.0)


def _terrain_material() -> bpy.types.Material:
    mat = bpy.data.materials.get("TJ_V5_Terrain") or bpy.data.materials.new("TJ_V5_Terrain")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    col = nodes.new("ShaderNodeVertexColor")
    col.layer_name = "biome"
    links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.80
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.16
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def load_botaniq_library() -> dict:
    library = {}
    for key, path in BOTANIQ_SOURCES().items():
        library[key] = _append_blend_group(path)
    _log("v5_botaniq_loaded", keys=[k for k, v in library.items() if v])
    return library


def plant_vegetation(library: dict, col: bpy.types.Collection) -> dict:
    planted = {"trees": 0, "ferns": 0, "meadow": 0}
    for i, (species, xy, height, yaw, role) in enumerate(TREE_GROUPS):
        group = library.get(species) or []
        if species.startswith("willow"):
            xy = point_on_south_shore(xy[0], offset=2.55)
        z, biome = riverbank_sample(xy[0], xy[1])
        if biome in {"bed", "underwater"}:
            continue
        obj = _dup_group(group, (xy[0], xy[1], max(z, WATER_Z + 0.05)), height, yaw, 0.14, col, f"TJ_V5_Tree_{role}_{i}")
        if obj is not None:
            planted["trees"] += 1
    fern_keys = [key for key in ("fern_a", "fern_b", "fern_d") if library.get(key)]
    bank_grass = (
        (-6.4, 0.55, 1.25, 0.2),
        (-3.8, 0.70, 1.45, 1.1),
        (-1.2, 0.45, 1.35, 2.0),
        (1.6, 0.60, 1.20, 0.6),
        (-8.8, 0.50, 1.30, 1.7),
        (3.8, 0.80, 1.15, -0.5),
        (-5.0, 0.35, 1.10, 0.9),
        (-0.2, 0.25, 1.40, 2.4),
    )
    for i, (x, offset, height, yaw) in enumerate(FERN_PLAN):
        if not fern_keys:
            break
        group = library[fern_keys[i % len(fern_keys)]]
        xy = point_on_south_shore(x, offset=offset)
        z, biome = riverbank_sample(xy[0], xy[1])
        if biome in {"bed", "underwater"}:
            continue
        obj = _dup_group(group, (xy[0], xy[1], z), height, yaw, 0.04, col, f"TJ_V5_Fern_{i}")
        if obj is not None:
            planted["ferns"] += 1
    carex = library.get("carex_b") or library.get("carex_a") or []
    for i, (x, offset, height, yaw) in enumerate(bank_grass):
        if not carex:
            break
        xy = point_on_south_shore(x, offset=offset)
        z, biome = riverbank_sample(xy[0], xy[1])
        if biome in {"bed", "underwater"}:
            continue
        obj = _dup_group(carex, (xy[0], xy[1], z + 0.02), height, yaw, 0.03, col, f"TJ_V5_BankGrass_{i}")
        if obj is not None:
            planted["meadow"] += 1
    wedge = meadow_scatter_plan((-9.5, 6.2, -21.2, -6.4), 0.95)
    far = meadow_scatter_plan((-14.0, 9.0, -6.2, 3.5), 1.85)
    plan = wedge + far
    plan.sort(key=lambda item: (item["x"] - 2.05) ** 2 + (item["y"] + 21.6) ** 2)
    kept = []
    for item in plan:
        dist2 = (item["x"] - 2.05) ** 2 + (item["y"] + 21.6) ** 2
        limit = 160 if dist2 < 14.0 ** 2 else 210
        if len(kept) < limit:
            kept.append(item)
    plan = kept
    for i, item in enumerate(plan):
        group = library.get(item["species"]) or []
        if not group:
            continue
        z, biome = riverbank_sample(item["x"], item["y"])
        if biome in {"bed", "underwater", "wet_shelf"}:
            continue
        zone = item["zone"]
        height = {
            "short_grass": 0.95,
            "medium_meadow": 1.35,
            "tall_pocket": 1.85,
            "bare_earth": 0.45,
            "forest_litter": 0.70,
            "fern_shrub": 1.10,
            "rocky_sparse": 0.55,
            "worn_open": 0.38,
        }.get(zone, 1.05)
        yaw = 0.37 * i
        obj = _dup_group(group, (item["x"], item["y"], z + 0.01), height, yaw, 0.02, col, f"TJ_V5_Meadow_{i}")
        if obj is not None:
            planted["meadow"] += 1
    _log("v5_vegetation_planted", **planted, meadowPlan=len(plan))
    return planted


def plant_rocks(rocks: list, library: dict, col: bpy.types.Collection) -> dict:
    planted = 0
    moss_keys = [key for key in ("moss_a", "moss_b", "fern_a") if library.get(key)]
    for i, (x, y, scale, bury, role) in enumerate(rock_slots()):
        if not rocks:
            break
        src = rocks[i % len(rocks)]
        z, _biome = riverbank_sample(x, y)
        if role == "underwater":
            z = min(z, WATER_Z - 0.08)
        elif role == "waterline":
            z = WATER_Z - 0.02
        fitted = _fit_scale(src, 1.65, scale)
        yaw = 0.55 * i + (0.8 if i % 2 else -0.4)
        obj = _dup_mesh(src, (x, y, z), fitted, yaw, bury, col, f"TJ_V5_Rock_{role}_{i}")
        if obj is None:
            continue
        obj["tj_wet"] = 1 if role in {"waterline", "underwater", "bed"} else 0
        planted += 1
        if role == "vegetated" and moss_keys:
            moss = library[moss_keys[i % len(moss_keys)]]
            _dup_group(moss, (x + 0.12, y - 0.08, z + 0.18), 0.22, yaw, 0.0, col, f"TJ_V5_RockMoss_{i}")
    _log("v5_rocks_planted", count=planted, nativeFitM=1.65)
    return {"count": planted, "nativeFitM": 1.65}


def recede_owned_cabin() -> dict:
    """Village Cabin04A is MIDGROUND only. Push it out of hero pixels."""
    moved = []
    hidden = []
    keep_tokens = ("building04_lod0", "roof04_lod0")
    hide_tokens = (
        "cabin01", "cabin02", "cabin03", "cabin05", "cabin04",
        "building01", "building02", "building03", "building04", "building05",
        "roof01", "roof02", "roof03", "roof04", "roof05",
        "cart01", "fence01", "gate01",
        "cabininterior", "logplug", "wallvoid", "windowrecess",
    )
    keep = []
    for obj in list(bpy.data.objects):
        low = obj.name.lower()
        if any(token in low for token in hide_tokens) and not any(token in low for token in keep_tokens):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden.append(obj.name)
            continue
        if any(token in low for token in keep_tokens):
            keep.append(obj)
    if keep:
        cx = sum(obj.location.x for obj in keep) / len(keep)
        cy = sum(obj.location.y for obj in keep) / len(keep)
        target = Vector((-20.4, 16.8, 0.0))
        z, _ = riverbank_sample(target.x, target.y)
        delta = Vector((target.x - cx, target.y - cy, z - min(obj.location.z for obj in keep)))
        for obj in keep:
            # LOD0 only if present
            low_name = obj.name.lower()
            if "lod" in low_name and "lod0" not in low_name:
                obj.hide_render = True
                obj.hide_viewport = True
                hidden.append(obj.name)
                continue
            if low_name in {"building04", "roof04"} and any("lod0" in other.name.lower() for other in keep):
                obj.hide_render = True
                obj.hide_viewport = True
                hidden.append(obj.name)
                continue
            obj.location += delta
            obj.hide_render = False
            obj.hide_viewport = False
            moved.append(obj.name)
    _log("v5_cabin_receded", moved=moved[:12], hidden=len(hidden), target=(-20.4, 16.8))
    return {
        "moved": moved,
        "hidden": hidden,
        "target": [-20.4, 16.8],
        **audit_summary(),
    }


def style_grade_botaniq() -> dict:
    """Art-direct Botaniq toward premium stylized CGI. Do not destroy maps."""
    touched = 0
    for mat in bpy.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        name = (mat.name or "").lower()
        images = [
            node.image.name.lower()
            for node in mat.node_tree.nodes
            if node.type == "TEX_IMAGE" and node.image
        ]
        botaniq_map = any("bq_" in img or "botaniq" in img for img in images)
        used_by_v5 = any(
            bool(obj.get("tj_v5")) and any(slot.material == mat for slot in obj.material_slots)
            for obj in bpy.data.objects
        )
        if not (name.startswith("bq_") or "botaniq" in name or "bq_" in name or botaniq_map or used_by_v5):
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        if any(node.type == "HUE_SAT" and node.get("tj_v5_grade") for node in nodes):
            continue
        hsv = nodes.new("ShaderNodeHueSaturation")
        hsv["tj_v5_grade"] = 1
        hsv.inputs["Saturation"].default_value = 0.84
        hsv.inputs["Value"].default_value = 1.02
        base = bsdf.inputs.get("Base Color")
        if base is not None and base.links:
            src = base.links[0].from_socket
            links.new(src, hsv.inputs["Color"])
            links.new(hsv.outputs["Color"], base)
        if "Roughness" in bsdf.inputs and not bsdf.inputs["Roughness"].links:
            bsdf.inputs["Roughness"].default_value = min(0.92, max(0.42, bsdf.inputs["Roughness"].default_value + 0.07))
        if "Specular IOR Level" in bsdf.inputs and not bsdf.inputs["Specular IOR Level"].links:
            bsdf.inputs["Specular IOR Level"].default_value = min(0.35, bsdf.inputs["Specular IOR Level"].default_value)
        touched += 1
    _log("v5_botaniq_style_grade", materials=touched)
    return {"materials": touched}


def install_real_hdri() -> str:
    _log("v5_hdri_kept_jpg", reason="hdr_importance_map_crushed_preview")
    return "sk2_jpg_kept"


def _make_camera(spec: dict) -> str:
    existing = bpy.data.objects.get(spec["name"])
    if existing is not None:
        return existing.name
    scene = bpy.context.scene
    bpy.ops.object.camera_add(location=spec["location"])
    cam = bpy.context.object
    cam.name = spec["name"]
    cam.data.lens = spec["lens"]
    cam.data.sensor_width = 32
    cam.data.dof.use_dof = False
    target = bpy.data.objects.new(cam.name + "_LOOK", None)
    scene.collection.objects.link(target)
    target.location = spec["look"]
    constraint = cam.constraints.new(type="TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    _log("v5_camera", **{k: spec[k] for k in spec})
    return cam.name


def setup_comp_cameras() -> list[str]:
    scene = bpy.context.scene
    for marker in scene.timeline_markers:
        marker.camera = None
    names = [_make_camera(spec) for spec in COMP_CAMERAS.values()]
    names.extend(_make_camera(spec) for spec in CROP_CAMERAS.values())
    return names


def apply_light_mood(mood: str) -> dict:
    cfg = LIGHT_MOODS[mood]
    apply_cinematic_daylight()
    sun = bpy.data.objects.get("TJ_KeySun")
    if sun and sun.type == "LIGHT":
        sun.data.energy = cfg["sun"]["energy"]
        sun.data.angle = math.radians(cfg["sun"]["angleDeg"])
        eul = cfg["sun"]["eulerDeg"]
        sun.rotation_euler = (math.radians(eul[0]), math.radians(eul[1]), math.radians(eul[2]))
        if hasattr(sun.data, "color"):
            sun.data.color = cfg["sun"]["color"]
    for name, key in (
        ("TJ_SkyFill", "skyFill"),
        ("TJ_GroundBounce", "groundBounce"),
        ("TJ_ForestFill", "forestFill"),
        ("TJ_CreekFill", "creekFill"),
    ):
        lamp = bpy.data.objects.get(name)
        if lamp and lamp.type == "LIGHT":
            lamp.data.energy = cfg[key]
    louis = bpy.data.objects.get("TJ_LouisFaceFill")
    if louis and louis.type == "LIGHT":
        louis.data.energy = 260.0
        louis.location = (1.0, 24.0, 15.0)
        if hasattr(louis.data, "color"):
            louis.data.color = (1.0, 0.90, 0.78)
    world = bpy.context.scene.world
    if world and hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = True
        world.mist_settings.start = cfg["mistStart"]
        world.mist_settings.depth = cfg["mistDepth"]
        world.mist_settings.falloff = "QUADRATIC"
    apply_compositor_finish()
    scene = bpy.context.scene
    if scene.node_tree:
        for node in scene.node_tree.nodes:
            if node.type == "MATH" and node.operation == "MULTIPLY":
                if abs(node.inputs[1].default_value - 0.50) < 0.02 or abs(node.inputs[1].default_value - 0.40) < 0.02:
                    node.inputs[1].default_value = cfg["hazeScale"]
    if hasattr(scene, "view_settings"):
        scene.view_settings.exposure = cfg["exposure"]
    _log("v5_light_mood", mood=mood, note=cfg["note"])
    return cfg


def apply_hero_rebuild_v5(collections: dict | None = None, mood: str = "C") -> dict:
    col = ensure_v5_collection()
    hidden = hide_legacy_visuals()
    terrain = build_hero_terrain(col)
    library = load_botaniq_library()
    rocks = _append_objects(ROCK_BLEND(), ROCK_NAMES)
    forest = plant_vegetation(library, col)
    planted_rocks = plant_rocks(rocks, library, col)
    cabin = recede_owned_cabin()
    grade = style_grade_botaniq()
    hdri = install_real_hdri()
    cams = setup_comp_cameras()
    light = apply_light_mood(mood)
    meadow = meadow_payload()
    bank = controls_payload()
    _log(
        "v5_rebuild_applied",
        trees=forest.get("trees"),
        meadow=forest.get("meadow"),
        rocks=planted_rocks.get("count"),
        hdri=hdri,
        cameras=cams,
        light=light.get("note"),
        building=cabin.get("status"),
        mountains="louis_retained_3dt_not_loaded",
    )
    return {
        "hidden": hidden,
        "terrain": terrain,
        "forest": forest,
        "rocks": planted_rocks,
        "cabin": cabin,
        "grade": grade,
        "hdri": hdri,
        "cameras": cams,
        "light": light.get("note"),
        "meadow": meadow,
        "riverbank": bank,
        "mountains": {"selected": "Louis", "threeDtTested": "style_inspect_only_not_loaded"},
    }
