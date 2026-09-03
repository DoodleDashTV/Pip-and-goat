"""Ground micro-dressing and rainbow-speck identification.

Keeps the V3 material-readable lighting lock. Does not rebuild soil coverage,
camera, water, terrain, or cinematic lighting.
"""

from __future__ import annotations

import math

from forest_camera_ground_cover_v1 import (
    COLLECTION_NAME,
    COVER_CLEARANCE_Z,
    GRANITE_A,
    MOSS_A,
    MOSS_B,
    PEBBLE_A,
    PEBBLE_B,
    TWIG_OAK,
    TWIG_SPRUCE,
    TWIG_TILIA,
    _append_named,
    _cluster_centers,
    _place_source,
    in_footprint,
    make_ovate_leaf,
)
from forest_botaniq_production_recovery_v1 import (
    CORYLUS_BARK_ALBEDO,
    CORYLUS_BARK_NORMAL,
    LEAF_NORMAL,
    ROCK_ALBEDO,
    ROCK_NORMAL,
    leaf_albedo_path,
    make_foliage_material,
    make_opaque_pbr,
)
from forest_lighting_color_recovery_v1 import apply_lighting_variant

FEATURE = "forest_ground_detail_recovery_v1"

# Locked from FOREST_LIGHTING_COLOR_RECOVERY_CAMERA_PROOF_V3.
LOCKED_MATERIAL_LIGHTING = {
    "class": "locked_v3",
    "exposure": 1.10,
    "gamma": 1.06,
    "viewTransform": "AgX",
    "look": "None",
    "hdriStrength": 0.12,
    "neutralWorld": False,
    "sunEnergy": 5.4,
    "sunColor": (1.0, 0.76, 0.55),
    "fillEnergy": 520.0,
    "fillColor": (0.82, 0.78, 0.70),
    "rimEnergy": 1.85,
    "bounceEnergy": 210.0,
    "bounceColor": (0.78, 0.82, 0.70),
    "hideBounce": False,
    "hideRim": False,
}

STAMP_PREFIXES = (
    "TJ_CoverLitterPatch_",
    "TJ_CoverMossPatch_",
    "TJ_CoverNeedlePatch_",
)

# Unique emission IDs for the object-identification still.
ID_CLASSES = {
    "prod_flower": {"rgb": (1.0, 0.0, 1.0), "label": "magenta TJ_ProdFlower"},
    "ecokit_floral": {"rgb": (0.0, 1.0, 1.0), "label": "cyan EcoKit Floral_*"},
    "cover_ovate": {"rgb": (1.0, 1.0, 0.0), "label": "yellow TJ_CoverLitter ovate"},
    "cover_stamp": {"rgb": (1.0, 0.35, 0.0), "label": "orange photo stamps"},
    "fallen_leaf": {"rgb": (0.2, 1.0, 0.0), "label": "lime Fallen Leaf_*"},
    "prod_litter": {"rgb": (0.15, 0.25, 1.0), "label": "blue TJ_ProdLitter"},
    "firefly_card": {"rgb": (1.0, 0.0, 0.0), "label": "red firefly/butterfly card"},
}


def apply_locked_material_lighting(scene) -> dict:
    return apply_lighting_variant(scene, LOCKED_MATERIAL_LIGHTING)


def _emission_material(name: str, rgb: tuple[float, float, float], strength: float = 8.0):
    import bpy

    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = (*rgb, 1.0)
    emit.inputs["Strength"].default_value = strength
    links.new(emit.outputs["Emission"], output.inputs["Surface"])
    material["tj_feature"] = FEATURE
    return material


def _assign_emission(obj, material) -> None:
    if obj.type != "MESH":
        return
    if not obj.material_slots:
        obj.data.materials.append(material)
    for slot in obj.material_slots:
        slot.link = "OBJECT"
        slot.material = material


