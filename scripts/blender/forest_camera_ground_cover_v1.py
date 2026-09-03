"""Locked-camera forest-floor dressing. Does not touch the vendor ground shader.

Covers the visible TJ_VendorGround footprint with owned Botaniq meshes and
localized soil/litter/moss/rock materials. Terrain, camera, water, lighting,
and background EcoKit (y >= 18 plants) stay locked.
"""

from __future__ import annotations

import math
from pathlib import Path

from forest_botaniq_production_recovery_v1 import (
    BOTANIQ_MODELS,
    BOTANIQ_TEX,
    CORYLUS_BARK_ALBEDO,
    CORYLUS_BARK_NORMAL,
    FERN_NORMAL,
    LEAF_NORMAL,
    MOSS_ALBEDO,
    NEEDLES_ALBEDO,
    ROCK_ALBEDO,
    ROCK_NORMAL,
    SOIL_ALBEDO,
    SOIL_NORMAL,
    STEM_ALBEDO,
    STEM_NORMAL,
    _instance_like,
    ensure_cutout_png,
    fern_albedo_path,
    leaf_albedo_path,
    make_foliage_material,
    make_opaque_pbr,
    rebuild_appended_materials,
)

FEATURE = "forest_camera_ground_cover_v1"
COLLECTION_NAME = "TJ_CAMERA_GROUND_COVER_V1"

# Visible floor from TJ_VendorReference_Camera at (0, -12.5, 2.15), 42 mm.
FOOTPRINT = {
    "xMin": -9.2,
    "xMax": 9.2,
    "yMin": -2.4,
    "yMax": 30.0,
    "heroY": 8.0,
    "midY": 18.0,
}

MOSS_A = BOTANIQ_MODELS / "mosses-and-lichens" / "bq_Moss_Rhytidiadelphus-squarrosus_A_spring-summer-autumn.blend"
MOSS_B = BOTANIQ_MODELS / "mosses-and-lichens" / "bq_Moss_Rhytidiadelphus-squarrosus_B_spring-summer-autumn.blend"
GRANITE_A = BOTANIQ_MODELS / "rocks" / "bq_Rock_Granite_A_spring-summer-autumn.blend"
PEBBLE_A = BOTANIQ_MODELS / "rocks" / "bq_Rock_Pebble_A_spring-summer-autumn.blend"
PEBBLE_B = BOTANIQ_MODELS / "rocks" / "bq_Rock_Pebble_B_spring-summer-autumn.blend"
TWIG_TILIA = BOTANIQ_MODELS / "misc" / "bq_Twig_Tilia-europaea_A_spring-summer-autumn.blend"
TWIG_OAK = BOTANIQ_MODELS / "misc" / "bq_Twig_Quercus-robur_A_spring-summer-autumn.blend"
TWIG_SPRUCE = BOTANIQ_MODELS / "misc" / "bq_Twig_Picea-abies_A_spring-summer-autumn.blend"
FALLEN_B = BOTANIQ_MODELS / "misc" / "bq_pps_Misc_Fallen-Leaves_B_autumn.blend"
MOSS_LOREUS = BOTANIQ_TEX / "bq_Moss_Rhytidiadelphus-loreus_Diffuse.png"

AUTUMN_LEAVES = (
    "bq_Leaf_Acer-saccharum_A_autumn",
    "bq_Leaf_Quercus-robur_A_autumn",
    "bq_Leaf_Fagus-sylvatica_A_autumn",
)


def camera_footprint() -> dict:
    return dict(FOOTPRINT)


def in_footprint(x: float, y: float) -> bool:
    return FOOTPRINT["xMin"] <= x <= FOOTPRINT["xMax"] and FOOTPRINT["yMin"] <= y <= FOOTPRINT["yMax"]


def _cover_tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_recovery"] = FEATURE
    id_data["tj_feature"] = FEATURE


def _new_material(name: str):
    import bpy

    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    _cover_tag(material)
    return material


