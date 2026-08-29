"""SHOT_02 cinematic hero V3 — source-fidelity rebuild.

Uses unused original EcoKit Flora/Rock .blend libraries (not the FBX
proxy Nature kit). Authors a clean hero terrain layer. Water physics stay locked.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

from cinematic_hero_v3_land import authored_height
from cinematic_master_look_v1 import apply_cinematic_daylight, apply_compositor_finish


FLORA_BLEND = Path(
    "/tmp/o14-v3-source/10-SRC_FOREST_STYLISED_ECOKIT/Stylised EcoKit/Flora_Mat&GN&Models.blend"
)
ROCK_BLEND = Path(
    "/tmp/o14-v3-source/10-SRC_FOREST_STYLISED_ECOKIT/Stylised EcoKit/Rock_Models.blend"
)
VILLAGE_NRM = Path("/tmp/o14-v3-source/02-SRC_VILLAGE_TEXTURES_ZIP/Village (Textures)")
HDRI_HDR = Path("/tmp/o14-v3-source/08-SRC_SKY_HDRI_JPG_PACK/HDRi_JPG_Pack/sk2/0001.hdr")

COMP_CAMERAS = {
    "A": {
        "name": "TJ_V3_COMP_A",
        "location": (2.05, -21.6, 3.05),
        "look": (-3.35, -10.6, 1.45),
        "lens": 32.0,
        "note": "creek-leading landscape",
    },
    "B": {
        "name": "TJ_V3_COMP_B",
        "location": (1.35, -18.4, 2.28),
        "look": (-3.90, -10.0, 0.95),
        "lens": 35.0,
        "note": "lower / stronger water foreground",
    },
    "C": {
        "name": "TJ_V3_COMP_C",
        "location": (3.10, -23.2, 3.85),
        "look": (-2.40, -9.2, 1.85),
        "lens": 30.0,
        "note": "stronger forest-cabin-mountain reveal",
    },
}

LIGHT_MOODS = {
    "A": {
        "note": "warm morning",
        "sun": {"energy": 2.55, "angleDeg": 9.0, "eulerDeg": [34.0, 12.0, 62.0], "color": (1.0, 0.88, 0.70)},
        "skyFill": 520.0,
        "groundBounce": 500.0,
        "forestFill": 240.0,
        "creekFill": 120.0,
        "exposure": 0.36,
        "mistStart": 20.0,
        "mistDepth": 58.0,
        "hazeScale": 0.36,
    },
    "B": {
        "note": "late-afternoon adventure",
        "sun": {"energy": 4.20, "angleDeg": 5.4, "eulerDeg": [54.0, 8.0, -24.0], "color": (1.0, 0.80, 0.56)},
        "skyFill": 260.0,
        "groundBounce": 380.0,
        "forestFill": 150.0,
        "creekFill": 75.0,
        "exposure": 0.20,
        "mistStart": 14.0,
        "mistDepth": 48.0,
        "hazeScale": 0.44,
    },
    "C": {
        "note": "clean cinematic daylight",
        "sun": {"energy": 3.55, "angleDeg": 6.8, "eulerDeg": [44.0, 10.0, 32.0], "color": (1.0, 0.92, 0.78)},
        "skyFill": 410.0,
        "groundBounce": 430.0,
        "forestFill": 190.0,
        "creekFill": 95.0,
        "exposure": 0.28,
        "mistStart": 18.0,
        "mistDepth": 52.0,
        "hazeScale": 0.38,
    },
}

TREE_NAMES = (
    "Tree_1_001", "Tree_1_003", "Tree_2_001", "Tree_3_001", "Tree_5_001",
)
FLORA_NAMES = (
    "Fern_1_001", "Fern_2_001", "Bushes_1_001", "Grass_3_001", "Grass_8_001",
)
ROCK_NAMES = (
    "Rock_Model_Large_001", "Rock_Model_Large_003", "Rock_Model_Large_005",
    "Rock_Model_Large_007", "Rock_Model_Large_009",
    "Rock_Model_Small_5_001", "Rock_Model_Small_5_011", "Rock_Model_Small_5_021",
)


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def ensure_v3_collection() -> bpy.types.Collection:
    col = bpy.data.collections.get("TJ_HERO_V3_WORLD")
    if col is None:
        col = bpy.data.collections.new("TJ_HERO_V3_WORLD")
        bpy.context.scene.collection.children.link(col)
    return col


def link_v3(obj, col: bpy.types.Collection) -> None:
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    col.objects.link(obj)


def hide_legacy_visuals() -> dict:
    hidden = {"v2": 0, "trees": 0, "eco": 0, "lumps": 0, "nature": 0}
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        name = obj.name
        low = name.lower()
        if name.startswith("TJ_V3_"):
            continue
        if name.startswith("TJ_V2_"):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["v2"] += 1
            continue
        village_tree = any(token in name for token in ("Tree01", "Tree02", "Tree03", "Tree01.", "Tree02.", "Tree03."))
        if village_tree or ("tree" in low and "louis" not in low and not name.startswith("TJ_")):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["trees"] += 1
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
        if any(token in name for token in ("Tree_Trunk_", "Tree_Canopy_", "Grass_Lg", "Grass_Sm", "Leafy_")):
            if not name.startswith("TJ_V3_"):
                obj.hide_render = True
                obj.hide_viewport = True
                hidden["nature"] += 1
    _log("v3_legacy_hidden", **hidden)
    return hidden


def _append_objects(blend: Path, names: tuple[str, ...]) -> list:
    if not blend.exists():
        _log("v3_blend_missing", path=str(blend))
        return []
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        available = set(src.objects or [])
        dst.objects = [name for name in names if name in available]
        missing = [name for name in names if name not in available]
        if missing:
            _log("v3_append_missing", blend=blend.name, missing=missing[:12])
    loaded = []
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        obj.hide_render = True
        obj.hide_viewport = True
        obj["tj_v3_lib"] = 1
        loaded.append(obj)
    _log("v3_appended", blend=blend.name, count=len(loaded), names=[o.name for o in loaded])
    return loaded


def _base_offset(obj) -> float:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return min(c.z for c in corners)


def _dup(src, loc, scale: float, yaw: float, bury: float = 0.0):
    if src is None:
        return None
    obj = src.copy()
    obj.data = src.data
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = False
    obj.hide_viewport = False
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (0.0, 0.0, yaw)
    obj.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    base = _base_offset(obj)
    obj.location = (loc[0], loc[1], loc[2] - base - bury)
    return obj


def build_hero_terrain(col: bpy.types.Collection) -> dict:
    mesh = bpy.data.meshes.new("TJ_V3_HeroTerrain")
    obj = bpy.data.objects.new("TJ_V3_HeroTerrain", mesh)
    col.objects.link(obj)
    bm = bmesh.new()
    xs = 42
    ys = 48
    x0, x1 = -16.0, 11.0
    y0, y1 = -24.5, 5.5
    verts = []
    biomes = []
    for iy in range(ys):
        row = []
        ty = y0 + (y1 - y0) * iy / (ys - 1)
        for ix in range(xs):
            tx = x0 + (x1 - x0) * ix / (xs - 1)
            z, biome = authored_height(tx, ty)
            row.append(bm.verts.new((tx, ty, z)))
            biomes.append(biome)
        verts.append(row)
    color_layer = bm.loops.layers.color.new("biome")
    biome_rgba = {
        "bed": (0.18, 0.14, 0.10, 1.0),
        "gravel": (0.30, 0.26, 0.20, 1.0),
        "soil": (0.28, 0.16, 0.09, 1.0),
        "path": (0.34, 0.24, 0.14, 1.0),
        "short": (0.30, 0.38, 0.16, 1.0),
        "lush": (0.18, 0.34, 0.10, 1.0),
    }
    for iy in range(ys - 1):
        for ix in range(xs - 1):
            face = bm.faces.new((verts[iy][ix], verts[iy][ix + 1], verts[iy + 1][ix + 1], verts[iy + 1][ix]))
            a = biome_rgba[biomes[iy * xs + ix]]
            for loop in face.loops:
                loop[color_layer] = a
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj.data.materials.append(_terrain_material())
    _log("v3_terrain_built", verts=xs * ys)
    return {"verts": xs * ys}


def _terrain_material() -> bpy.types.Material:
    mat = bpy.data.materials.get("TJ_V3_Terrain") or bpy.data.materials.new("TJ_V3_Terrain")
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
        bsdf.inputs["Roughness"].default_value = 0.78
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.18
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def plant_forest(library: dict, col: bpy.types.Collection) -> dict:
    trees = library.get("trees") or []
    ferns = library.get("ferns") or []
    bushes = library.get("bushes") or []
    grass = library.get("grass") or []
    planted = []
    # Designed grove — left of creek, not a wall, mountain gap kept open.
    tree_plan = (
        (0, (-14.8, -11.2), 0.40, 0.35),
        (2, (-17.6, -7.4), 0.46, 1.20),
        (1, (-12.4, -6.0), 0.32, 2.10),
        (3, (-16.2, -14.8), 0.28, 0.80),
        (4, (-19.4, -10.6), 0.38, -0.55),
        (0, (8.8, -6.8), 0.30, -1.05),
        (1, (-10.6, -15.6), 0.22, 1.70),
        (2, (-13.2, -3.2), 0.26, 0.40),
    )
    for i, (idx, loc, scale, yaw) in enumerate(tree_plan):
        if not trees:
            break
        src = trees[idx % len(trees)]
        z, _biome = authored_height(loc[0], loc[1])
        obj = _dup(src, (loc[0], loc[1], max(z, -0.05)), scale, yaw, bury=0.12)
        if obj is not None:
            obj.name = f"TJ_V3_Tree_{i}"
            link_v3(obj, col)
            planted.append(obj)
    fern_plan = (
        ((-5.2, -16.0), 0.42, 0.4),
        ((-2.4, -15.2), 0.34, 1.6),
        ((1.1, -16.6), 0.38, 2.2),
        ((-7.4, -13.8), 0.30, 0.8),
        ((-11.6, -12.4), 0.36, -0.5),
    )
    for i, (loc, scale, yaw) in enumerate(fern_plan):
        if not ferns:
            break
        z, _ = authored_height(loc[0], loc[1])
        obj = _dup(ferns[i % len(ferns)], (loc[0], loc[1], z), scale, yaw, bury=0.04)
        if obj is not None:
            obj.name = f"TJ_V3_Fern_{i}"
            link_v3(obj, col)
            planted.append(obj)
    bush_plan = (
        ((-9.8, -9.6), 0.55, 0.3),
        ((6.4, -8.2), 0.48, -0.9),
        ((-15.2, -8.8), 0.62, 1.4),
    )
    for i, (loc, scale, yaw) in enumerate(bush_plan):
        if not bushes:
            break
        z, _ = authored_height(loc[0], loc[1])
        obj = _dup(bushes[i % len(bushes)], (loc[0], loc[1], z), scale, yaw, bury=0.06)
        if obj is not None:
            obj.name = f"TJ_V3_Bush_{i}"
            link_v3(obj, col)
            planted.append(obj)
    grass_plan = (
        ((-4.6, -15.4), 1.8, 0.2),
        ((-1.6, -14.6), 1.5, 1.1),
        ((0.8, -16.0), 1.7, 2.0),
        ((-6.8, -13.4), 1.4, 0.7),
        ((3.2, -13.6), 1.3, -0.4),
        ((-8.8, -16.4), 1.6, 1.8),
        ((-12.2, -11.0), 1.2, 0.5),
        ((5.0, -11.8), 1.1, 2.4),
        ((-3.0, -8.4), 1.0, 0.9),
        ((-10.4, -6.2), 1.15, -1.2),
    )
    for i, (loc, scale, yaw) in enumerate(grass_plan):
        if not grass:
            break
        z, _ = authored_height(loc[0], loc[1])
        obj = _dup(grass[i % len(grass)], (loc[0], loc[1], z + 0.02), scale, yaw)
        if obj is not None:
            obj.name = f"TJ_V3_Grass_{i}"
            link_v3(obj, col)
            planted.append(obj)
    _log("v3_forest_planted", count=len(planted))
    return {"count": len(planted)}


def plant_rocks(rocks: list, col: bpy.types.Collection) -> dict:
    planted = []
    # Geological groups, not even scatter. Several buried / wet.
    plan = (
        (0, (-4.4, -16.6), 0.85, 0.55, 0.28, True),
        (1, (-2.0, -15.4), 0.62, 1.70, 0.22, True),
        (2, (1.2, -17.2), 0.74, -0.80, 0.18, True),
        (3, (-6.6, -14.8), 0.48, 2.10, 0.14, False),
        (4, (-3.4, -13.6), 0.40, 0.30, 0.10, False),
        (0, (3.4, -14.6), 0.52, 1.05, 0.16, True),
        (5, (-8.4, -17.8), 0.70, -1.35, 0.24, True),
        (6, (-1.1, -12.8), 0.34, 0.90, 0.20, True),
        (7, (-5.6, -18.4), 0.58, 2.40, 0.30, True),
        (2, (-10.2, -15.0), 0.44, 0.15, 0.12, False),
        (1, (4.8, -12.4), 0.38, -0.45, 0.10, False),
        (3, (-7.2, -10.8), 0.42, 1.55, 0.08, False),
    )
    for i, (idx, loc, scale, yaw, bury, wet) in enumerate(plan):
        if not rocks:
            break
        src = rocks[idx % len(rocks)]
        z, biome = authored_height(loc[0], loc[1])
        obj = _dup(src, (loc[0], loc[1], z), scale, yaw, bury=bury)
        if obj is None:
            continue
        obj.name = f"TJ_V3_Rock_{i}"
        if wet:
            obj["tj_wet"] = 1
        link_v3(obj, col)
        planted.append(obj)
    _log("v3_rocks_planted", count=len(planted))
    return {"count": len(planted)}


def retune_cabin_with_source_maps() -> dict:
    touched = []
    maps = {
        "cabin": (VILLAGE_NRM / "Cabin01_NRM.png", VILLAGE_NRM / "Cabin01_SPE.png"),
        "wood": (VILLAGE_NRM / "Wood01_NRM.png", VILLAGE_NRM / "Wood01_SPE.png"),
        "straw": (VILLAGE_NRM / "Straw01_NRM.png", VILLAGE_NRM / "Straw01_SPE.png"),
    }

    def load(path: Path, noncolor: bool):
        if not path.exists():
            return None
        img = bpy.data.images.load(str(path), check_existing=True)
        if img and img.colorspace_settings and noncolor:
            img.colorspace_settings.name = "Non-Color"
        return img

    for mat in bpy.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        name = (mat.name or "").lower()
        if any(word in name for word in ("glass", "void", "plug", "window", "emi", "v3_terrain")):
            continue
        kind = None
        if any(word in name for word in ("straw", "roof", "thatch")):
            kind = "straw"
        elif any(word in name for word in ("wood", "log")):
            kind = "wood"
        elif "cabin" in name or "building" in name:
            kind = "cabin"
        if kind is None:
            continue
        nrm_img = load(maps[kind][0], True)
        spe_img = load(maps[kind][1], True)
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None:
            continue
        tex = next((node for node in nodes if node.type == "TEX_IMAGE" and node.image), None)
        if nrm_img is not None and "Normal" in bsdf.inputs:
            nrm = nodes.new("ShaderNodeTexImage")
            nrm.image = nrm_img
            normal = nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = 0.35 if kind == "straw" else 0.55
            links.new(nrm.outputs["Color"], normal.inputs["Color"])
            links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
        if spe_img is not None and "Roughness" in bsdf.inputs:
            spe = nodes.new("ShaderNodeTexImage")
            spe.image = spe_img
            invert = nodes.new("ShaderNodeInvert")
            links.new(spe.outputs["Color"], invert.inputs["Color"])
            links.new(invert.outputs["Color"], bsdf.inputs["Roughness"])
        elif "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.82 if kind == "straw" else 0.58
        if tex is not None:
            mapping = nodes.new("ShaderNodeMapping")
            mapping.inputs["Scale"].default_value = (0.42, 0.42, 0.42) if kind == "straw" else (0.92, 0.92, 0.92)
            coord = nodes.new("ShaderNodeTexCoord")
            links.new(coord.outputs["UV"], mapping.inputs["Vector"])
            links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        touched.append(mat.name)
    _log("v3_cabin_source_maps", materials=touched)
    return {"materials": touched}


def install_real_hdri() -> str:
    if not HDRI_HDR.exists():
        return "missing"
    world = bpy.context.scene.world
    if world is None or world.node_tree is None:
        return "no_world"
    img = bpy.data.images.load(str(HDRI_HDR), check_existing=True)
    for node in world.node_tree.nodes:
        if node.type == "TEX_ENVIRONMENT":
            node.image = img
            _log("v3_hdri_installed", image=HDRI_HDR.name)
            return HDRI_HDR.name
    return "no_env_node"


def setup_comp_cameras() -> list[str]:
    scene = bpy.context.scene
    for marker in scene.timeline_markers:
        marker.camera = None
    names = []
    for spec in COMP_CAMERAS.values():
        existing = bpy.data.objects.get(spec["name"])
        if existing is not None:
            names.append(existing.name)
            continue
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
        names.append(cam.name)
        _log("v3_comp_camera", **{k: spec[k] for k in spec})
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
    _log("v3_light_mood", mood=mood, note=cfg["note"])
    return cfg


def load_ecokit_library() -> dict:
    flora = _append_objects(FLORA_BLEND, TREE_NAMES + FLORA_NAMES)
    rocks = _append_objects(ROCK_BLEND, ROCK_NAMES)
    library = {"trees": [], "ferns": [], "bushes": [], "grass": [], "rocks": rocks}
    for obj in flora:
        low = obj.name.lower()
        if low.startswith("tree_"):
            library["trees"].append(obj)
        elif low.startswith("fern_"):
            library["ferns"].append(obj)
        elif low.startswith("bushes_"):
            library["bushes"].append(obj)
        elif low.startswith("grass_"):
            library["grass"].append(obj)
    return library


def apply_hero_rebuild_v3(collections: dict | None = None, mood: str = "C") -> dict:
    col = ensure_v3_collection()
    hidden = hide_legacy_visuals()
    library = load_ecokit_library()
    terrain = build_hero_terrain(col)
    forest = plant_forest(library, col)
    rocks = plant_rocks(library.get("rocks") or [], col)
    cabin = retune_cabin_with_source_maps()
    hdri = install_real_hdri()
    cams = setup_comp_cameras()
    light = apply_light_mood(mood)
    _log(
        "v3_rebuild_applied",
        trees=len(library.get("trees") or []),
        rocks=len(library.get("rocks") or []),
        terrain=terrain,
        forest=forest,
        plantedRocks=rocks,
        hdri=hdri,
        cameras=cams,
        light=light.get("note"),
    )
    return {
        "hidden": hidden,
        "library": {k: len(v) for k, v in library.items()},
        "terrain": terrain,
        "forest": forest,
        "rocks": rocks,
        "cabin": cabin,
        "hdri": hdri,
        "cameras": cams,
        "light": light.get("note"),
    }
