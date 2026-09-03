"""Locked-camera forest-floor dressing. Does not touch the vendor ground shader.

Covers the visible TJ_VendorGround footprint — and the preserved EcoKit floral
cards that sit on top of it at y >= 18 — with owned Botaniq meshes and
localized soil/litter/moss/rock materials.

Those floral cards are not hidden or edited (background lock). Cover geometry
is placed above their z=0.015 plane so the locked camera reads dressed earth
instead of the card albedo.

Terrain, camera, water, lighting, and background EcoKit plants stay locked.
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
    LITTER_ALBEDO,
    LITTER_NORMAL,
    MOSS_ALBEDO,
    NEEDLES_ALBEDO,
    ROCK_ALBEDO,
    ROCK_NORMAL,
    SOIL_ALBEDO,
    SOIL_NORMAL,
    SOIL_ROUGH_ALBEDO,
    _instance_like,
    fern_albedo_path,
    leaf_albedo_path,
    make_foliage_material,
    make_opaque_pbr,
    write_world_metre_uvs,
)

FEATURE = "forest_camera_ground_cover_v1"
COLLECTION_NAME = "TJ_CAMERA_GROUND_COVER_V1"

# Preserved EcoKit Floral_* cards at y >= 18 are 100–200 m quads at this height.
# Cover must sit above them. Do not hide or relocate those objects.
FLORAL_CARD_Z = 0.015
COVER_CLEARANCE_Z = 0.034

# Visible floor from TJ_VendorReference_Camera at (0, -12.5, 2.15), 42 mm.
# Horizon ground is ~60–100 m out; V1–V3 stopped at y=38 and left a salmon band.
FOOTPRINT = {
    "xMin": -40.0,
    "xMax": 40.0,
    "yMin": -5.0,
    "yMax": 100.0,
    "heroY": 8.0,
    "midY": 18.0,
    "farY": 36.0,
}

MOSS_A = BOTANIQ_MODELS / "mosses-and-lichens" / "bq_Moss_Rhytidiadelphus-squarrosus_A_spring-summer-autumn.blend"
MOSS_B = BOTANIQ_MODELS / "mosses-and-lichens" / "bq_Moss_Rhytidiadelphus-squarrosus_B_spring-summer-autumn.blend"
GRANITE_A = BOTANIQ_MODELS / "rocks" / "bq_Rock_Granite_A_spring-summer-autumn.blend"
PEBBLE_A = BOTANIQ_MODELS / "rocks" / "bq_Rock_Pebble_A_spring-summer-autumn.blend"
PEBBLE_B = BOTANIQ_MODELS / "rocks" / "bq_Rock_Pebble_B_spring-summer-autumn.blend"
TWIG_TILIA = BOTANIQ_MODELS / "misc" / "bq_Twig_Tilia-europaea_A_spring-summer-autumn.blend"
TWIG_OAK = BOTANIQ_MODELS / "misc" / "bq_Twig_Quercus-robur_A_spring-summer-autumn.blend"
TWIG_SPRUCE = BOTANIQ_MODELS / "misc" / "bq_Twig_Picea-abies_A_spring-summer-autumn.blend"


def camera_footprint() -> dict:
    return dict(FOOTPRINT)


def in_footprint(x: float, y: float) -> bool:
    return FOOTPRINT["xMin"] <= x <= FOOTPRINT["xMax"] and FOOTPRINT["yMin"] <= y <= FOOTPRINT["yMax"]


def _frustum_half_x(y: float) -> float:
    """Half-width of the locked 42 mm floor strip at world y, plus margin."""
    distance = max(y + 12.5, 4.0)
    return max(16.0, min(40.0, distance * 0.50 + 5.0))


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


def _grade_albedo(nodes, links, color_socket, hue: float, sat: float, value: float, grade, mix_fac: float):
    from forest_botaniq_production_recovery_v1 import _mix_color, _mix_out, _mix_sockets

    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Hue"].default_value = hue
    hsv.inputs["Saturation"].default_value = sat
    hsv.inputs["Value"].default_value = value
    links.new(color_socket, hsv.inputs["Color"])
    mix = _mix_color(nodes, "TJ_CoverGrade")
    fac, sock_a, sock_b = _mix_sockets(mix)
    fac.default_value = mix_fac
    links.new(hsv.outputs["Color"], sock_a)
    sock_b.default_value = (*grade, 1.0)
    return _mix_out(mix)


def make_soil_cover_material(name: str = "TJ_CoverSoil_Loose_V1", albedo=None, normal=None):
    """Dark earth for cover patches only. Matches the isolated-PASS soil grade.

    Cover V1–V3 used Value=0.70 and read gray under locked lookdev lighting.
    Isolated TJ_ProdGround uses Value=0.36 plus a dark-earth mix.
    """
    from forest_botaniq_production_recovery_v1 import _load_image, _principled

    material = _new_material(name)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.85, 0.85, 0.85)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(albedo or SOIL_ALBEDO, "sRGB")
    links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    # V4 crushed chroma (sat 0.78, value 0.34, near-black mix) and the
    # locked camera floor read RGB ~66,64,67. Boost warmth so earth survives
    # cool HDRI/AgX without returning to V1 terracotta.
    graded = _grade_albedo(
        nodes,
        links,
        tex.outputs["Color"],
        hue=0.38,
        sat=1.25,
        value=0.58,
        grade=(0.18, 0.10, 0.04),
        mix_fac=0.32,
    )
    links.new(graded, shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.93
    n_path = normal if normal is not None else SOIL_NORMAL
    if n_path is not None and n_path.is_file():
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = _load_image(n_path, "Non-Color")
        ntex.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.42
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_litter_patch_material():
    """Muted decomposed litter. Autumn albedo is graded down so it cannot carpet."""
    from forest_botaniq_production_recovery_v1 import _load_image, _principled

    material = _new_material("TJ_CoverLitterPatch_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.72, 0.72, 0.72)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(LITTER_ALBEDO, "sRGB")
    links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    graded = _grade_albedo(
        nodes,
        links,
        tex.outputs["Color"],
        hue=0.08,
        sat=0.42,
        value=0.40,
        grade=(0.10, 0.07, 0.04),
        mix_fac=0.38,
    )
    links.new(graded, shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.90
    if LITTER_NORMAL.is_file():
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = _load_image(LITTER_NORMAL, "Non-Color")
        ntex.image.colorspace_settings.name = "Non-Color"
        links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.35
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_needle_patch_material():
    from forest_botaniq_production_recovery_v1 import _load_image, _principled

    material = _new_material("TJ_CoverNeedles_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.90, 0.90, 0.90)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(NEEDLES_ALBEDO, "sRGB")
    links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    graded = _grade_albedo(
        nodes,
        links,
        tex.outputs["Color"],
        hue=0.48,
        sat=0.38,
        value=0.38,
        grade=(0.08, 0.07, 0.04),
        mix_fac=0.34,
    )
    links.new(graded, shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.88
    return material


def make_moss_patch_material():
    """Thin ground-conforming moss. Not a hemisphere. Secondary to soil."""
    from forest_botaniq_production_recovery_v1 import _load_image, _principled

    material = _new_material("TJ_CoverMossPatch_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.55, 0.55, 0.55)
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(MOSS_ALBEDO, "sRGB")
    links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    graded = _grade_albedo(
        nodes,
        links,
        tex.outputs["Color"],
        hue=0.50,
        sat=0.48,
        value=0.42,
        grade=(0.05, 0.07, 0.03),
        mix_fac=0.40,
    )
    links.new(graded, shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.86
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


def make_irregular_patch(collection, name, location, radius, rotation_z, material, rng, z=COVER_CLEARANCE_Z):
    """Low irregular earth/litter/moss patch. Not a scene-wide plane. Not a hemisphere."""
    import bpy
    from mathutils import Vector

    segments = 13
    verts = [(0.0, 0.0, rng.uniform(0.004, 0.010))]
    faces = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        jitter = rng.uniform(0.58, 1.12)
        verts.append(
            (
                math.cos(angle) * jitter,
                math.sin(angle) * jitter,
                rng.uniform(0.001, 0.008),
            )
        )
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector((location[0], location[1], z))
    obj.rotation_euler.z = rotation_z
    obj.scale = (radius, radius * rng.uniform(0.68, 1.22), 1.0)
    mesh.materials.append(material)
    _cover_tag(mesh)
    _cover_tag(obj)
    bpy.context.view_layer.update()
    write_world_metre_uvs(obj)
    return obj


def make_ovate_leaf(collection, name, location, material, rng):
    """Crumpled ovate leaf mesh. Not a rectangular card."""
    import bpy
    from mathutils import Euler, Vector

    width = rng.uniform(0.10, 0.18)
    length = rng.uniform(0.14, 0.26)
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
    y = FOOTPRINT["yMin"]
    row = 0
    while y <= FOOTPRINT["yMax"]:
        if y < FOOTPRINT["midY"]:
            spacing, r0, r1 = 1.55, 1.90, 2.60
        elif y < FOOTPRINT["farY"]:
            spacing, r0, r1 = 2.45, 2.90, 4.00
        else:
            spacing, r0, r1 = 5.60, 6.40, 9.20
        x = FOOTPRINT["xMin"] + (0.48 * spacing if row % 2 else 0.0)
        half = _frustum_half_x(y)
        while x <= FOOTPRINT["xMax"]:
            px = x + rng.uniform(-0.24 * spacing, 0.24 * spacing)
            py = y + rng.uniform(-0.22 * spacing, 0.22 * spacing)
            if in_footprint(px, py) and abs(px) <= half + 2.0:
                sites.append((px, py, rng.uniform(r0, r1), rng.uniform(-math.pi, math.pi)))
            x += spacing
        y += spacing * 0.70
        row += 1
    return sites


def _cluster_centers(rng, count: int, y_min: float, y_max: float) -> list[tuple[float, float]]:
    attractors = [(-3.1, 2.2), (2.4, 4.8), (-1.2, 8.6), (3.6, 12.1), (0.1, 0.4), (-4.4, 6.5), (4.8, 9.4), (-0.8, 15.2)]
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
    soil_rough = (
        make_soil_cover_material("TJ_CoverSoil_Rough_V1", SOIL_ROUGH_ALBEDO, None)
        if SOIL_ROUGH_ALBEDO.is_file()
        else soil_mat
    )
    leaf_mat = make_foliage_material("TJ_CoverLeaf_Corylus_V1", leaf_albedo_path(), LEAF_NORMAL, 0.10, clip=True)
    autumn_mat = make_foliage_material("TJ_CoverLeaf_Autumn_V1", leaf_albedo_path(), LEAF_NORMAL, 0.08, clip=True)
    if autumn_mat.node_tree:
        hsv = autumn_mat.node_tree.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Hue"].default_value = 0.07
        hsv.inputs["Saturation"].default_value = 0.48
        hsv.inputs["Value"].default_value = 0.52
        links = autumn_mat.node_tree.links
        image_nodes = [node for node in autumn_mat.node_tree.nodes if node.bl_idname == "ShaderNodeTexImage"]
        shader = next((node for node in autumn_mat.node_tree.nodes if node.bl_idname == "ShaderNodeBsdfPrincipled"), None)
        if image_nodes and shader is not None:
            for link in list(links):
                if link.to_socket == shader.inputs["Base Color"]:
                    links.remove(link)
            links.new(image_nodes[0].outputs["Color"], hsv.inputs["Color"])
            links.new(hsv.outputs["Color"], shader.inputs["Base Color"])
    litter_mat = make_litter_patch_material()
    needle_mat = make_needle_patch_material()
    moss_mat = make_moss_patch_material()
    rock_mat = make_opaque_pbr("TJ_CoverRock_Granite_V1", ROCK_ALBEDO, ROCK_NORMAL, 0.78, mapping="object")
    # Stem_Diffuse is saturated green grass tissue. Twigs must read as wood.
    stem_mat = make_opaque_pbr(
        "TJ_CoverTwig_V1",
        CORYLUS_BARK_ALBEDO,
        CORYLUS_BARK_NORMAL,
        0.78,
        mapping="object",
    )

    moss_a = _append_named(MOSS_A, "bq_Moss_Rhytidiadelphus-squarrosus_A_spring-summer-autumn")
    moss_b = _append_named(MOSS_B, "bq_Moss_Rhytidiadelphus-squarrosus_B_spring-summer-autumn")
    granite = _append_named(GRANITE_A, "bq_Rock_Granite_A_spring-summer-autumn")
    pebble_a = _append_named(PEBBLE_A, "bq_Rock_Pebble_A_spring-summer-autumn")
    pebble_b = _append_named(PEBBLE_B, "bq_Rock_Pebble_B_spring-summer-autumn")
    twig_tilia = _append_named(TWIG_TILIA, "bq_Twig_Tilia-europaea_A_spring-summer-autumn")
    twig_oak = _append_named(TWIG_OAK, "bq_Twig_Quercus-robur_A_spring-summer-autumn")
    twig_spruce = _append_named(TWIG_SPRUCE, "bq_Twig_Picea-abies_A_spring-summer-autumn")

    grass = bpy.data.objects.get("bq_Grass_Carex-oshimensis_A_spring")
    fern = bpy.data.objects.get("bq_Plant_Dryopteris-carthusiana_A_spring")
    if fern is None:
        fern = bpy.data.objects.get("bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn")

    for source, mat in (
        (moss_a, moss_mat),
        (moss_b, moss_mat),
        (granite, rock_mat),
        (pebble_a, rock_mat),
        (pebble_b, rock_mat),
        (twig_tilia, stem_mat),
        (twig_oak, stem_mat),
        (twig_spruce, stem_mat),
    ):
        if source is not None and mat is not None:
            if not source.material_slots:
                source.data.materials.append(mat)
            for slot in source.material_slots:
                slot.link = "OBJECT"
                slot.material = mat

    counts = {
        "soilPatches": 0,
        "litterPatches": 0,
        "litterLeaves": 0,
        "needlePatches": 0,
        "mossPatches": 0,
        "mossClumps": 0,
        "rocks": 0,
        "twigs": 0,
        "understory": 0,
    }

    for index, (x, y, radius, rot) in enumerate(_soil_sites(rng)):
        mat = soil_rough if index % 4 == 2 else soil_mat
        make_irregular_patch(collection, f"TJ_CoverSoil_{index:03d}", (x, y), radius, rot, mat, rng)
        counts["soilPatches"] += 1

    for c_index, (cx, cy) in enumerate(_cluster_centers(rng, 20, -1.8, 16.0)):
        pile = rng.randint(2, 4)
        for piece in range(pile):
            make_irregular_patch(
                collection,
                f"TJ_CoverLitterPatch_{c_index:02d}_{piece:02d}",
                (cx + rng.uniform(-0.55, 0.55), cy + rng.uniform(-0.55, 0.55)),
                rng.uniform(0.70, 1.35),
                rng.uniform(-math.pi, math.pi),
                litter_mat,
                rng,
                z=COVER_CLEARANCE_Z + 0.006,
            )
            counts["litterPatches"] += 1
        hero = cy < FOOTPRINT["heroY"]
        for leaf_i in range(rng.randint(3, 6) if hero else rng.randint(2, 4)):
            lx = cx + rng.uniform(-0.38, 0.38)
            ly = cy + rng.uniform(-0.38, 0.38)
            if not in_footprint(lx, ly):
                continue
            leaf = make_ovate_leaf(
                collection,
                f"TJ_CoverLitter_{c_index:02d}_{leaf_i:02d}",
                (lx, ly, COVER_CLEARANCE_Z + rng.uniform(0.008, 0.016)),
                autumn_mat if rng.random() < 0.35 else leaf_mat,
                rng,
            )
            if hero:
                leaf.scale = tuple(float(v) * rng.uniform(1.6, 2.2) for v in leaf.scale)
            counts["litterLeaves"] += 1

    for n_index, (cx, cy) in enumerate(_cluster_centers(rng, 10, -0.6, 15.0)):
        make_irregular_patch(
            collection,
            f"TJ_CoverNeedlePatch_{n_index:02d}",
            (cx, cy),
            rng.uniform(0.45, 0.85),
            rng.uniform(-math.pi, math.pi),
            needle_mat,
            rng,
            z=COVER_CLEARANCE_Z + 0.005,
        )
        counts["needlePatches"] += 1
        if twig_spruce is not None:
            _place_source(
                twig_spruce,
                collection,
                (cx + rng.uniform(-0.2, 0.2), cy, COVER_CLEARANCE_Z),
                f"TJ_CoverSpruceTwig_{n_index:02d}",
                scale=(rng.uniform(0.9, 1.5), rng.uniform(0.9, 1.4), rng.uniform(0.8, 1.2)),
                rotation_z=rng.uniform(-math.pi, math.pi),
            )
            counts["twigs"] += 1

    for m_index, (cx, cy) in enumerate(_cluster_centers(rng, 12, -0.8, 16.5)):
        make_irregular_patch(
            collection,
            f"TJ_CoverMossPatch_{m_index:02d}",
            (cx, cy),
            rng.uniform(0.40, 0.85),
            rng.uniform(-math.pi, math.pi),
            moss_mat,
            rng,
            z=COVER_CLEARANCE_Z + 0.004,
        )
        counts["mossPatches"] += 1

    moss_sources = [item for item in (moss_a, moss_b) if item is not None]
    for m_index, (cx, cy) in enumerate(_cluster_centers(rng, 8, -0.6, 14.0)):
        if not moss_sources:
            continue
        source = moss_sources[m_index % len(moss_sources)]
        sx = rng.uniform(2.2, 3.4)
        _place_source(
            source,
            collection,
            (cx, cy, COVER_CLEARANCE_Z),
            f"TJ_CoverMossClump_{m_index:02d}",
            scale=(sx, sx, rng.uniform(0.55, 0.95)),
            rotation_z=rng.uniform(-math.pi, math.pi),
        )
        counts["mossClumps"] += 1

    rock_sources = [item for item in (granite, pebble_a, pebble_b) if item is not None]
    for r_index, (cx, cy) in enumerate(_cluster_centers(rng, 8, -0.4, 14.8)):
        if not rock_sources:
            break
        source = granite if granite is not None and r_index % 3 == 0 else rock_sources[r_index % len(rock_sources)]
        scale = rng.uniform(0.85, 1.55) if source is granite else rng.uniform(3.2, 6.5)
        _place_source(
            source,
            collection,
            (cx, cy, COVER_CLEARANCE_Z - 0.01),
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
            (cx, cy, COVER_CLEARANCE_Z),
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

    vendor = bpy.data.objects.get("TJ_VendorGround")
    vendor_hidden = False
    if vendor is not None:
        # Object stays in the scene. Shader is untouched. Hide only so the
        # far plane edge cannot flash salmon past the cover layer.
        vendor.hide_render = True
        vendor_hidden = True
    bpy.context.view_layer.update()
    return {
        "schema": "TIVVLEJOY_FOREST_CAMERA_GROUND_COVER_APPLY_V1",
        "feature": FEATURE,
        "applied": True,
        "footprint": camera_footprint(),
        "coverClearanceZ": COVER_CLEARANCE_Z,
        "floralCardZ": FLORAL_CARD_Z,
        "counts": counts,
        "sources": {
            "soil": SOIL_ALBEDO.name,
            "soilRough": SOIL_ROUGH_ALBEDO.name if SOIL_ROUGH_ALBEDO.is_file() else None,
            "litter": "irregular Fallen_Leaves_Autumn patches + sparse ovate Corylus",
            "needles": NEEDLES_ALBEDO.name,
            "moss": "Moss_Diffuse patches + low Rhytidiadelphus clumps",
            "rock": GRANITE_A.name if GRANITE_A.is_file() else None,
            "twig": TWIG_TILIA.name if TWIG_TILIA.is_file() else None,
        },
        "vendorGroundShaderChanged": False,
        "vendorGroundHiddenAfterCover": vendor_hidden,
        "terrainChanged": False,
        "cameraChanged": False,
        "waterChanged": False,
        "lightingChanged": False,
        "compositionChanged": False,
        "backgroundVegetationChanged": False,
    }
