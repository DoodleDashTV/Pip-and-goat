"""Replace camera-visible EcoKit Tree_* with unpaid-recovered Botaniq heroes.

Hides EcoKit foreground/midground trees (y<18). Keeps EcoKit at y>=18.
Does not change camera, terrain, water, ground dressing, or the V3 sky card.
"""

from __future__ import annotations

import math
from pathlib import Path

from forest_botaniq_production_recovery_v1 import (
    BACKGROUND_Y,
    OWNED_ROOT,
    ensure_cutout_png,
    make_foliage_material,
)
from forest_cinematic_lighting_recovery_v1 import _retune_light
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_interior_sun_canopy_structure_v1 import INTERIOR_FILL_ENERGY, INTERIOR_SUN_ENERGY
from forest_lookdev_isolation_v1 import verify_production_camera

FEATURE = "forest_hero_tree_replacement_v1"
COLLECTION_NAME = "TJ_HERO_TREE_REPLACEMENT_V1"
LIBRARY_COLLECTION = "TJ_HERO_TREE_LIB_V1"

BOTANIQ_DECIDUOUS = OWNED_ROOT / "botaniq" / "botaniq_full" / "blends" / "models" / "deciduous"
BOTANIQ_MODELS = OWNED_ROOT / "botaniq" / "botaniq_full" / "blends" / "models"
BOTANIQ_TEX = OWNED_ROOT / "botaniq" / "botaniq_full" / "textures"

HERO_BLENDS = {
    "fagus_a": BOTANIQ_DECIDUOUS / "bq_Tree_Fagus-sylvatica_A_summer.blend",
    "fagus_b": BOTANIQ_DECIDUOUS / "bq_Tree_Fagus-sylvatica_B_summer.blend",
    "fagus_c": BOTANIQ_DECIDUOUS / "bq_Tree_Fagus-sylvatica_C_summer.blend",
    "salix_a": BOTANIQ_DECIDUOUS / "bq_Tree_Salix-babylonica_A_summer.blend",
    "salix_b": BOTANIQ_DECIDUOUS / "bq_Tree_Salix-babylonica_B_summer.blend",
    "salix_c": BOTANIQ_DECIDUOUS / "bq_Tree_Salix-babylonica_C_summer.blend",
}
REQUIRED_TEXTURES = (
    BOTANIQ_TEX / "bq_Leaf_Fagus-sylvatica_Diffuse.png",
    BOTANIQ_TEX / "bq_Leaf_Fagus-sylvatica_Normal.jpg",
    BOTANIQ_TEX / "bq_Bark_Fagus-sylvatica_Diffuse.jpg",
    BOTANIQ_TEX / "bq_Leaf_Salix-babylonica_Diffuse.png",
    BOTANIQ_TEX / "bq_Leaf_Salix-babylonica_Normal.jpg",
    BOTANIQ_TEX / "bq_Bark_Salix-babylonica_Diffuse.png",
)
LIBRARY_BLEND = BOTANIQ_MODELS / "bq_Library_Materials.blend"

# Same x/y composition roles as vendor_reference Tree_* at y<18.
HERO_PLACEMENTS = (
    ("TJ_HeroTree_FG_L", "fagus_a", (-7.5, 1.5), 9.4, 0.35),
    ("TJ_HeroTree_FG_R", "salix_a", (7.2, 2.0), 9.8, -0.55),
    ("TJ_HeroTree_FG_CL", "fagus_b", (-5.4, 7.0), 7.6, 1.05),
    ("TJ_HeroTree_FG_CR", "fagus_c", (5.7, 7.8), 8.0, -0.28),
    ("TJ_HeroTree_MG_L", "fagus_a", (-8.5, 10.0), 8.8, 0.82),
    ("TJ_HeroTree_MG_R", "salix_b", (8.8, 11.0), 8.6, -1.15),
    ("TJ_HeroTree_MG_CL", "fagus_b", (-4.3, 15.0), 8.2, 0.18),
    ("TJ_HeroTree_MG_CR", "fagus_c", (4.7, 16.2), 8.0, -0.88),
)