def _classify_id_object(obj) -> str | None:
    name = obj.name
    low = name.lower()
    if name.startswith("TJ_ProdFlower"):
        return "prod_flower"
    if low.startswith("floral_"):
        return "ecokit_floral"
    if name.startswith("TJ_CoverLitter_") and "Patch" not in name:
        return "cover_ovate"
    if name.startswith(STAMP_PREFIXES):
        return "cover_stamp"
    if "fallen leaf" in low or low.startswith("fallenleaf"):
        return "fallen_leaf"
    if name.startswith("TJ_ProdLitter"):
        return "prod_litter"
    if any(token in low for token in ("firefly", "butterfly", "swarm")):
        return "firefly_card"
    return None


def catalog_rainbow_candidates(scene) -> list[dict]:
    rows = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        kind = _classify_id_object(obj)
        if kind is None:
            continue
        collections = [col.name for col in obj.users_collection]
        y = float(obj.location.y)
        zone = "background" if y >= 18.0 else ("midground" if y >= 6.0 else "foreground")
        rows.append({
            "name": obj.name,
            "class": kind,
            "collections": collections,
            "y": round(y, 4),
            "zone": zone,
            "hide_render": bool(obj.hide_render),
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            "dimensions": [round(float(v), 3) for v in obj.dimensions],
        })
    return rows


def paint_rainbow_object_ids(scene) -> dict:
    """Emission-ID the decorative/leftover candidates. Trees and soil stay dark."""
    import bpy

    dark = _emission_material("TJ_RainbowId_Dark", (0.02, 0.02, 0.02), 0.2)
    mats = {key: _emission_material(f"TJ_RainbowId_{key}", spec["rgb"]) for key, spec in ID_CLASSES.items()}
    painted = {key: 0 for key in ID_CLASSES}
    darkened = 0
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        kind = _classify_id_object(obj)
        if kind is None:
            if obj.name.startswith("TJ_CoverSoil") or obj.name.startswith("Tree_") or obj.name.startswith("TJ_Vendor"):
                _assign_emission(obj, dark)
                darkened += 1
            continue
        _assign_emission(obj, mats[kind])
        painted[kind] += 1
    if hasattr(scene.view_settings, "look"):
        scene.view_settings.look = "None"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    return {
        "schema": "TIVVLEJOY_FOREST_RAINBOW_SPECK_OBJECT_ID_V1",
        "legend": {key: spec["label"] for key, spec in ID_CLASSES.items()},
        "painted": painted,
        "darkened": darkened,
        "candidates": catalog_rainbow_candidates(scene),
    }


def hide_identified_rainbow_specks(scene, classes: tuple[str, ...] = ("prod_flower", "ecokit_floral")) -> list[dict]:
    """Hide only identified leftover classes. Never hide trees or required vegetation."""
    hidden = []
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        kind = _classify_id_object(obj)
        if kind not in classes:
            continue
        if obj.name.startswith("Tree_") or "tree_" in obj.name.lower():
            continue
        if float(obj.location.y) >= 18.0 and kind == "ecokit_floral":
            continue
        obj.hide_render = True
        obj["tj_feature"] = "forest_rainbow_speck_hidden"
        hidden.append({
            "name": obj.name,
            "class": kind,
            "y": round(float(obj.location.y), 4),
            "zone": "background" if obj.location.y >= 18 else ("midground" if obj.location.y >= 6 else "foreground"),
        })
    return hidden


def _hide_stamp_objects(scene) -> list[str]:
    hidden = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith(STAMP_PREFIXES):
            obj.hide_render = True
            obj.hide_viewport = True
            obj["tj_feature"] = FEATURE
            hidden.append(obj.name)
    return hidden


