"""Apply already-owned TivvleJoy materials to isolated lookdev subjects only.

Production camera, terrain, purchased EcoKit identity, water, and the
cinematic lighting rig stay untouched. Lookdev copies get object-local
meshes/materials so shared EcoKit datablocks are not rewritten.
"""

from __future__ import annotations

from pathlib import Path

from forest_lookdev_isolation_v1 import FEATURE as LOOKDEV_FEATURE

FEATURE = "forest_owned_resource_recovery_v1"
COLLECTION_NAME = "TJ_LOOKDEV_ISOLATION_V1"

OWNED_ROOT = Path("/tmp/tivvlejoy-owned-recovery")
BOTANIQ_TEX = OWNED_ROOT / "botaniq" / "botaniq_full" / "textures"
BOTANIQ_MODELS = OWNED_ROOT / "botaniq" / "botaniq_full" / "blends" / "models"
FNKIT = OWNED_ROOT / "forest_nature" / "Textures_Stylized_Forest_Kit" / "1024"
HDRI_OWNED = OWNED_ROOT / "hdri"

BARK_ALBEDO = BOTANIQ_TEX / "bq_Bark_Tilia-europaea_Diffuse.jpg"
BARK_NORMAL = BOTANIQ_TEX / "bq_Bark_Tilia-europaea_Normal.jpg"
SOIL_ALBEDO = BOTANIQ_TEX / "bq_Soil_Loose_Diffuse.jpg"
SOIL_NORMAL = BOTANIQ_TEX / "bq_Soil_Loose_Normal.jpg"
LITTER_ALBEDO = BOTANIQ_TEX / "bq_Ground_Fallen_Leaves_Autumn_Diffuse.jpg"
LITTER_NORMAL = BOTANIQ_TEX / "bq_Ground_Fallen_Leaves_Autumn_Normal.jpg"
NEEDLES_ALBEDO = BOTANIQ_TEX / "bq_Ground_Fallen_Needles_Diffuse.jpg"
MOSS_ALBEDO = BOTANIQ_TEX / "bq_Moss_Diffuse.jpg"
ROCK_ALBEDO = BOTANIQ_TEX / "bq_Rock_Granite-brown_Diffuse.jpg"
ROCK_NORMAL = BOTANIQ_TEX / "bq_Rock_Granite-brown_Normal.jpg"
LEAF_ALBEDO = BOTANIQ_TEX / "bq_Leaf_Corylus-avellana_Diffuse_rgba.png"
LEAF_ALBEDO_SRC = BOTANIQ_TEX / "bq_Leaf_Corylus-avellana_Diffuse.png"
LEAF_NORMAL = BOTANIQ_TEX / "bq_Leaf_Corylus-avellana_Normal.jpg"
FLOWER_ALBEDO = BOTANIQ_TEX / "bq_Flowers_Diffuse.png"
FLOWER_NORMAL = BOTANIQ_TEX / "bq_Flowers_Normal.jpg"
GRASS_ALBEDO = BOTANIQ_TEX / "bq_Grass_Weeds_Short_Diffuse.jpg"
GRASS_NORMAL = BOTANIQ_TEX / "bq_Grass_Weeds_Short_Normal.jpg"

SHRUB_BLEND = BOTANIQ_MODELS / "shrubs" / "bq_Shrub_Corylus-avellana_A_spring-summer.blend"
GRASS_BLEND = BOTANIQ_MODELS / "grass" / "bq_Grass_Carex-oshimensis_A_spring.blend"
FERN_BLEND = BOTANIQ_MODELS / "plants" / "bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn.blend"

FNKIT_TRUNK_ALBEDO = FNKIT / "Trunks" / "Stylized_Trunk_01_basecolor.tga"
FNKIT_LEAF_ALBEDO = FNKIT / "Leaves" / "Leaves_01_BaseColor.tga"
FNKIT_LEAF_OPACITY = FNKIT / "Leaves" / "Leaves_01_Opacity.tga"

BARK_NORMAL_STRENGTH = 0.72
GROUND_NORMAL_STRENGTH = 0.55


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = LOOKDEV_FEATURE
    id_data["tj_recovery"] = FEATURE