OVERLAY_PREFIXES = (
    "TJ_CanopyLeaf_",
    "TJ_CanopySprite_",
    "TJ_StructLeaf_",
    "TJ_StructSprite_",
    "TJ_StructTwig_",
    "TJ_StructRim_",
)

# Camera-left warm key after real leaf gaps exist. Do not flood.
HERO_SUN_ENERGY = 34.0
HERO_SUN_COLOR = (1.0, 0.94, 0.74)
HERO_SUN_ANGLE_DEG = 2.4
HERO_SUN_TRAVEL = (0.38, 0.58, -0.72)
HERO_FILL_ENERGY = 220.0
HERO_CANOPY_FILL_ENERGY = 340.0
HERO_PROOF_SAMPLES = 36
HERO_PROOF_DENOISE = False
HERO_LEAF_VALUE = 1.34


def missing_hero_paths() -> list[str]:
    missing = []
    for key, path in HERO_BLENDS.items():
        if not path.is_file():
            missing.append(str(path))
    for path in REQUIRED_TEXTURES:
        if not path.is_file():
            missing.append(str(path))
    if not LIBRARY_BLEND.is_file():
        missing.append(str(LIBRARY_BLEND))
    return missing


def recover_unpaid_hero_trees() -> dict:
    """Range-extract already-purchased deciduous members. No paid render."""
    missing = missing_hero_paths()
    if not missing:
        return {"status": "ALREADY_LOCAL", "extracted": 0, "missing": []}
    try:
        scenery = Path(__file__).resolve().parent / "scenery"
        import sys

        if str(scenery) not in sys.path:
            sys.path.insert(0, str(scenery))
        from r2_zip_member_extract import extract_members
    except Exception as exc:
        return {
            "status": "BLOCKED",
            "reason": "R2_EXTRACTOR_UNAVAILABLE:" + type(exc).__name__,
            "missing": missing,
            "extracted": 0,
        }
    key = (
        "tivvlejoy-assets/source/purchased-blender-tools/"
        "SRC_BOTANIQ_FULL_7_2_0/botaniq_full-7.2.0.paq.zip"
    )
    dest = OWNED_ROOT
    wanted = [
        "botaniq_full/blends/models/deciduous/bq_Tree_Fagus-sylvatica_A_summer.blend",
        "botaniq_full/blends/models/deciduous/bq_Tree_Fagus-sylvatica_B_summer.blend",
        "botaniq_full/blends/models/deciduous/bq_Tree_Fagus-sylvatica_C_summer.blend",
        "botaniq_full/blends/models/deciduous/bq_Tree_Salix-babylonica_A_summer.blend",
        "botaniq_full/blends/models/deciduous/bq_Tree_Salix-babylonica_B_summer.blend",
        "botaniq_full/blends/models/deciduous/bq_Tree_Salix-babylonica_C_summer.blend",
        "botaniq_full/textures/bq_Bark_Fagus-sylvatica_Diffuse.jpg",
        "botaniq_full/textures/bq_Bark_Fagus-sylvatica_Normal.jpg",
        "botaniq_full/textures/bq_Bark_Salix-babylonica_Diffuse.png",
        "botaniq_full/textures/bq_Bark_Salix-babylonica_Normal.jpg",
        "botaniq_full/textures/bq_Leaf_Fagus-sylvatica_Diffuse.png",
        "botaniq_full/textures/bq_Leaf_Fagus-sylvatica_Normal.jpg",
        "botaniq_full/textures/bq_Leaf_Salix-babylonica_Diffuse.png",
        "botaniq_full/textures/bq_Leaf_Salix-babylonica_Normal.jpg",
        "botaniq_full/blends/models/bq_Library_Materials.blend",
    ]
    try:
        rows = extract_members(key, wanted, dest)
    except Exception as exc:
        return {
            "status": "BLOCKED",
            "reason": "R2_EXTRACT_FAILED:" + type(exc).__name__,
            "missing": missing_hero_paths(),
            "extracted": 0,
        }
    # Copy zip-layout files into the canonical owned botaniq/ tree.
    zip_root = dest / "botaniq_full"
    canon = dest / "botaniq" / "botaniq_full"
    if zip_root.is_dir():
        import shutil

        (canon / "blends" / "models" / "deciduous").mkdir(parents=True, exist_ok=True)
        (canon / "textures").mkdir(parents=True, exist_ok=True)
        for src in (zip_root / "blends" / "models" / "deciduous").glob("*.blend"):
            shutil.copy2(src, canon / "blends" / "models" / "deciduous" / src.name)
        lib = zip_root / "blends" / "models" / "bq_Library_Materials.blend"
        if lib.is_file():
            shutil.copy2(lib, canon / "blends" / "models" / lib.name)
        for src in (zip_root / "textures").glob("*"):
            if src.is_file():
                shutil.copy2(src, canon / "textures" / src.name)
    still = missing_hero_paths()
    return {
        "status": "RECOVERED" if not still else "BLOCKED",
        "extracted": sum(1 for row in rows if row.get("status") == "OK"),
        "missing": still,
        "paidCompute": False,
    }


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _ensure_collection(scene, name: str):
    import bpy

    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        _tag(collection)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    return collection