def replace_failed_micro_dressing(scene) -> dict:
    """Remove photo stamps. Add physical leaf/needle/moss/pebble clusters only."""
    import random

    import bpy

    stamps = _hide_stamp_objects(scene)
    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        return {"applied": False, "reason": "COVER_COLLECTION_MISSING", "stampsHidden": stamps}

    rng = random.Random(7301)
    leaf_mat = make_foliage_material("TJ_DetailLeaf_Corylus_V1", leaf_albedo_path(), LEAF_NORMAL, 0.10, clip=True)
    autumn_mat = make_foliage_material("TJ_DetailLeaf_Autumn_V1", leaf_albedo_path(), LEAF_NORMAL, 0.08, clip=True)
    if autumn_mat.node_tree:
        hsv = autumn_mat.node_tree.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Hue"].default_value = 0.08
        hsv.inputs["Saturation"].default_value = 0.42
        hsv.inputs["Value"].default_value = 0.55
        links = autumn_mat.node_tree.links
        image_nodes = [node for node in autumn_mat.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"]
        shader = next((node for node in autumn_mat.node_tree.nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        if image_nodes and shader is not None:
            for link in list(links):
                if link.to_socket == shader.inputs["Base Color"]:
                    links.remove(link)
            links.new(image_nodes[0].outputs["Color"], hsv.inputs["Color"])
            links.new(hsv.outputs["Color"], shader.inputs["Base Color"])
    needle_mat = make_foliage_material("TJ_DetailNeedle_V1", leaf_albedo_path(), LEAF_NORMAL, 0.04, clip=True)
    if needle_mat.node_tree:
        hsv = needle_mat.node_tree.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Hue"].default_value = 0.48
        hsv.inputs["Saturation"].default_value = 0.28
        hsv.inputs["Value"].default_value = 0.42
        links = needle_mat.node_tree.links
        image_nodes = [node for node in needle_mat.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"]
        shader = next((node for node in needle_mat.node_tree.nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        if image_nodes and shader is not None:
            for link in list(links):
                if link.to_socket == shader.inputs["Base Color"]:
                    links.remove(link)
            links.new(image_nodes[0].outputs["Color"], hsv.inputs["Color"])
            links.new(hsv.outputs["Color"], shader.inputs["Base Color"])
    rock_mat = make_opaque_pbr("TJ_DetailRock_V1", ROCK_ALBEDO, ROCK_NORMAL, 0.78, mapping="object")
    stem_mat = make_opaque_pbr("TJ_DetailTwig_V1", CORYLUS_BARK_ALBEDO, CORYLUS_BARK_NORMAL, 0.78, mapping="object")

    moss_a = _append_named(MOSS_A, "bq_Moss_Rhytidiadelphus-squarrosus_A_spring-summer-autumn")
    moss_b = _append_named(MOSS_B, "bq_Moss_Rhytidiadelphus-squarrosus_B_spring-summer-autumn")
    granite = _append_named(GRANITE_A, "bq_Rock_Granite_A_spring-summer-autumn")
    pebble_a = _append_named(PEBBLE_A, "bq_Rock_Pebble_A_spring-summer-autumn")
    pebble_b = _append_named(PEBBLE_B, "bq_Rock_Pebble_B_spring-summer-autumn")
    twig_oak = _append_named(TWIG_OAK, "bq_Twig_Quercus-robur_A_spring-summer-autumn")
    twig_spruce = _append_named(TWIG_SPRUCE, "bq_Twig_Picea-abies_A_spring-summer-autumn")
    twig_tilia = _append_named(TWIG_TILIA, "bq_Twig_Tilia-europaea_A_spring-summer-autumn")

    counts = {"litterLeaves": 0, "needleLeaves": 0, "mossClumps": 0, "pebbles": 0, "twigs": 0}

    for c_index, (cx, cy) in enumerate(_cluster_centers(rng, 14, -1.6, 14.0)):
        pile = rng.randint(5, 9) if cy < 8.0 else rng.randint(3, 6)
        for leaf_i in range(pile):
            lx = cx + rng.uniform(-0.34, 0.34)
            ly = cy + rng.uniform(-0.34, 0.34)
            if not in_footprint(lx, ly):
                continue
            leaf = make_ovate_leaf(
                collection,
                f"TJ_DetailLitter_{c_index:02d}_{leaf_i:02d}",
                (lx, ly, COVER_CLEARANCE_Z + rng.uniform(0.006, 0.014)),
                autumn_mat if rng.random() < 0.30 else leaf_mat,
                rng,
            )
            if cy < 8.0:
                leaf.scale = tuple(float(v) * rng.uniform(1.35, 1.85) for v in leaf.scale)
            leaf["tj_recovery"] = FEATURE
            counts["litterLeaves"] += 1

    for n_index, (cx, cy) in enumerate(_cluster_centers(rng, 7, -0.4, 12.0)):
        for strip in range(5):
            needle = make_ovate_leaf(
                collection,
                f"TJ_DetailNeedle_{n_index:02d}_{strip:02d}",
                (cx + rng.uniform(-0.18, 0.18), cy + rng.uniform(-0.18, 0.18), COVER_CLEARANCE_Z + 0.005),
                needle_mat,
                rng,
            )
            needle.scale = (needle.scale[0] * 0.45, needle.scale[1] * 1.35, needle.scale[2])
            needle["tj_recovery"] = FEATURE
            counts["needleLeaves"] += 1
        if twig_spruce is not None:
            _place_source(
                twig_spruce,
                collection,
                (cx, cy, COVER_CLEARANCE_Z),
                f"TJ_DetailSpruce_{n_index:02d}",
                scale=(rng.uniform(0.8, 1.3), rng.uniform(0.8, 1.2), rng.uniform(0.7, 1.0)),
                rotation_z=rng.uniform(-math.pi, math.pi),
            )
            counts["twigs"] += 1

    moss_sources = [item for item in (moss_a, moss_b) if item is not None]
    moss_sites = [(-2.2, 1.4), (2.8, 3.2), (-1.0, 7.6), (3.4, 9.8), (0.4, 5.1), (-3.6, 8.4)]
    for m_index, (cx, cy) in enumerate(moss_sites):
        if not moss_sources:
            break
        source = moss_sources[m_index % len(moss_sources)]
        sx = rng.uniform(1.8, 2.8)
        _place_source(
            source,
            collection,
            (cx + rng.uniform(-0.15, 0.15), cy + rng.uniform(-0.15, 0.15), COVER_CLEARANCE_Z),
            f"TJ_DetailMoss_{m_index:02d}",
            scale=(sx, sx, rng.uniform(0.45, 0.75)),
            rotation_z=rng.uniform(-math.pi, math.pi),
        )
        counts["mossClumps"] += 1

    rock_sources = [item for item in (pebble_a, pebble_b, granite) if item is not None]
    pebble_sites = [(-1.6, 0.8), (2.1, 2.4), (0.3, 4.6), (-3.2, 6.8), (4.0, 7.2)]
    for r_index, (cx, cy) in enumerate(pebble_sites):
        if not rock_sources:
            break
        source = rock_sources[r_index % len(rock_sources)]
        scale = rng.uniform(2.4, 4.2) if source is not granite else rng.uniform(0.55, 0.95)
        _place_source(
            source,
            collection,
            (cx, cy, COVER_CLEARANCE_Z - 0.008),
            f"TJ_DetailPebble_{r_index:02d}",
            scale=(scale, scale * rng.uniform(0.75, 1.1), scale * rng.uniform(0.35, 0.6)),
            rotation_z=rng.uniform(-math.pi, math.pi),
        )
        counts["pebbles"] += 1

    for t_index, (cx, cy) in enumerate(((1.2, 1.8), (-2.8, 4.2), (3.5, 6.0))):
        source = twig_tilia if t_index % 2 == 0 else twig_oak
        if source is None:
            continue
        _place_source(
            source,
            collection,
            (cx, cy, COVER_CLEARANCE_Z),
            f"TJ_DetailTwig_{t_index:02d}",
            scale=(rng.uniform(0.7, 1.2), rng.uniform(0.7, 1.1), rng.uniform(0.6, 0.95)),
            rotation_z=rng.uniform(-math.pi, math.pi),
        )
        counts["twigs"] += 1

    return {
        "schema": "TIVVLEJOY_FOREST_GROUND_DETAIL_APPLY_V1",
        "feature": FEATURE,
        "applied": True,
        "stampsHidden": stamps,
        "counts": counts,
        "soilArchitecturePreserved": True,
        "litterArchitectureAfter": "physical ovate Corylus/autumn clusters + needle strips",
        "mossArchitectureAfter": "low Rhytidiadelphus clumps in damp/rock niches only",
        "lightingLocked": True,
    }
