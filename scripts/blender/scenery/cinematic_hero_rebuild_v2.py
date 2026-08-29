"""SHOT_02 cinematic hero visual rebuild V2.

Replaces camera-visible card pines, lumpy rocks, and shader-meadow
presentation with purchased Forest Nature assets. Water physics stay locked.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

from cinematic_master_look_v1 import apply_cinematic_daylight, apply_compositor_finish, apply_world_atmosphere


NATURE_TEX_ROOT = Path(
    "/tmp/o14-lookdev/expanded-original14/forest_nature/Textures_Stylized_Forest_Kit/1024"
)
VILLAGE_TEX_ROOT = Path("/tmp/o14-lookdev/expanded-original14/village_textures/Village (Textures)")

COMP_CAMERAS = {
    "A": {
        "name": "TJ_V2_COMP_A",
        "location": (2.15, -21.1, 3.22),
        "look": (-3.55, -10.4, 1.55),
        "lens": 32.0,
        "note": "creek-first Camera C refined: slightly lower, more water",
    },
    "B": {
        "name": "TJ_V2_COMP_B",
        "location": (1.55, -17.6, 2.48),
        "look": (-4.10, -9.6, 1.05),
        "lens": 34.0,
        "note": "stronger foreground creek / lower camera",
    },
    "C": {
        "name": "TJ_V2_COMP_C",
        "location": (3.35, -23.8, 4.05),
        "look": (-2.60, -8.8, 2.05),
        "lens": 30.0,
        "note": "deeper reveal: cabin + Louis layering",
    },
}

LIGHT_MOODS = {
    "A": {
        "note": "soft warm morning",
        "sun": {"energy": 2.65, "angleDeg": 8.4, "eulerDeg": [36.0, 10.0, 58.0], "color": (1.0, 0.90, 0.72)},
        "skyFill": 560.0,
        "groundBounce": 480.0,
        "forestFill": 260.0,
        "creekFill": 110.0,
        "exposure": 0.38,
        "mistStart": 18.0,
        "mistDepth": 54.0,
        "hazeScale": 0.42,
    },
    "B": {
        "note": "warm late-afternoon directional",
        "sun": {"energy": 4.35, "angleDeg": 5.8, "eulerDeg": [56.0, 6.0, -28.0], "color": (1.0, 0.82, 0.58)},
        "skyFill": 280.0,
        "groundBounce": 360.0,
        "forestFill": 140.0,
        "creekFill": 70.0,
        "exposure": 0.22,
        "mistStart": 14.0,
        "mistDepth": 46.0,
        "hazeScale": 0.48,
    },
    "C": {
        "note": "clean adventurous daylight",
        "sun": {"energy": 3.70, "angleDeg": 6.6, "eulerDeg": [46.0, 11.0, 34.0], "color": (1.0, 0.93, 0.80)},
        "skyFill": 430.0,
        "groundBounce": 440.0,
        "forestFill": 200.0,
        "creekFill": 85.0,
        "exposure": 0.30,
        "mistStart": 16.0,
        "mistDepth": 50.0,
        "hazeScale": 0.46,
    },
}


def _log(event: str, **payload) -> None:
    print(json.dumps({"event": event, **payload}), flush=True)


def _load_image(path: Path):
    if not path.exists():
        return None
    img = bpy.data.images.load(str(path), check_existing=True)
    if img and img.colorspace_settings:
        img.colorspace_settings.name = "sRGB"
    return img


def _pbr_alpha(mat_name: str, albedo: Path, opacity: Path | None, roughness=0.72, subsurface=None) -> bpy.types.Material:
    mat = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(albedo)
    if "Base Color" in bsdf.inputs and tex.image:
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if opacity is not None and opacity.exists() and "Alpha" in bsdf.inputs:
        op = nodes.new("ShaderNodeTexImage")
        op.image = _load_image(opacity)
        if op.image and op.image.colorspace_settings:
            op.image.colorspace_settings.name = "Non-Color"
        links.new(op.outputs["Color"], bsdf.inputs["Alpha"])
        if hasattr(mat, "blend_method"):
            mat.blend_method = "HASHED"
        if hasattr(mat, "shadow_method"):
            try:
                mat.shadow_method = "HASHED"
            except Exception:
                pass
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = roughness
    if subsurface is not None and "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = subsurface
    return mat


def _rock_mat(name: str, albedo: Path) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(albedo)
    if tex.image and "Base Color" in bsdf.inputs:
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.62
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.22
    return mat


def _bark_mat() -> bpy.types.Material:
    mat = bpy.data.materials.get("TJ_NATURE_Bark") or bpy.data.materials.new("TJ_NATURE_Bark")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    out = nodes.new("ShaderNodeOutputMaterial")
    coord = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18.0
    links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.10, 0.06, 0.035, 1.0)
    ramp.color_ramp.elements[1].color = (0.22, 0.14, 0.07, 1.0)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.86
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def import_nature_library(files: list[Path]) -> dict:
    """Import the Forest Nature kit once and keep authored meshes as a hidden library."""
    fbx = next((path for path in files if path.suffix.lower() == ".fbx"), None)
    obj = next((path for path in files if path.suffix.lower() == ".obj"), None)
    path = fbx or obj
    if path is None:
        return {}
    before = set(bpy.data.objects.keys())
    try:
        if path.suffix.lower() == ".fbx":
            bpy.ops.import_scene.fbx(filepath=str(path), use_image_search=True)
        else:
            bpy.ops.wm.obj_import(filepath=str(path))
    except Exception as exc:
        _log("nature_import_failed", error=str(exc)[:200])
        return {}
    imported = [bpy.data.objects[name] for name in bpy.data.objects.keys() if name not in before and bpy.data.objects[name].type == "MESH"]
    homes = {mesh.name: mesh.location.copy() for mesh in imported}
    foliage = _pbr_alpha(
        "TJ_NATURE_Foliage",
        NATURE_TEX_ROOT / "Foliage_01" / "Forest_Foliage_01_BaseColor.tga",
        NATURE_TEX_ROOT / "Foliage_01" / "Forest_Foliage_01_Opacity.tga",
        roughness=0.68,
        subsurface=0.12,
    )
    foliage2 = _pbr_alpha(
        "TJ_NATURE_Foliage2",
        NATURE_TEX_ROOT / "Foliage_02" / "Forest_Foliage_02_BaseColor.tga",
        NATURE_TEX_ROOT / "Foliage_02" / "Forest_Foliage_02_Opacity.tga",
        roughness=0.70,
        subsurface=0.10,
    )
    rock_a = _rock_mat("TJ_NATURE_RockA", NATURE_TEX_ROOT / "Rocks_A" / "Rocks_A_BaseColor.tga")
    rock_b = _rock_mat("TJ_NATURE_RockB", NATURE_TEX_ROOT / "Rocks_B" / "Rocks_B_BaseColor.tga")
    bark = _bark_mat()
    library = {"trunks": [], "canopies": [], "rocks": [], "grass": [], "ferns": [], "bushes": [], "flowers": []}
    for mesh in imported:
        mesh.hide_render = True
        mesh.hide_viewport = True
        mesh["tj_home"] = list(homes.get(mesh.name, mesh.location))
        mesh.location = (0.0, -520.0, -80.0)
        name = mesh.name.lower()
        if "trunk" in name:
            _assign_unique(mesh, bark)
            library["trunks"].append(mesh)
        elif "canopy" in name or "leaf" in name:
            _assign_unique(mesh, foliage if "01" in name or "03" in name or "05" in name else foliage2)
            library["canopies"].append(mesh)
        elif name.startswith("rock"):
            _assign_unique(mesh, rock_a if int("".join(ch for ch in name if ch.isdigit()) or "1") % 2 else rock_b)
            library["rocks"].append(mesh)
        elif "grass" in name:
            _assign_unique(mesh, foliage)
            library["grass"].append(mesh)
        elif "fern" in name:
            _assign_unique(mesh, foliage2)
            library["ferns"].append(mesh)
        elif "bush" in name or "leafy_plant" in name:
            _assign_unique(mesh, foliage)
            library["bushes"].append(mesh)
        elif any(word in name for word in ("flower", "daisy", "hydrangea")):
            _assign_unique(mesh, foliage2)
            library["flowers"].append(mesh)
    _log(
        "nature_library_imported",
        **{key: len(val) for key, val in library.items()},
        source=path.name,
        trunkHeight=float(library["trunks"][0].dimensions.z) if library["trunks"] else 0.0,
    )
    return library


def _assign_unique(obj, mat) -> None:
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)


def _fit_scale(src, target: float, requested: float) -> float:
    dim = max(float(src.dimensions.x), float(src.dimensions.y), float(src.dimensions.z), 0.01)
    return (target * requested) / dim


def _dup(src, loc, scale=1.0, yaw=0.0, bury=0.0):
    if src is None:
        return None
    obj = src.copy()
    obj.data = src.data.copy()
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = False
    obj.hide_viewport = False
    obj.location = (loc[0], loc[1], loc[2] - bury)
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (0.0, 0.0, yaw)
    return obj


def _pair_index(name: str) -> str:
    digits = "".join(ch for ch in name if ch.isdigit())
    return digits or name


def _tree_pair(library: dict, index: str):
    trunk = next((obj for obj in library.get("trunks", []) if _pair_index(obj.name) == index), None)
    canopy = next((obj for obj in library.get("canopies", []) if _pair_index(obj.name) == index), None)
    return trunk, canopy


def plant_nature_tree(library: dict, index: str, loc, scale: float, yaw: float) -> list:
    trunk, canopy = _tree_pair(library, index)
    extras = []
    native = max(float(trunk.dimensions.z), 0.01) if trunk is not None else 5.5
    factor = (5.8 * scale) / native
    planted = _dup(trunk, loc, factor, yaw)
    if planted is not None:
        planted.name = f"TJ_V2_Tree_{index}_{int(abs(loc[0]*10))}"
        extras.append(planted)
    if canopy is not None:
        # Keep the authored trunk/canopy offset so the crown sits on the bole.
        home_c = Vector(canopy.get("tj_home", (0.0, 0.0, 0.0)))
        home_t = Vector(trunk.get("tj_home", (0.0, 0.0, 0.0))) if trunk is not None else Vector((0.0, 0.0, 0.0))
        offset = home_c - home_t
        if offset.length > 2.4:
            offset = Vector((0.0, 0.0, 0.0))
        for extra_yaw, extra_scale in ((0.0, 1.0), (1.05, 0.92), (2.15, 0.84)):
            cloc = (loc[0] + offset.x * factor, loc[1] + offset.y * factor, loc[2] + offset.z * factor)
            crown = _dup(canopy, cloc, factor * extra_scale, yaw + extra_yaw)
            if crown is not None:
                crown.name = f"TJ_V2_Canopy_{index}_{int(abs(loc[0]*10))}_{int(extra_yaw*10)}"
                extras.append(crown)
    return extras


def hide_cheap_shot02_clutter() -> dict:
    hidden = {"trees": 0, "eco": 0, "lumps": 0, "saplings": 0}
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        name = obj.name
        low = name.lower()
        if name.startswith("TJ_V2_"):
            continue
        loc = obj.location
        in_frustum = -40.0 <= loc.x <= 32.0 and -36.0 <= loc.y <= 18.0
        village_tree = ("tree" in low or "pine" in low) and "louis" not in low and not name.startswith("TJ_V2_")
        if in_frustum and village_tree:
            obj.hide_render = True
            obj.hide_viewport = True
            hidden["trees"] += 1
        if name.startswith("TJ_MeadowEco_") and -16.0 <= loc.x <= 12.0 and -16.0 <= loc.y <= 10.0:
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
    _log("cheap_shot02_clutter_hidden", **hidden)
    return hidden


def dress_shot02(library: dict) -> dict:
    extras = []
    # Volumetric grove left of the creek / cabin. Multiple forms, sizes, yaws.
    tree_plan = (
        ("02", (-13.6, -12.4, 0.0), 0.92, 0.40),
        ("01", (-16.8, -8.6, 0.0), 1.18, 1.15),
        ("03", (-10.8, -6.2, 0.0), 0.74, 2.40),
        ("04", (-18.4, -15.8, 0.0), 0.62, 0.85),
        ("05", (9.6, -7.4, 0.0), 0.80, -0.55),
        ("06", (-8.4, -16.8, 0.0), 0.48, 1.70),
        ("02", (-7.2, -19.4, 0.0), 0.38, 0.22),
        ("01", (6.4, -11.2, 0.0), 0.58, -1.10),
    )
    for index, loc, scale, yaw in tree_plan:
        extras.extend(plant_nature_tree(library, index, loc, scale, yaw))

    rocks = library.get("rocks") or []
    rock_plan = (
        (0, (-4.6, -16.8, -0.22), 1.35, 0.55, 0.28),
        (2, (-1.8, -15.2, -0.18), 0.95, 1.80, 0.22),
        (3, (1.4, -17.4, -0.20), 1.15, -0.70, 0.26),
        (1, (-6.8, -14.6, -0.08), 0.72, 2.20, 0.18),
        (4, (-3.2, -13.4, -0.04), 0.58, 0.30, 0.10),
        (5, (3.6, -14.8, -0.12), 0.80, 1.10, 0.16),
        (6, (-8.8, -18.6, -0.16), 1.05, -1.40, 0.24),
    )
    for i, loc, scale, yaw, bury in rock_plan:
        if not rocks:
            break
        src = rocks[i % len(rocks)]
        obj = _dup(src, loc, _fit_scale(src, 1.45, scale), yaw, bury)
        if obj is not None:
            obj.name = f"TJ_V2_Rock_{i}"
            extras.append(obj)

    grass = library.get("grass") or []
    ferns = library.get("ferns") or []
    bushes = library.get("bushes") or []
    grass_plan = (
        ((-5.4, -15.6, 0.02), 1.4, 0.20),
        ((-2.2, -14.4, 0.04), 1.1, 1.40),
        ((0.8, -16.2, 0.02), 1.25, 2.10),
        ((-7.2, -13.2, 0.06), 0.95, 0.80),
        ((2.6, -13.8, 0.04), 1.05, -0.40),
        ((-4.0, -12.0, 0.08), 0.85, 1.90),
        ((-9.4, -16.8, 0.02), 1.15, 0.55),
        ((4.2, -12.6, 0.06), 0.90, 2.60),
    )
    for i, (loc, scale, yaw) in enumerate(grass_plan):
        src = grass[i % len(grass)] if grass else None
        obj = _dup(src, loc, _fit_scale(src, 0.95, scale) if src else scale, yaw)
        if obj is not None:
            obj.name = f"TJ_V2_Grass_{i}"
            extras.append(obj)
    fern_plan = (
        ((-3.6, -15.8, 0.02), 1.2, 0.3),
        ((1.0, -14.6, 0.03), 0.95, 1.7),
        ((-6.4, -17.2, 0.01), 1.05, 2.2),
    )
    for i, (loc, scale, yaw) in enumerate(fern_plan):
        src = ferns[i % len(ferns)] if ferns else None
        obj = _dup(src, loc, _fit_scale(src, 0.75, scale) if src else scale, yaw)
        if obj is not None:
            obj.name = f"TJ_V2_Fern_{i}"
            extras.append(obj)
    bush_plan = (
        ((-11.2, -10.4, 0.04), 0.85, 0.6),
        ((7.2, -8.8, 0.05), 0.70, -0.8),
        ((-2.8, -8.6, 0.06), 0.60, 1.3),
    )
    for i, (loc, scale, yaw) in enumerate(bush_plan):
        src = bushes[i % len(bushes)] if bushes else None
        obj = _dup(src, loc, _fit_scale(src, 1.05, scale) if src else scale, yaw)
        if obj is not None:
            obj.name = f"TJ_V2_Bush_{i}"
            extras.append(obj)
    _log("shot02_dressed", extras=len(extras))
    return {"extras": extras, "count": len(extras)}


def retune_meadow_shader() -> dict:
    """Kill the Voronoi carpet. Prefer purchased Louis meadow + authored regions."""
    mat = bpy.data.materials.get("TJ_CinematicValleyMeadow")
    if mat is None or mat.node_tree is None:
        return {"mode": "missing"}
    notes = []
    for node in mat.node_tree.nodes:
        if node.type == "TEX_VORONOI":
            if "Scale" in node.inputs:
                node.inputs["Scale"].default_value = 0.012
            notes.append("voronoi_softened")
        if node.type == "MAPPING" and tuple(round(v, 3) for v in node.inputs["Scale"].default_value) == (0.022, 0.022, 0.022):
            node.inputs["Scale"].default_value = (0.085, 0.085, 0.085)
            notes.append("louis_scale_0.085")
        if node.type == "MIX_RGB" and abs(node.inputs.get("Fac").default_value - 0.22) < 0.02:
            # Louis image mix was 0.22. Raise it so the purchased meadow plate wins.
            node.inputs["Fac"].default_value = 0.58
            notes.append("louis_mix_0.58")
        if node.type == "MIX_RGB" and abs(node.inputs.get("Fac").default_value - 0.78) < 0.02:
            node.inputs["Fac"].default_value = 0.16
            notes.append("eco_voronoi_mix_0.16")
        if node.type == "BUMP" and "Strength" in node.inputs:
            node.inputs["Strength"].default_value = 0.18
            notes.append("bump_0.18")
    _log("meadow_shader_retuned", notes=notes)
    return {"notes": notes}


def retune_cabin_materials() -> dict:
    wood = _load_image(VILLAGE_TEX_ROOT / "Wood01_ALB.png")
    straw = _load_image(VILLAGE_TEX_ROOT / "Straw01_ALB.png")
    touched = []
    for mat in bpy.data.materials:
        if mat is None or not mat.use_nodes:
            continue
        name = (mat.name or "").lower()
        if any(word in name for word in ("glass", "void", "plug", "window", "emi")):
            continue
        roof = any(word in name for word in ("straw", "roof", "thatch"))
        cabin = any(word in name for word in ("cabin", "building", "wood", "log")) and not roof
        if not roof and not cabin:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        bsdf = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None or "Base Color" not in bsdf.inputs:
            continue
        img = straw if roof else wood
        if img is None:
            continue
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (0.55, 0.55, 0.55) if roof else (1.15, 1.15, 1.15)
        coord = nodes.new("ShaderNodeTexCoord")
        links.new(coord.outputs["UV"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 6.5 if roof else 3.2
        links.new(coord.outputs["Object"], noise.inputs["Vector"])
        mix = nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MIX"
        mix.inputs["Fac"].default_value = 0.22 if roof else 0.12
        if "Color1" in mix.inputs:
            links.new(tex.outputs["Color"], mix.inputs["Color1"])
            mix.inputs["Color2"].default_value = (0.42, 0.30, 0.14, 1.0) if roof else (0.28, 0.16, 0.08, 1.0)
            links.new(noise.outputs["Fac"], mix.inputs["Fac"])
        for link in list(bsdf.inputs["Base Color"].links):
            links.remove(link)
        links.new(mix.outputs["Color"] if "Color" in mix.outputs else mix.outputs[0], bsdf.inputs["Base Color"])
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.78 if roof else 0.62
        touched.append(mat.name)
    _log("cabin_materials_retuned", materials=touched)
    return {"materials": touched}


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
        _log("v2_comp_camera", **spec)
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
    for name, key in (("TJ_SkyFill", "skyFill"), ("TJ_GroundBounce", "groundBounce"), ("TJ_ForestFill", "forestFill"), ("TJ_CreekFill", "creekFill")):
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
    # Retune haze scale for this mood after the default compositor is built.
    scene = bpy.context.scene
    if scene.node_tree:
        for node in scene.node_tree.nodes:
            if node.type == "MATH" and node.operation == "MULTIPLY" and abs(node.inputs[1].default_value - 0.50) < 0.02:
                node.inputs[1].default_value = cfg["hazeScale"]
            if node.type == "MATH" and node.operation == "MULTIPLY" and abs(node.inputs[1].default_value - 0.40) < 0.02:
                node.inputs[1].default_value = cfg["hazeScale"]
    if hasattr(scene, "view_settings"):
        scene.view_settings.exposure = cfg["exposure"]
    _log("v2_light_mood", mood=mood, **{k: cfg[k] for k in cfg if k != "sun"}, sun=cfg["sun"])
    return cfg


def apply_hero_rebuild_v2(library: dict, collections: dict | None = None, mood: str = "C") -> dict:
    hidden = hide_cheap_shot02_clutter()
    dressed = dress_shot02(library or {})
    meadow = retune_meadow_shader()
    cabin = retune_cabin_materials()
    cams = setup_comp_cameras()
    light = apply_light_mood(mood)
    if collections:
        terrain = collections.get("WORLD_TERRAIN")
        forest = collections.get("WORLD_FOREST_FOREGROUND")
        if terrain or forest:
            for obj in dressed.get("extras", []):
                if obj is None:
                    continue
                target = forest if "Tree" in obj.name or "Canopy" in obj.name else terrain
                if target is None:
                    continue
                for existing in list(obj.users_collection):
                    existing.objects.unlink(obj)
                target.objects.link(obj)
    return {
        "hidden": hidden,
        "dressed": dressed.get("count", 0),
        "meadow": meadow,
        "cabin": cabin,
        "cameras": cams,
        "light": light.get("note"),
    }