def _obj_mean_y(obj) -> float:
    from mathutils import Vector

    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return sum(c.y for c in corners) / max(len(corners), 1)


def hide_ecokit_hero_trees(scene) -> dict:
    hidden_trees = []
    hidden_overlays = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith("Tree_") and float(obj.location.y) < BACKGROUND_Y:
            obj.hide_render = True
            obj.hide_viewport = True
            hidden_trees.append(obj.name)
        elif obj.name.startswith(OVERLAY_PREFIXES):
            obj.hide_render = True
            obj.hide_viewport = True
            hidden_overlays.append(obj.name)
    return {
        "hiddenEcoKitTrees": hidden_trees,
        "hiddenOverlays": hidden_overlays,
        "replacedEcoKitTrees": list(hidden_trees),
    }


def _append_library(blend: Path, lib_col) -> dict:
    import bpy

    if not blend.is_file():
        return {"blend": blend.name, "status": "MISSING", "objects": []}
    before = set(bpy.data.objects.keys())
    with bpy.data.libraries.load(str(blend), link=False) as (src, dst):
        dst.objects = list(src.objects or [])
    loaded = []
    for name in list(bpy.data.objects.keys()):
        if name in before:
            continue
        obj = bpy.data.objects[name]
        if obj.name not in lib_col.objects:
            lib_col.objects.link(obj)
        obj.hide_render = True
        obj.hide_viewport = True
        obj.location = (0.0, -900.0, -80.0)
        obj["tj_hero_lib"] = 1
        _tag(obj)
        loaded.append(obj)
    return {
        "blend": blend.name,
        "status": "LOADED",
        "objects": loaded,
        "names": [obj.name for obj in loaded],
    }


def _sit_copy(src, loc_xy, height: float, yaw: float, collection, name: str):
    from mathutils import Vector

    obj = src.copy()
    obj.data = src.data
    obj.parent = None
    obj.matrix_parent_inverse.identity()
    collection.objects.link(obj)
    obj.hide_render = False
    obj.hide_viewport = False
    if "tj_hero_lib" in obj:
        del obj["tj_hero_lib"]
    dim_z = max(float(src.dimensions.z), 0.05)
    scale = float(height) / dim_z
    obj.scale = (scale, scale, scale)
    obj.rotation_euler = (0.0, 0.0, float(yaw))
    corners = []
    rot = obj.rotation_euler.to_matrix()
    for corner in obj.bound_box:
        local = Vector((
            corner[0] * obj.scale.x,
            corner[1] * obj.scale.y,
            corner[2] * obj.scale.z,
        ))
        corners.append(rot @ local)
    lowest = min(c.z for c in corners)
    obj.location = (float(loc_xy[0]), float(loc_xy[1]), -lowest)
    obj.name = name
    obj["tj_hero_tree"] = 1
    _tag(obj)
    return obj


def _lift_material_value(material, amount: float) -> None:
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    if nodes.get("TJ_HeroLeafValue"):
        return
    principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    albedo = next((node for node in nodes if node.type == "TEX_IMAGE"), None)
    if principled is None or albedo is None:
        return
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.name = "TJ_HeroLeafValue"
    hsv.inputs["Value"].default_value = float(amount)
    hsv.inputs["Saturation"].default_value = 1.06
    for link in list(links):
        if link.from_node == albedo and link.from_socket.name == "Color":
            to_node = link.to_node
            to_socket = link.to_socket
            links.remove(link)
            links.new(albedo.outputs["Color"], hsv.inputs["Color"])
            links.new(hsv.outputs["Color"], to_socket)