def required_owned_paths() -> dict[str, Path]:
    return {
        "barkAlbedo": BARK_ALBEDO,
        "barkNormal": BARK_NORMAL,
        "soilAlbedo": SOIL_ALBEDO,
        "soilNormal": SOIL_NORMAL,
        "litterAlbedo": LITTER_ALBEDO,
        "mossAlbedo": MOSS_ALBEDO,
        "leafAlbedo": LEAF_ALBEDO if LEAF_ALBEDO.is_file() else LEAF_ALBEDO_SRC,
        "leafNormal": LEAF_NORMAL,
        "flowerAlbedo": FLOWER_ALBEDO,
        "rockAlbedo": ROCK_ALBEDO,
        "shrubBlend": SHRUB_BLEND,
        "grassBlend": GRASS_BLEND,
        "fernBlend": FERN_BLEND,
    }


def missing_owned_paths() -> list[str]:
    return [name for name, path in required_owned_paths().items() if not path.is_file()]


def _load_image(path: Path, colorspace: str):
    import bpy

    if not path.is_file():
        raise RuntimeError("OWNED_TEXTURE_MISSING:" + path.name)
    image = bpy.data.images.get(path.name)
    if image is None:
        image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = colorspace
    _tag(image)
    return image


def _new_material(name: str):
    import bpy

    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    _tag(material)
    return material


def _principled(nodes, links):
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    if "Specular IOR Level" in shader.inputs:
        shader.inputs["Specular IOR Level"].default_value = 0.28
    elif "Specular" in shader.inputs:
        shader.inputs["Specular"].default_value = 0.28
    return shader


def _tex_node(nodes, image, non_color: bool):
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    node.interpolation = "Smart"
    if non_color:
        node.image.colorspace_settings.name = "Non-Color"
    return node


def _mix_color(nodes, name: str):
    try:
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
    except Exception:
        node = nodes.new("ShaderNodeMixRGB")
    node.name = name
    return node


def _mix_color_sockets(node):
    names = [socket.name for socket in node.inputs]
    if "A" in names and "B" in names:
        return node.inputs["Factor"] if "Factor" in names else node.inputs[0], node.inputs["A"], node.inputs["B"]
    return node.inputs[0], node.inputs[1], node.inputs[2]


def _mix_color_out(node):
    if "Result" in node.outputs:
        return node.outputs["Result"]
    return node.outputs[0]


def assign_object_material(obj, material, copy_mesh: bool = True) -> None:
    if copy_mesh and obj.data is not None and getattr(obj.data, "materials", None) is not None:
        if obj.data.users > 1 or not obj.data.name.startswith("TJ_Lookdev"):
            obj.data = obj.data.copy()
            obj.data.name = f"TJ_Lookdev_{obj.name}_Mesh"
            _tag(obj.data)
    if obj.data is not None and hasattr(obj.data, "materials"):
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if obj.material_slots:
        for slot in obj.material_slots:
            slot.link = "OBJECT"
            slot.material = material