def make_soil_cover_material():
    """Dark earth for cover patches only. Does not replace the vendor ground material."""
    from forest_botaniq_production_recovery_v1 import _load_image, _principled

    material = _new_material("TJ_CoverSoil_Loose_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.55, 0.55, 0.55)
    links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(SOIL_ALBEDO, "sRGB")
    links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Hue"].default_value = 0.46
    hsv.inputs["Saturation"].default_value = 0.42
    hsv.inputs["Value"].default_value = 0.34
    links.new(tex.outputs["Color"], hsv.inputs["Color"])
    links.new(hsv.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.92
    if SOIL_NORMAL.is_file():
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = _load_image(SOIL_NORMAL, "Non-Color")
        ntex.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.38
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_needle_cluster_material():
    from forest_botaniq_production_recovery_v1 import _load_image, _principled

    material = _new_material("TJ_CoverNeedles_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(NEEDLES_ALBEDO, "sRGB")
    links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.88
    return material


def _append_named(blend_path: Path, object_name: str):
    import bpy

    if not blend_path.is_file():
        return None
    existing = bpy.data.objects.get(object_name)
    if existing is not None and existing.get("tj_recovery") in {FEATURE, "forest_botaniq_production_recovery_v1"}:
        return existing
    before = set(bpy.data.objects.keys())
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        if object_name not in data_from.objects:
            return None
        data_to.objects = [object_name]
    added = [name for name in bpy.data.objects.keys() if name not in before]
    obj = bpy.data.objects.get(added[0]) if added else bpy.data.objects.get(object_name)
    if obj is None:
        return None
    _cover_tag(obj)
    obj.hide_render = True
    obj.hide_viewport = True
    return obj


def _ensure_collection(scene):
    import bpy

    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION_NAME)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    _cover_tag(collection)
    return collection


def make_soil_patch(collection, name, location, radius, rotation_z, material, rng):
    """Low irregular earth patch. Not a scene-wide plane. Not a hemisphere."""
    import bpy
    from mathutils import Vector

    segments = 11
    verts = [(0.0, 0.0, rng.uniform(0.010, 0.018))]
    faces = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        jitter = rng.uniform(0.62, 1.08)
        verts.append(
            (
                math.cos(angle) * jitter,
                math.sin(angle) * jitter,
                rng.uniform(0.004, 0.012),
            )
        )
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    if mesh.uv_layers.active is None:
        mesh.uv_layers.new(name="TJ_CoverSoil")
    uv = mesh.uv_layers.active
    for loop in mesh.loops:
        vx, vy, _vz = verts[loop.vertex_index]
        uv.data[loop.index].uv = (vx * 0.72 + rng.uniform(0.0, 0.4), vy * 0.72 + rng.uniform(0.0, 0.4))
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector((location[0], location[1], 0.012))
    obj.rotation_euler.z = rotation_z
    obj.scale = (radius, radius * rng.uniform(0.72, 1.18), 1.0)
    mesh.materials.append(material)
    _cover_tag(mesh)
    _cover_tag(obj)
    return obj


def make_ovate_leaf(collection, name, location, material, rng):
    """Crumpled ovate leaf mesh. Not a rectangular card."""
    import bpy
    from mathutils import Euler, Vector

    width = rng.uniform(0.07, 0.13)
    length = rng.uniform(0.10, 0.18)
    cup = rng.uniform(0.006, 0.016)
    verts = [
        (0.0, -length * 0.08, 0.0),
        (width * 0.38, length * 0.18, cup * 0.3),
        (width * 0.22, length * 0.72, cup),
        (0.0, length, cup * 0.2),
        (-width * 0.22, length * 0.72, cup),
        (-width * 0.38, length * 0.18, cup * 0.3),
        (0.0, length * 0.42, cup * 1.15),
    ]
    faces = [(0, 1, 6), (1, 2, 6), (2, 3, 6), (3, 4, 6), (4, 5, 6), (5, 0, 6)]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    if mesh.uv_layers.active is None:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active
    corners = {
        0: (0.50, 0.08),
        1: (0.86, 0.28),
        2: (0.78, 0.78),
        3: (0.50, 0.96),
        4: (0.22, 0.78),
        5: (0.14, 0.28),
        6: (0.50, 0.50),
    }
    for loop in mesh.loops:
        uv.data[loop.index].uv = corners[loop.vertex_index]
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector((location[0], location[1], location[2]))
    obj.rotation_euler = Euler(
        (rng.uniform(0.02, 0.28), rng.uniform(-0.18, 0.18), rng.uniform(-math.pi, math.pi))
    )
    obj.scale = (rng.uniform(0.85, 1.25), rng.uniform(0.85, 1.25), rng.uniform(0.8, 1.2))
    mesh.materials.append(material)
    _cover_tag(mesh)
    _cover_tag(obj)
    return obj


def _place_source(source, collection, location, name, scale, rotation_z):
    if source is None:
        return None
    obj = _instance_like(source, collection, location, name, scale=scale, rotation_z=rotation_z)
    obj.hide_render = False
    obj.hide_viewport = False
    _cover_tag(obj)
    return obj


def _soil_sites(rng) -> list[tuple[float, float, float, float]]:
    sites = []
    spacing = 1.55
    y = FOOTPRINT["yMin"]
    row = 0
    while y <= FOOTPRINT["yMax"]:
        x = FOOTPRINT["xMin"] + (0.42 if row % 2 else 0.0)
        while x <= FOOTPRINT["xMax"]:
            px = x + rng.uniform(-0.38, 0.38)
            py = y + rng.uniform(-0.38, 0.38)
            if in_footprint(px, py):
                radius = rng.uniform(1.15, 1.85)
                if py > FOOTPRINT["midY"]:
                    radius *= 1.25
                sites.append((px, py, radius, rng.uniform(-math.pi, math.pi)))
            x += spacing
        y += spacing * 0.86
        row += 1
    return sites


def _cluster_centers(rng, count: int, y_min: float, y_max: float) -> list[tuple[float, float]]:
    attractors = [(-3.1, 2.2), (2.4, 4.8), (-1.2, 8.6), (3.6, 12.1), (0.1, 0.4), (-4.4, 6.5), (4.8, 9.4)]
    centers = []
    for index in range(count):
        if rng.random() < 0.7:
            ax, ay = attractors[index % len(attractors)]
            centers.append((ax + rng.uniform(-1.5, 1.5), max(y_min, min(y_max, ay + rng.uniform(-1.3, 1.3)))))
        else:
            centers.append((rng.uniform(-7.2, 7.2), rng.uniform(y_min, y_max)))
    return centers


def apply_camera_ground_cover(scene) -> dict:
    import random

    import bpy

    rng = random.Random(7301)
    collection = _ensure_collection(scene)
    for obj in list(collection.objects):
        if obj.get("tj_recovery") == FEATURE:
            collection.objects.unlink(obj)

    soil_mat = make_soil_cover_material()
    leaf_mat = make_foliage_material("TJ_CoverLeaf_Corylus_V1", leaf_albedo_path(), LEAF_NORMAL, 0.10, clip=True)
    autumn_mat = make_foliage_material("TJ_CoverLeaf_Autumn_V1", leaf_albedo_path(), LEAF_NORMAL, 0.08, clip=True)
    if autumn_mat.node_tree:
        for node in autumn_mat.node_tree.nodes:
            if node.bl_idname == "ShaderNodeBsdfPrincipled":
                continue
        hsv = autumn_mat.node_tree.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Hue"].default_value = 0.06
        hsv.inputs["Saturation"].default_value = 0.72
        hsv.inputs["Value"].default_value = 0.62
        links = autumn_mat.node_tree.links
        image_nodes = [node for node in autumn_mat.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"]
        shader = next((node for node in autumn_mat.node_tree.nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        if image_nodes and shader is not None:
            for link in list(links):
                if link.to_socket == shader.inputs["Base Color"]:
                    links.remove(link)
            links.new(image_nodes[0].outputs["Color"], hsv.inputs["Color"])
            links.new(hsv.outputs["Color"], shader.inputs["Base Color"])
    moss_src = MOSS_LOREUS if MOSS_LOREUS.is_file() else MOSS_ALBEDO
    if moss_src.suffix.lower() == ".png":
        moss_cut = BOTANIQ_TEX / "bq_Moss_Rhytidiadelphus-loreus_Diffuse_rgba.png"
        moss_src = ensure_cutout_png(moss_src, moss_cut)
        moss_mat = make_foliage_material("TJ_CoverMoss_V1", moss_src, None, 0.04, clip=True)
    else:
        moss_mat = make_opaque_pbr("TJ_CoverMoss_V1", moss_src, None, 0.86, mapping="object")
    rock_mat = make_opaque_pbr("TJ_CoverRock_Granite_V1", ROCK_ALBEDO, ROCK_NORMAL, 0.78, mapping="object")
    needle_mat = make_needle_cluster_material()
    stem_mat = make_opaque_pbr("TJ_CoverTwig_V1", STEM_ALBEDO if STEM_ALBEDO.is_file() else CORYLUS_BARK_ALBEDO, STEM_NORMAL or CORYLUS_BARK_NORMAL, 0.7)
    fern_mat = make_foliage_material("TJ_CoverFern_V1", fern_albedo_path(), FERN_NORMAL, 0.16, clip=True)

    moss_a = _append_named(MOSS_A, "bq_Moss_Rhytidiadelphus-squarrosus_A_spring-summer-autumn")
    moss_b = _append_named(MOSS_B, "bq_Moss_Rhytidiadelphus-squarrosus_B_spring-summer-autumn")
    granite = _append_named(GRANITE_A, "bq_Rock_Granite_A_spring-summer-autumn")
    pebble_a = _append_named(PEBBLE_A, "bq_Rock_Pebble_A_spring-summer-autumn")
    pebble_b = _append_named(PEBBLE_B, "bq_Rock_Pebble_B_spring-summer-autumn")
    twig_tilia = _append_named(TWIG_TILIA, "bq_Twig_Tilia-europaea_A_spring-summer-autumn")
    twig_oak = _append_named(TWIG_OAK, "bq_Twig_Quercus-robur_A_spring-summer-autumn")
    twig_spruce = _append_named(TWIG_SPRUCE, "bq_Twig_Picea-abies_A_spring-summer-autumn")
    autumn_objs = []
    for leaf_name in AUTUMN_LEAVES:
        obj = _append_named(FALLEN_B, leaf_name)
        if obj is not None:
            rebuild_appended_materials(obj, autumn_mat)
            autumn_objs.append(obj)

    grass = bpy.data.objects.get("bq_Grass_Carex-oshimensis_A_spring")
    fern = bpy.data.objects.get("bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn")

    for source, mat in ((moss_a, moss_mat), (moss_b, moss_mat), (granite, rock_mat), (pebble_a, rock_mat), (pebble_b, rock_mat), (twig_tilia, stem_mat), (twig_oak, stem_mat), (twig_spruce, stem_mat)):
        if source is not None and mat is not None:
            if not source.material_slots:
                source.data.materials.append(mat)
            for slot in source.material_slots:
                slot.link = "OBJECT"
                slot.material = mat

    counts = {
        "soilPatches": 0,
        "litterLeaves": 0,
        "needleClusters": 0,
        "mossClumps": 0,
        "rocks": 0,
        "twigs": 0,
        "understory": 0,
    }

    for index, (x, y, radius, rot) in enumerate(_soil_sites(rng)):
        make_soil_patch(collection, f"TJ_CoverSoil_{index:03d}", (x, y), radius, rot, soil_mat, rng)
        counts["soilPatches"] += 1

    for c_index, (cx, cy) in enumerate(_cluster_centers(rng, 16, -1.2, 16.5)):
        pile = rng.randint(5, 10)
        for leaf_i in range(pile):
            lx = cx + rng.uniform(-0.38, 0.38)
            ly = cy + rng.uniform(-0.38, 0.38)
            if not in_footprint(lx, ly):
                continue
            use_autumn = autumn_objs and rng.random() < 0.45
            if use_autumn:
                source = autumn_objs[leaf_i % len(autumn_objs)]
                scale = rng.uniform(0.9, 1.6)
                _place_source(
                    source,
                    collection,
                    (lx, ly, rng.uniform(0.018, 0.034)),
                    f"TJ_CoverAutumn_{c_index:02d}_{leaf_i:02d}",
                    scale=(scale, scale, scale * 0.7),
                    rotation_z=rng.uniform(-math.pi, math.pi),
                )
            else:
                make_ovate_leaf(
                    collection,
                    f"TJ_CoverLitter_{c_index:02d}_{leaf_i:02d}",
                    (lx, ly, rng.uniform(0.018, 0.032)),
                    autumn_mat if rng.random() < 0.55 else leaf_mat,
                    rng,
                )
            counts["litterLeaves"] += 1

    for n_index, (cx, cy) in enumerate(_cluster_centers(rng, 8, -0.6, 14.0)):
        for strip in range(4):
            make_ovate_leaf(
                collection,
                f"TJ_CoverNeedle_{n_index:02d}_{strip:02d}",
                (cx + rng.uniform(-0.22, 0.22), cy + rng.uniform(-0.22, 0.22), 0.016),
                needle_mat,
                rng,
            )
            counts["needleClusters"] += 1
        if twig_spruce is not None:
            _place_source(
                twig_spruce,
                collection,
                (cx + rng.uniform(-0.2, 0.2), cy, 0.014),
                f"TJ_CoverSpruceTwig_{n_index:02d}",
                scale=(rng.uniform(0.9, 1.5), rng.uniform(0.9, 1.4), rng.uniform(0.8, 1.2)),
                rotation_z=rng.uniform(-math.pi, math.pi),
            )
            counts["twigs"] += 1

    moss_sources = [item for item in (moss_a, moss_b) if item is not None]
    for m_index, (cx, cy) in enumerate(_cluster_centers(rng, 14, -0.8, 15.5)):
        if not moss_sources:
            continue
        source = moss_sources[m_index % len(moss_sources)]
        clump = rng.randint(4, 8)
        for piece in range(clump):
            sx = rng.uniform(9.5, 14.5)
            _place_source(
                source,
                collection,
                (cx + rng.uniform(-0.28, 0.28), cy + rng.uniform(-0.28, 0.28), 0.011),
                f"TJ_CoverMoss_{m_index:02d}_{piece:02d}",
                scale=(sx, sx, rng.uniform(3.2, 5.5)),
                rotation_z=rng.uniform(-math.pi, math.pi),
            )
            counts["mossClumps"] += 1

    rock_sources = [item for item in (granite, pebble_a, pebble_b) if item is not None]
    rock_spots = _cluster_centers(rng, 9, -0.4, 14.8)
    for r_index, (cx, cy) in enumerate(rock_spots):
        if not rock_sources:
            break
        source = granite if granite is not None and r_index % 3 == 0 else rock_sources[r_index % len(rock_sources)]
        scale = rng.uniform(0.85, 1.55) if source is granite else rng.uniform(3.2, 6.5)
        _place_source(
            source,
            collection,
            (cx, cy, 0.0),
            f"TJ_CoverRock_{r_index:02d}",
            scale=(scale, scale * rng.uniform(0.8, 1.15), scale * rng.uniform(0.45, 0.75)),
            rotation_z=rng.uniform(-math.pi, math.pi),
        )
        counts["rocks"] += 1

    for t_index, (cx, cy) in enumerate(_cluster_centers(rng, 7, -0.5, 13.0)):
        source = twig_tilia if rng.random() < 0.55 else twig_oak
        if source is None:
            continue
        _place_source(
            source,
            collection,
            (cx, cy, 0.013),
            f"TJ_CoverTwig_{t_index:02d}",
            scale=(rng.uniform(0.8, 1.6), rng.uniform(0.8, 1.4), rng.uniform(0.7, 1.1)),
            rotation_z=rng.uniform(-math.pi, math.pi),
        )
        counts["twigs"] += 1

    if grass is not None:
        for u_index, (cx, cy) in enumerate(((-2.4, 1.1), (3.1, 2.6), (0.6, 5.4), (-4.0, 7.8))):
            factor = rng.uniform(0.7, 1.15)
            _place_source(
                grass,
                collection,
                (cx, cy, 0.0),
                f"TJ_CoverCarex_{u_index:02d}",
                scale=tuple(float(v) * factor for v in grass.scale),
                rotation_z=rng.uniform(-math.pi, math.pi),
            )
            counts["understory"] += 1
    if fern is not None:
        for u_index, (cx, cy) in enumerate(((1.8, 3.8), (-3.3, 9.2))):
            _place_source(
                fern,
                collection,
                (cx, cy, 0.0),
                f"TJ_CoverFern_{u_index:02d}",
                scale=tuple(float(v) * rng.uniform(0.85, 1.15) for v in fern.scale),
                rotation_z=rng.uniform(-math.pi, math.pi),
            )
            counts["understory"] += 1

    bpy.context.view_layer.update()
    return {
        "schema": "TIVVLEJOY_FOREST_CAMERA_GROUND_COVER_APPLY_V1",
        "feature": FEATURE,
        "applied": True,
        "footprint": camera_footprint(),
        "counts": counts,
        "sources": {
            "soil": SOIL_ALBEDO.name,
            "litter": "ovate Corylus/autumn clusters + appended Botaniq autumn leaves if present",
            "needles": NEEDLES_ALBEDO.name,
            "moss": MOSS_A.name if MOSS_A.is_file() else None,
            "rock": GRANITE_A.name if GRANITE_A.is_file() else None,
            "twig": TWIG_TILIA.name if TWIG_TILIA.is_file() else None,
        },
        "vendorGroundShaderChanged": False,
        "terrainChanged": False,
        "cameraChanged": False,
        "waterChanged": False,
        "lightingChanged": False,
        "compositionChanged": False,
        "backgroundVegetationChanged": False,
    }