def rebuild_hero_leaf_materials() -> dict:
    fagus_rgba = ensure_cutout_png(
        BOTANIQ_TEX / "bq_Leaf_Fagus-sylvatica_Diffuse.png",
        BOTANIQ_TEX / "bq_Leaf_Fagus-sylvatica_Diffuse_rgba.png",
    )
    salix_rgba = ensure_cutout_png(
        BOTANIQ_TEX / "bq_Leaf_Salix-babylonica_Diffuse.png",
        BOTANIQ_TEX / "bq_Leaf_Salix-babylonica_Diffuse_rgba.png",
    )
    fagus = make_foliage_material(
        "TJ_HeroLeaf_Fagus_V1",
        fagus_rgba,
        BOTANIQ_TEX / "bq_Leaf_Fagus-sylvatica_Normal.jpg",
        0.24,
        clip=True,
    )
    salix = make_foliage_material(
        "TJ_HeroLeaf_Salix_V1",
        salix_rgba,
        BOTANIQ_TEX / "bq_Leaf_Salix-babylonica_Normal.jpg",
        0.24,
        clip=True,
    )
    _lift_material_value(fagus, HERO_LEAF_VALUE)
    _lift_material_value(salix, HERO_LEAF_VALUE)
    assigned = {"fagus": 0, "salix": 0}
    import bpy

    for obj in bpy.data.objects:
        if not obj.get("tj_hero_tree"):
            continue
        for slot in obj.material_slots:
            name = slot.material.name if slot.material else ""
            if "Leaf" in name and "Salix" in name:
                slot.material = salix
                assigned["salix"] += 1
            elif "Leaf" in name:
                slot.material = fagus
                assigned["fagus"] += 1
    return {
        "fagusCutout": str(fagus_rgba),
        "salixCutout": str(salix_rgba),
        "assigned": assigned,
    }


def tune_botaniq_hero_materials() -> dict:
    import bpy

    tuned = []
    for material in bpy.data.materials:
        if not material.name.startswith("bq_") or not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type != "GROUP" or node.node_tree is None:
                continue
            if "Snow Amount" in node.inputs:
                node.inputs["Snow Amount"].default_value = 0.0
            if "bq_season_offset" in node.inputs:
                node.inputs["bq_season_offset"].default_value = 0.0
            if "Translucency Factor" in node.inputs:
                node.inputs["Translucency Factor"].default_value = 0.22
            if "bq_brightness" in node.inputs:
                node.inputs["bq_brightness"].default_value = max(
                    float(node.inputs["bq_brightness"].default_value), 1.05
                )
            if "Value" in node.inputs and "Leaf" in material.name:
                node.inputs["Value"].default_value = max(
                    float(node.inputs["Value"].default_value), 1.04
                )
        material.blend_method = "HASHED"
        if hasattr(material, "shadow_method"):
            material.shadow_method = "HASHED"
        tuned.append(material.name)
    return {"materialsTuned": sorted(set(tuned))}