def make_bark_material():
    import bpy

    material = _new_material("TJ_OwnedBark_Tilia_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = _principled(nodes, links)
    albedo = _tex_node(nodes, _load_image(BARK_ALBEDO, "sRGB"), False)
    normal_tex = _tex_node(nodes, _load_image(BARK_NORMAL, "Non-Color"), True)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.0, 0.42, 1.0)
    coord = nodes.new("ShaderNodeTexCoord")
    links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], albedo.inputs["Vector"])
    links.new(mapping.outputs["Vector"], normal_tex.inputs["Vector"])
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.82
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = BARK_NORMAL_STRENGTH
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_ground_material():
    material = _new_material("TJ_OwnedGround_SoilLitterMoss_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = _principled(nodes, links)
    coord = nodes.new("ShaderNodeTexCoord")
    soil_map = nodes.new("ShaderNodeMapping")
    soil_map.inputs["Scale"].default_value = (2.4, 2.4, 2.4)
    litter_map = nodes.new("ShaderNodeMapping")
    litter_map.inputs["Scale"].default_value = (1.55, 1.55, 1.55)
    litter_map.inputs["Rotation"].default_value = (0.0, 0.0, 0.35)
    moss_map = nodes.new("ShaderNodeMapping")
    moss_map.inputs["Scale"].default_value = (3.2, 3.2, 3.2)
    for mapping in (soil_map, litter_map, moss_map):
        links.new(coord.outputs["UV"], mapping.inputs["Vector"])

    soil = _tex_node(nodes, _load_image(SOIL_ALBEDO, "sRGB"), False)
    soil_n = _tex_node(nodes, _load_image(SOIL_NORMAL, "Non-Color"), True)
    litter = _tex_node(nodes, _load_image(LITTER_ALBEDO, "sRGB"), False)
    litter_n = _tex_node(nodes, _load_image(LITTER_NORMAL, "Non-Color"), True)
    needles = _tex_node(nodes, _load_image(NEEDLES_ALBEDO, "sRGB"), False)
    moss = _tex_node(nodes, _load_image(MOSS_ALBEDO, "sRGB"), False)
    for node, mapping in (
        (soil, soil_map),
        (soil_n, soil_map),
        (litter, litter_map),
        (litter_n, litter_map),
        (needles, litter_map),
        (moss, moss_map),
    ):
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])

    litter_noise = nodes.new("ShaderNodeTexNoise")
    litter_noise.inputs["Scale"].default_value = 6.5
    litter_noise.inputs["Detail"].default_value = 8.0
    moss_noise = nodes.new("ShaderNodeTexNoise")
    moss_noise.inputs["Scale"].default_value = 4.2
    moss_noise.inputs["Detail"].default_value = 6.0
    links.new(coord.outputs["UV"], litter_noise.inputs["Vector"])
    links.new(coord.outputs["UV"], moss_noise.inputs["Vector"])

    litter_ramp = nodes.new("ShaderNodeValToRGB")
    litter_ramp.color_ramp.elements[0].position = 0.28
    litter_ramp.color_ramp.elements[1].position = 0.62
    moss_ramp = nodes.new("ShaderNodeValToRGB")
    moss_ramp.color_ramp.elements[0].position = 0.74
    moss_ramp.color_ramp.elements[1].position = 0.88
    links.new(litter_noise.outputs["Fac"], litter_ramp.inputs["Fac"])
    links.new(moss_noise.outputs["Fac"], moss_ramp.inputs["Fac"])

    mix_needles = _mix_color(nodes, "TJ_OwnedLitterNeedles")
    fac, color_a, color_b = _mix_color_sockets(mix_needles)
    fac.default_value = 0.22
    links.new(litter.outputs["Color"], color_a)
    links.new(needles.outputs["Color"], color_b)

    mix_litter = _mix_color(nodes, "TJ_OwnedSoilLitter")
    fac, color_a, color_b = _mix_color_sockets(mix_litter)
    links.new(soil.outputs["Color"], color_a)
    links.new(_mix_color_out(mix_needles), color_b)
    links.new(litter_ramp.outputs["Color"], fac)

    mix_moss = _mix_color(nodes, "TJ_OwnedLitterMoss")
    fac, color_a, color_b = _mix_color_sockets(mix_moss)
    links.new(_mix_color_out(mix_litter), color_a)
    links.new(moss.outputs["Color"], color_b)
    links.new(moss_ramp.outputs["Color"], fac)
    links.new(_mix_color_out(mix_moss), shader.inputs["Base Color"])

    shader.inputs["Roughness"].default_value = 0.86
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = GROUND_NORMAL_STRENGTH
    links.new(litter_n.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_rock_material():
    material = _new_material("TJ_OwnedRock_Granite_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = _principled(nodes, links)
    albedo = _tex_node(nodes, _load_image(ROCK_ALBEDO, "sRGB"), False)
    normal_tex = _tex_node(nodes, _load_image(ROCK_NORMAL, "Non-Color"), True)
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.78
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.65
    links.new(normal_tex.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_cutout_material(name: str, albedo_path: Path, normal_path: Path | None, translucent: bool):
    import bpy

    material = _new_material(name)
    material.blend_method = "HASHED"
    if hasattr(material, "shadow_method"):
        material.shadow_method = "HASHED"
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = _principled(nodes, links)
    albedo = _tex_node(nodes, _load_image(albedo_path, "sRGB"), False)
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    if "Alpha" in albedo.outputs and "Alpha" in shader.inputs:
        links.new(albedo.outputs["Alpha"], shader.inputs["Alpha"])
    shader.inputs["Roughness"].default_value = 0.58
    if "Specular IOR Level" in shader.inputs:
        shader.inputs["Specular IOR Level"].default_value = 0.18
    if normal_path is not None and normal_path.is_file():
        normal_tex = _tex_node(nodes, _load_image(normal_path, "Non-Color"), True)
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.55
        links.new(normal_tex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    if translucent:
        trans = nodes.new("ShaderNodeBsdfTranslucent")
        links.new(albedo.outputs["Color"], trans.inputs["Color"])
        mix = nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = 0.22
        output = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")
        for link in list(links):
            if link.to_node == output:
                links.remove(link)
        links.new(shader.outputs["BSDF"], mix.inputs[1])
        links.new(trans.outputs["BSDF"], mix.inputs[2])
        links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def remap_botaniq_images() -> int:
    import bpy

    remapped = 0
    for image in bpy.data.images:
        name = Path(image.filepath or image.name).name
        candidate = BOTANIQ_TEX / name
        rgba = BOTANIQ_TEX / (Path(name).stem + "_rgba.png")
        chosen = rgba if rgba.is_file() else candidate
        if not chosen.is_file():
            continue
        if image.size[0] == 0 or Path(image.filepath).name != chosen.name:
            image.filepath = str(chosen)
            try:
                image.reload()
            except Exception:
                continue
            if "normal" in chosen.name.lower():
                image.colorspace_settings.name = "Non-Color"
            remapped += 1
            _tag(image)
    return remapped


def _append_object(blend_path: Path, object_name: str):
    import bpy

    if not blend_path.is_file():
        raise RuntimeError("OWNED_BLEND_MISSING:" + blend_path.name)
    before = set(bpy.data.objects.keys())
    bpy.ops.wm.append(
        filepath=str(blend_path / "Object" / object_name),
        directory=str(blend_path / "Object") + "/",
        filename=object_name,
    )
    added = [name for name in bpy.data.objects.keys() if name not in before]
    if not added:
        obj = bpy.data.objects.get(object_name)
        if obj is None:
            raise RuntimeError("OWNED_APPEND_FAILED:" + object_name)
        return obj
    return bpy.data.objects[added[0]]


def _place_owned(obj, collection, location, name, scale=None):
    from mathutils import Vector

    if obj.name not in collection.objects:
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        collection.objects.link(obj)
    obj.name = name
    obj.location = Vector(location)
    if scale is not None:
        obj.scale = tuple(scale)
    obj.hide_render = False
    obj.hide_viewport = False
    _tag(obj)
    return obj


def _hide(obj) -> None:
    if obj is None:
        return
    obj.hide_render = True
    obj.hide_viewport = True


def _make_card(collection, name, location, rotation, scale, material):
    import bpy
    from mathutils import Euler, Vector

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(
        [(-0.5, 0.0, 0.0), (0.5, 0.0, 0.0), (0.5, 0.0, 1.0), (-0.5, 0.0, 1.0)],
        [],
        [(0, 1, 2, 3)],
    )
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector(location)
    obj.rotation_euler = Euler(rotation)
    obj.scale = scale
    mesh.materials.append(material)
    _tag(mesh)
    _tag(obj)
    return obj


def apply_owned_resource_recovery(scene) -> dict:
    import bpy

    missing = missing_owned_paths()
    if missing:
        return {
            "schema": "TIVVLEJOY_FOREST_OWNED_RESOURCE_RECOVERY_APPLY_V1",
            "applied": False,
            "blocked": True,
            "missing": missing,
        }

    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        raise RuntimeError("LOOKDEV_COLLECTION_MISSING")

    bark_mat = make_bark_material()
    ground_mat = make_ground_material()
    rock_mat = make_rock_material()
    leaf_mat = make_cutout_material("TJ_OwnedLeaf_Corylus_V1", LEAF_ALBEDO if LEAF_ALBEDO.is_file() else LEAF_ALBEDO_SRC, LEAF_NORMAL, True)
    flower_mat = make_cutout_material("TJ_OwnedFlower_Atlas_V1", FLOWER_ALBEDO, FLOWER_NORMAL, True)

    trunk = bpy.data.objects.get("TJ_LookdevTrunk")
    if trunk is not None:
        assign_object_material(trunk, bark_mat, copy_mesh=True)

    ground = bpy.data.objects.get("TJ_LookdevGroundPatch")
    if ground is not None:
        assign_object_material(ground, ground_mat, copy_mesh=False)

    rock = bpy.data.objects.get("TJ_LookdevRock")
    if rock is not None:
        assign_object_material(rock, rock_mat, copy_mesh=True)

    rename_hidden = {
        "TJ_LookdevBush": "TJ_HiddenEcoKitBush",
        "TJ_LookdevLeaf": "TJ_HiddenEcoKitLeaf",
        "TJ_LookdevGrass": "TJ_HiddenEcoKitGrass",
        "TJ_LookdevFlower": "TJ_HiddenEcoKitFlower",
    }
    for name in list(bpy.data.objects.keys()):
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        if name.startswith("TJ_LookdevFallen") or name in {
            "TJ_LookdevMoss",
            "TJ_LookdevGroundGrass",
        }:
            obj["tj_feature"] = "forest_owned_resource_recovery_hidden"
            _hide(obj)
            continue
        if name in rename_hidden:
            obj.name = rename_hidden[name]
            obj["tj_feature"] = "forest_owned_resource_recovery_hidden"
            _hide(obj)

    remapped = remap_botaniq_images()
    shrub = _append_object(SHRUB_BLEND, "bq_Shrub_Corylus-avellana_A_spring-summer")
    grass = _append_object(GRASS_BLEND, "bq_Grass_Carex-oshimensis_A_spring")
    fern = _append_object(FERN_BLEND, "bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn")
    remapped += remap_botaniq_images()

    ox, oy, oz = 90.0, 0.0, 0.0
    _place_owned(shrub, collection, (ox + 8.0, oy, oz), "TJ_LookdevBush", scale=(1.15, 1.15, 1.15))
    _place_owned(grass, collection, (ox + 20.0, oy - 0.25, oz), "TJ_LookdevGrass", scale=(1.35, 1.35, 1.45))
    _place_owned(fern, collection, (ox + 20.35, oy + 0.35, oz), "TJ_LookdevFlower", scale=(1.05, 1.05, 1.05))

    grass_b = grass.copy()
    grass_b.data = grass.data
    collection.objects.link(grass_b)
    grass_b.name = "TJ_LookdevGrass_B"
    grass_b.location = (ox + 20.25, oy + 0.15, oz)
    grass_b.rotation_euler.z = 0.9
    grass_b.scale = (1.2, 1.2, 1.25)
    _tag(grass_b)

    leaf_a = _make_card(collection, "TJ_LookdevLeaf", (ox + 14.0, oy, oz + 0.15), (0.12, 0.0, 0.18), (0.55, 0.55, 0.55), leaf_mat)
    leaf_b = _make_card(collection, "TJ_LookdevLeaf_B", (ox + 14.12, oy + 0.04, oz + 0.12), (0.18, 0.35, 1.15), (0.48, 0.48, 0.48), leaf_mat)
    flower = _make_card(collection, "TJ_LookdevFlowerCard", (ox + 20.55, oy - 0.05, oz + 0.08), (0.08, 0.0, -0.4), (0.28, 0.28, 0.28), flower_mat)

    return {
        "schema": "TIVVLEJOY_FOREST_OWNED_RESOURCE_RECOVERY_APPLY_V1",
        "applied": True,
        "blocked": False,
        "feature": FEATURE,
        "missing": [],
        "imagesRemapped": remapped,
        "barkSource": str(BARK_ALBEDO),
        "groundLayers": ["soil_loose", "fallen_leaves", "fallen_needles", "moss"],
        "bushSource": SHRUB_BLEND.name,
        "leafSource": (LEAF_ALBEDO if LEAF_ALBEDO.is_file() else LEAF_ALBEDO_SRC).name,
        "grassFlowerSource": [GRASS_BLEND.name, FERN_BLEND.name, FLOWER_ALBEDO.name],
        "fnkitInspected": {
            "trunkAlbedo": FNKIT_TRUNK_ALBEDO.is_file(),
            "leafAlbedo": FNKIT_LEAF_ALBEDO.is_file(),
            "leafOpacity": FNKIT_LEAF_OPACITY.is_file(),
        },
        "subjects": {
            "trunk": None if trunk is None else trunk.name,
            "ground": None if ground is None else ground.name,
            "rock": None if rock is None else rock.name,
            "bush": shrub.name,
            "leaf": leaf_a.name,
            "leafCross": leaf_b.name,
            "grass": grass.name,
            "fern": fern.name,
            "flowerCard": flower.name,
        },
        "cameraChanged": False,
        "productionGeometryChanged": False,
        "lightingChanged": False,
        "waterChanged": False,
        "purchasedAssetsPreserved": True,
    }