def retune_hero_sun(scene) -> dict:
    sun = scene.objects.get("TJ_GoldenSun")
    fill = scene.objects.get("TJ_SoftFill")
    canopy_fill = scene.objects.get("TJ_ForestCanopyFill_V1")
    if sun is not None and sun.type == "LIGHT":
        _retune_light(
            sun,
            energy=HERO_SUN_ENERGY,
            color=HERO_SUN_COLOR,
            angle_deg=HERO_SUN_ANGLE_DEG,
            travel=HERO_SUN_TRAVEL,
        )
    if fill is not None and fill.type == "LIGHT":
        _retune_light(fill, energy=HERO_FILL_ENERGY)
    if canopy_fill is not None and canopy_fill.type == "LIGHT":
        _retune_light(canopy_fill, energy=HERO_CANOPY_FILL_ENERGY)
    scene.view_settings.exposure = LOCKED_MATERIAL_LIGHTING["exposure"]
    scene.view_settings.gamma = LOCKED_MATERIAL_LIGHTING["gamma"]
    scene.view_settings.view_transform = LOCKED_MATERIAL_LIGHTING["viewTransform"]
    return {
        "sunEnergy": HERO_SUN_ENERGY,
        "sunColor": list(HERO_SUN_COLOR),
        "sunTravel": list(HERO_SUN_TRAVEL),
        "fillEnergy": HERO_FILL_ENERGY,
        "canopyFillEnergy": HERO_CANOPY_FILL_ENERGY,
        "sunHarderThanAfternoon": HERO_SUN_ENERGY > 18.0,
        "fillQuieterThanInteriorFlood": HERO_FILL_ENERGY < 350.0,
        "fillNearInterior": abs(HERO_FILL_ENERGY - INTERIOR_FILL_ENERGY) < 40.0,
        "sunBelowInteriorPunch": HERO_SUN_ENERGY < INTERIOR_SUN_ENERGY,
    }


def apply_cycles_leaf_detail(scene) -> dict:
    scene.cycles.samples = HERO_PROOF_SAMPLES
    scene.cycles.use_denoising = HERO_PROOF_DENOISE
    scene.cycles.transparent_max_bounces = max(int(scene.cycles.transparent_max_bounces), 24)
    return {
        "samples": int(scene.cycles.samples),
        "denoising": bool(scene.cycles.use_denoising),
    }


def apply_hero_tree_replacement(scene) -> dict:
    camera = verify_production_camera(scene)
    recover = recover_unpaid_hero_trees()
    missing = missing_hero_paths()
    if missing:
        return {
            "schema": "TIVVLEJOY_FOREST_HERO_TREE_REPLACEMENT_V1",
            "feature": FEATURE,
            "executionStatus": "BLOCKED",
            "heroQualityTreesPresent": False,
            "missingPaths": missing,
            "recover": recover,
            "productionCamera": camera,
            "cameraChanged": False,
            "terrainChanged": False,
            "waterChanged": False,
            "groundDressingChanged": False,
            "finalVideoRenderStarted": False,
            "paidCreateCount": 0,
            "paidSpendUsd": 0,
        }
    hidden = hide_ecokit_hero_trees(scene)
    lib_col = _ensure_collection(scene, LIBRARY_COLLECTION)
    plant_col = _ensure_collection(scene, COLLECTION_NAME)
    library = {}
    for key, path in HERO_BLENDS.items():
        library[key] = _append_library(path, lib_col)
    planted = []
    used = []
    for name, species, xy, height, yaw in HERO_PLACEMENTS:
        loaded = (library.get(species) or {}).get("objects") or []
        src = next((obj for obj in loaded if obj.type == "MESH"), None)
        if src is None:
            continue
        obj = _sit_copy(src, xy, height, yaw, plant_col, name)
        planted.append(obj.name)
        used.append(Path(HERO_BLENDS[species]).name)
    materials = tune_botaniq_hero_materials()
    rebuilt = rebuild_hero_leaf_materials()
    materials["rebuiltLeaves"] = rebuilt
    lights = retune_hero_sun(scene)
    cycles = apply_cycles_leaf_detail(scene)
    sky = scene.objects.get("TJ_AfternoonSkyCard_V2")
    return {
        "schema": "TIVVLEJOY_FOREST_HERO_TREE_REPLACEMENT_V1",
        "feature": FEATURE,
        "recover": recover,
        "hiddenEcoKitTrees": hidden["hiddenEcoKitTrees"],
        "replacedEcoKitTrees": hidden["replacedEcoKitTrees"],
        "hiddenOverlays": hidden["hiddenOverlays"],
        "botaniqTreesUsed": sorted(set(used)),
        "planted": planted,
        "heroQualityTreesPresent": bool(planted),
        "materials": materials,
        "lights": lights,
        "cycles": cycles,
        "skyCardPreserved": sky is not None and not sky.hide_render,
        "productionCamera": camera,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "groundDressingChanged": False,
        "backgroundEcoKitPreserved": True,
        "finalVideoRenderStarted": False,
        "paidCreateCount": 0,
        "paidSpendUsd": 0,
    }
