"""Botaniq production vegetation substitution and forest material rebuild.

Preserves approved camera, creek, terrain topology, composition, and lighting.
Replaces defective EcoKit cards/UVs/shaders with already-owned Botaniq sources.
Vendor Botaniq group nodes are discarded; foliage is rebuilt as local Principled.
"""

from __future__ import annotations

import math
from pathlib import Path

from forest_lookdev_isolation_v1 import FEATURE as LOOKDEV_FEATURE

FEATURE = "forest_botaniq_production_recovery_v1"
COLLECTION_NAME = "TJ_LOOKDEV_ISOLATION_V1"

OWNED_ROOT = Path("/tmp/tivvlejoy-owned-recovery")
BOTANIQ_TEX = OWNED_ROOT / "botaniq" / "botaniq_full" / "textures"
BOTANIQ_MODELS = OWNED_ROOT / "botaniq" / "botaniq_full" / "blends" / "models"
FNKIT = OWNED_ROOT / "forest_nature" / "Textures_Stylized_Forest_Kit" / "1024"

TILIA_ALBEDO = BOTANIQ_TEX / "bq_Bark_Tilia-europaea_Diffuse.jpg"
TILIA_NORMAL = BOTANIQ_TEX / "bq_Bark_Tilia-europaea_Normal.jpg"
FNKIT_ALBEDO = FNKIT / "Trunks" / "Stylized_Trunk_01_basecolor.tga"
FNKIT_NORMAL = FNKIT / "Trunks" / "Stylized_Trunk_01_normal.tga"
FNKIT_ROUGH = FNKIT / "Trunks" / "Stylized_Trunk_01_roughness.tga"

SOIL_ALBEDO = BOTANIQ_TEX / "bq_Soil_Loose_Diffuse.jpg"
SOIL_NORMAL = BOTANIQ_TEX / "bq_Soil_Loose_Normal.jpg"
SOIL_ROUGH_ALBEDO = BOTANIQ_TEX / "bq_Soil_Rough_Diffuse.jpg"
LITTER_ALBEDO = BOTANIQ_TEX / "bq_Ground_Fallen_Leaves_Autumn_Diffuse.jpg"
LITTER_NORMAL = BOTANIQ_TEX / "bq_Ground_Fallen_Leaves_Autumn_Normal.jpg"
NEEDLES_ALBEDO = BOTANIQ_TEX / "bq_Ground_Fallen_Needles_Diffuse.jpg"
MOSS_ALBEDO = BOTANIQ_TEX / "bq_Moss_Diffuse.jpg"
MOSS_CARD = BOTANIQ_TEX / "bq_Moss_Rhytidiadelphus-loreus_Diffuse.png"
ROCK_ALBEDO = BOTANIQ_TEX / "bq_Rock_Granite-brown_Diffuse.jpg"
ROCK_NORMAL = BOTANIQ_TEX / "bq_Rock_Granite-brown_Normal.jpg"

LEAF_ALBEDO = BOTANIQ_TEX / "bq_Leaf_Corylus-avellana_Diffuse_rgba.png"
LEAF_ALBEDO_SRC = BOTANIQ_TEX / "bq_Leaf_Corylus-avellana_Diffuse.png"
LEAF_NORMAL = BOTANIQ_TEX / "bq_Leaf_Corylus-avellana_Normal.jpg"
FLOWER_ALBEDO = BOTANIQ_TEX / "bq_Flowers_Diffuse.png"
FLOWER_NORMAL = BOTANIQ_TEX / "bq_Flowers_Normal.jpg"
FERN_ALBEDO = BOTANIQ_TEX / "bq_Fern_Diffuse_rgba.png"
FERN_NORMAL = BOTANIQ_TEX / "bq_Fern_Normal.jpg"
STEM_ALBEDO = BOTANIQ_TEX / "bq_Stem_Diffuse.jpg"
STEM_NORMAL = BOTANIQ_TEX / "bq_Stem_Normal.jpg"
CORYLUS_BARK_ALBEDO = BOTANIQ_TEX / "bq_Bark_Corylus-avellana_Diffuse.jpg"
CORYLUS_BARK_NORMAL = BOTANIQ_TEX / "bq_Bark_Corylus-avellana_Normal.jpg"

SHRUB_BLEND = BOTANIQ_MODELS / "shrubs" / "bq_Shrub_Corylus-avellana_A_spring-summer.blend"
GRASS_BLEND = BOTANIQ_MODELS / "grass" / "bq_Grass_Carex-oshimensis_A_spring.blend"
FERN_BLEND = BOTANIQ_MODELS / "plants" / "bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn.blend"

BARK_NORMAL_STRENGTH = 0.62
TILIA_ASPECT = 4.0
TILIA_WORLD_WIDTH = 0.85
TILIA_WORLD_HEIGHT = 3.4
BACKGROUND_Y = 18.0


def _tag(id_data, isolation: bool = True) -> None:
    id_data["tj_generated"] = True
    id_data["tj_recovery"] = FEATURE
    id_data["tj_feature"] = LOOKDEV_FEATURE if isolation else FEATURE


def ensure_cutout_png(source: Path, dest: Path) -> Path:
    """Write an RGBA cutout so foliage cards do not render rectangular ghosts.

    Botaniq leaf/fern maps are often RGBA with a fully opaque black studio
    backdrop. Keep existing alpha only when it already punches a hole.
    """
    if not source.is_file():
        return dest
    try:
        from PIL import Image
    except Exception:
        return source if source.is_file() else dest
    image = Image.open(source)
    rgba = image.convert("RGBA")
    pixels = list(rgba.getdata())
    existing_alpha = sum(1 for _r, _g, _b, a in pixels if a < 16)
    if existing_alpha > max(64, len(pixels) * 0.04) and dest.is_file():
        return dest
    if existing_alpha > max(64, len(pixels) * 0.04):
        dest.parent.mkdir(parents=True, exist_ok=True)
        rgba.save(dest)
        return dest
    keyed = []
    for r, g, b, _a in pixels:
        luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
        chroma = max(r, g, b) - min(r, g, b)
        # Drop near-white paper and the Botaniq black studio backdrop.
        if luma > 232 and chroma < 18:
            keyed.append((r, g, b, 0))
        elif luma < 18 and chroma < 14:
            keyed.append((r, g, b, 0))
        else:
            keyed.append((r, g, b, 255))
    rgba.putdata(keyed)
    dest.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dest)
    return dest


def leaf_albedo_path() -> Path:
    if LEAF_ALBEDO.is_file():
        return LEAF_ALBEDO
    if LEAF_ALBEDO_SRC.is_file():
        return ensure_cutout_png(LEAF_ALBEDO_SRC, LEAF_ALBEDO)
    return LEAF_ALBEDO_SRC


def fern_albedo_path() -> Path:
    if FERN_ALBEDO.is_file():
        return FERN_ALBEDO
    src = BOTANIQ_TEX / "bq_Fern_Diffuse.png"
    if src.is_file():
        return ensure_cutout_png(src, FERN_ALBEDO)
    return src


def required_owned_paths() -> dict[str, Path]:
    return {
        "tiliaAlbedo": TILIA_ALBEDO,
        "tiliaNormal": TILIA_NORMAL,
        "soilAlbedo": SOIL_ALBEDO,
        "litterAlbedo": LITTER_ALBEDO,
        "leafAlbedo": leaf_albedo_path(),
        "leafNormal": LEAF_NORMAL,
        "fernAlbedo": fern_albedo_path(),
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
    image.filepath = str(path)
    try:
        image.reload()
    except Exception:
        pass
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
        shader.inputs["Specular IOR Level"].default_value = 0.22
    elif "Specular" in shader.inputs:
        shader.inputs["Specular"].default_value = 0.22
    return shader, output


def _mix_color(nodes, name: str):
    try:
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
    except Exception:
        node = nodes.new("ShaderNodeMixRGB")
    node.name = name
    return node


def _mix_sockets(node):
    names = [socket.name for socket in node.inputs]
    if "A" in names and "B" in names:
        return node.inputs["Factor"] if "Factor" in names else node.inputs[0], node.inputs["A"], node.inputs["B"]
    return node.inputs[0], node.inputs[1], node.inputs[2]


def _mix_out(node):
    return node.outputs["Result"] if "Result" in node.outputs else node.outputs[0]


def make_bark_material(kind: str = "tilia"):
    material = _new_material("TJ_ProdBark_Tilia_V1" if kind == "tilia" else "TJ_ProdBark_FNKit_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    if kind == "tilia":
        albedo = _load_image(TILIA_ALBEDO, "sRGB")
        normal = _load_image(TILIA_NORMAL, "Non-Color")
        roughness_value = 0.78
    else:
        albedo = _load_image(FNKIT_ALBEDO, "sRGB")
        normal = _load_image(FNKIT_NORMAL, "Non-Color")
        roughness_value = 0.76
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = albedo
    tex.interpolation = "Smart"
    ntex = nodes.new("ShaderNodeTexImage")
    ntex.image = normal
    ntex.interpolation = "Smart"
    ntex.image.colorspace_settings.name = "Non-Color"
    coord = nodes.new("ShaderNodeTexCoord")
    links.new(coord.outputs["UV"], tex.inputs["Vector"])
    links.new(coord.outputs["UV"], ntex.inputs["Vector"])
    links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = roughness_value
    if kind != "tilia" and FNKIT_ROUGH.is_file():
        rtex = nodes.new("ShaderNodeTexImage")
        rtex.image = _load_image(FNKIT_ROUGH, "Non-Color")
        rtex.image.colorspace_settings.name = "Non-Color"
        links.new(coord.outputs["UV"], rtex.inputs["Vector"])
        links.new(rtex.outputs["Color"], shader.inputs["Roughness"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = BARK_NORMAL_STRENGTH
    links.new(ntex.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_foliage_material(name: str, albedo_path: Path, normal_path: Path | None, translucent: float = 0.20, clip: bool = False):
    material = _new_material(name)
    material.blend_method = "CLIP" if clip else "HASHED"
    if hasattr(material, "shadow_method"):
        material.shadow_method = "CLIP" if clip else "HASHED"
    if hasattr(material, "alpha_threshold"):
        material.alpha_threshold = 0.12
    material.use_backface_culling = False
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, output = _principled(nodes, links)
    albedo = nodes.new("ShaderNodeTexImage")
    albedo.image = _load_image(albedo_path, "sRGB")
    albedo.interpolation = "Smart"
    links.new(albedo.outputs["Color"], shader.inputs["Base Color"])
    if "Alpha" in shader.inputs:
        links.new(albedo.outputs["Alpha"], shader.inputs["Alpha"])
    shader.inputs["Roughness"].default_value = 0.52
    if normal_path is not None and normal_path.is_file():
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = _load_image(normal_path, "Non-Color")
        ntex.image.colorspace_settings.name = "Non-Color"
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.48
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        geom = nodes.new("ShaderNodeNewGeometry")
        flip = nodes.new("ShaderNodeVectorMath")
        flip.operation = "MULTIPLY"
        flip.inputs[1].default_value = (-1.0, -1.0, -1.0)
        links.new(nmap.outputs["Normal"], flip.inputs[0])
        mixn = nodes.new("ShaderNodeMix")
        try:
            mixn.data_type = "VECTOR"
        except Exception:
            pass
        fac = mixn.inputs["Factor"] if "Factor" in mixn.inputs else mixn.inputs[0]
        links.new(geom.outputs["Backfacing"], fac)
        a_sock = mixn.inputs["A"] if "A" in mixn.inputs else mixn.inputs[1]
        b_sock = mixn.inputs["B"] if "B" in mixn.inputs else mixn.inputs[2]
        links.new(nmap.outputs["Normal"], a_sock)
        links.new(flip.outputs["Vector"], b_sock)
        nout = mixn.outputs["Result"] if "Result" in mixn.outputs else mixn.outputs[0]
        links.new(nout, shader.inputs["Normal"])
    if translucent > 0:
        trans = nodes.new("ShaderNodeBsdfTranslucent")
        links.new(albedo.outputs["Color"], trans.inputs["Color"])
        mix = nodes.new("ShaderNodeMixShader")
        mix.inputs["Fac"].default_value = float(translucent)
        for link in list(links):
            if link.to_node == output:
                links.remove(link)
        links.new(shader.outputs["BSDF"], mix.inputs[1])
        links.new(trans.outputs["BSDF"], mix.inputs[2])
        links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return material


def make_opaque_pbr(name: str, albedo_path: Path, normal_path: Path | None, roughness: float = 0.8, mapping: str = "uv"):
    material = _new_material(name)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = _load_image(albedo_path, "sRGB")
    shader.inputs["Roughness"].default_value = roughness
    vector = None
    if mapping == "object":
        coord = nodes.new("ShaderNodeTexCoord")
        scale = nodes.new("ShaderNodeMapping")
        scale.inputs["Scale"].default_value = (1.8, 1.8, 1.8)
        links.new(coord.outputs["Object"], scale.inputs["Vector"])
        vector = scale.outputs["Vector"]
        links.new(vector, tex.inputs["Vector"])
    links.new(tex.outputs["Color"], shader.inputs["Base Color"])
    if normal_path is not None and normal_path.is_file():
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = _load_image(normal_path, "Non-Color")
        ntex.image.colorspace_settings.name = "Non-Color"
        if vector is not None:
            links.new(vector, ntex.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.55
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_ground_material():
    material = _new_material("TJ_ProdGround_SoilLitterMoss_V1")
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader, _output = _principled(nodes, links)
    geom = nodes.new("ShaderNodeNewGeometry")
    # World metres, not object-local: the production ground is a scaled unit
    # plane, so Object coords collapse the whole forest to one terracotta sample.
    soil_map = nodes.new("ShaderNodeMapping")
    soil_map.inputs["Scale"].default_value = (0.42, 0.42, 0.42)
    litter_map = nodes.new("ShaderNodeMapping")
    litter_map.inputs["Scale"].default_value = (0.34, 0.34, 0.34)
    litter_map.inputs["Rotation"].default_value = (0.0, 0.0, 0.35)
    moss_map = nodes.new("ShaderNodeMapping")
    moss_map.inputs["Scale"].default_value = (0.58, 0.58, 0.58)
    for mapping in (soil_map, litter_map, moss_map):
        links.new(geom.outputs["Position"], mapping.inputs["Vector"])
    soil = nodes.new("ShaderNodeTexImage")
    soil.image = _load_image(SOIL_ALBEDO if SOIL_ALBEDO.is_file() else SOIL_ROUGH_ALBEDO, "sRGB")
    soil_n = nodes.new("ShaderNodeTexImage")
    soil_n.image = _load_image(SOIL_NORMAL, "Non-Color")
    soil_n.image.colorspace_settings.name = "Non-Color"
    litter = nodes.new("ShaderNodeTexImage")
    litter.image = _load_image(LITTER_ALBEDO, "sRGB")
    litter_n = nodes.new("ShaderNodeTexImage")
    litter_n.image = _load_image(LITTER_NORMAL, "Non-Color")
    litter_n.image.colorspace_settings.name = "Non-Color"
    needles = nodes.new("ShaderNodeTexImage")
    needles.image = _load_image(NEEDLES_ALBEDO, "sRGB")
    moss = nodes.new("ShaderNodeTexImage")
    moss.image = _load_image(MOSS_ALBEDO, "sRGB")
    for node, mapping in (
        (soil, soil_map),
        (soil_n, soil_map),
        (litter, litter_map),
        (litter_n, litter_map),
        (needles, litter_map),
        (moss, moss_map),
    ):
        links.new(mapping.outputs["Vector"], node.inputs["Vector"])
    hsv = nodes.new("ShaderNodeHueSaturation")
    hsv.inputs["Hue"].default_value = 0.48
    hsv.inputs["Saturation"].default_value = 0.78
    hsv.inputs["Value"].default_value = 0.42
    links.new(soil.outputs["Color"], hsv.inputs["Color"])
    soil_grade = _mix_color(nodes, "TJ_SoilGrade")
    fac, a, b = _mix_sockets(soil_grade)
    fac.default_value = 0.38
    links.new(hsv.outputs["Color"], a)
    b.default_value = (0.16, 0.10, 0.06, 1.0)
    base_litter = _mix_color(nodes, "TJ_SoilBaseLitter")
    fac, a, b = _mix_sockets(base_litter)
    fac.default_value = 0.74
    links.new(_mix_out(soil_grade), a)
    links.new(litter.outputs["Color"], b)
    litter_noise = nodes.new("ShaderNodeTexNoise")
    litter_noise.inputs["Scale"].default_value = 1.05
    litter_noise.inputs["Detail"].default_value = 8.0
    moss_noise = nodes.new("ShaderNodeTexNoise")
    moss_noise.inputs["Scale"].default_value = 1.35
    moss_noise.inputs["Detail"].default_value = 6.0
    links.new(geom.outputs["Position"], litter_noise.inputs["Vector"])
    links.new(geom.outputs["Position"], moss_noise.inputs["Vector"])
    litter_ramp = nodes.new("ShaderNodeValToRGB")
    litter_ramp.color_ramp.elements[0].position = 0.28
    litter_ramp.color_ramp.elements[1].position = 0.58
    moss_ramp = nodes.new("ShaderNodeValToRGB")
    moss_ramp.color_ramp.elements[0].position = 0.40
    moss_ramp.color_ramp.elements[1].position = 0.68
    links.new(litter_noise.outputs["Fac"], litter_ramp.inputs["Fac"])
    links.new(moss_noise.outputs["Fac"], moss_ramp.inputs["Fac"])
    mix_needles = _mix_color(nodes, "TJ_Needles")
    fac, a, b = _mix_sockets(mix_needles)
    fac.default_value = 0.22
    links.new(litter.outputs["Color"], a)
    links.new(needles.outputs["Color"], b)
    mix_litter = _mix_color(nodes, "TJ_SoilLitter")
    fac, a, b = _mix_sockets(mix_litter)
    links.new(_mix_out(base_litter), a)
    links.new(_mix_out(mix_needles), b)
    links.new(litter_ramp.outputs["Color"], fac)
    mix_moss = _mix_color(nodes, "TJ_LitterMoss")
    fac, a, b = _mix_sockets(mix_moss)
    links.new(_mix_out(mix_litter), a)
    links.new(moss.outputs["Color"], b)
    links.new(moss_ramp.outputs["Color"], fac)
    links.new(_mix_out(mix_moss), shader.inputs["Base Color"])
    shader.inputs["Roughness"].default_value = 0.90
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.42
    mix_n = _mix_color(nodes, "TJ_GroundNormalMix")
    fac, a, b = _mix_sockets(mix_n)
    links.new(soil_n.outputs["Color"], a)
    links.new(litter_n.outputs["Color"], b)
    links.new(litter_ramp.outputs["Color"], fac)
    links.new(_mix_out(mix_n), nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], shader.inputs["Normal"])
    return material


def trunk_slot_indices(obj) -> list[int]:
    indexes = []
    for index, slot in enumerate(obj.material_slots):
        name = (slot.material.name if slot.material else "").lower()
        if any(token in name for token in ("trunk", "bark", "wood")):
            indexes.append(index)
    return indexes


def cylindrical_unwrap_trunk_faces(obj, aspect: float = TILIA_ASPECT) -> dict:
    mesh = obj.data
    if mesh.uv_layers.active is None:
        mesh.uv_layers.new(name="TJ_BarkCyl")
    uv = mesh.uv_layers.active
    slots = set(trunk_slot_indices(obj))
    if not slots:
        slots = {0}
    zs = []
    radii = []
    for poly in mesh.polygons:
        if poly.material_index not in slots:
            continue
        for vert_index in poly.vertices:
            co = mesh.vertices[vert_index].co
            zs.append(co.z)
            radii.append(math.hypot(co.x, co.y))
    if not zs:
        return {"faces": 0}
    z0, z1 = min(zs), max(zs)
    radii.sort()
    radius = radii[len(radii) // 2] or 0.25
    circumference = 2.0 * math.pi * radius
    faces = 0
    for poly in mesh.polygons:
        if poly.material_index not in slots:
            continue
        faces += 1
        for loop_index in poly.loop_indices:
            co = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            # Seam on +Y (away from approved camera at -Y).
            angle = (math.atan2(co.x, -co.y) / (2.0 * math.pi)) + 0.5
            # 1024x4096 Tilia strip is ~0.85 m by 3.4 m. U tiles by circumference
            # so the photographic bark width is not stretched around a fat trunk.
            u = angle * (circumference / TILIA_WORLD_WIDTH)
            v = (co.z - z0) / TILIA_WORLD_HEIGHT
            uv.data[loop_index].uv = (u, v)
    return {
        "faces": faces,
        "radius": round(radius, 4),
        "height": round(z1 - z0, 4),
        "circumference": round(circumference, 4),
        "aspect": aspect,
        "seam": "+Y",
        "worldWidth": TILIA_WORLD_WIDTH,
        "worldHeight": TILIA_WORLD_HEIGHT,
    }


def assign_slot_material(obj, material, slot_indexes: list[int] | None = None) -> None:
    if not obj.material_slots:
        obj.data.materials.append(material)
        return
    indexes = slot_indexes if slot_indexes is not None else list(range(len(obj.material_slots)))
    for index in indexes:
        if index < 0 or index >= len(obj.material_slots):
            continue
        obj.material_slots[index].link = "OBJECT"
        obj.material_slots[index].material = material


def _append_object(blend_path: Path, object_name: str):
    import bpy

    if not blend_path.is_file():
        raise RuntimeError("OWNED_BLEND_MISSING:" + blend_path.name)
    existing = bpy.data.objects.get(object_name)
    if existing is not None and existing.get("tj_recovery") == FEATURE:
        return existing
    before = set(bpy.data.objects.keys())
    bpy.ops.wm.append(
        filepath=str(blend_path / "Object" / object_name),
        directory=str(blend_path / "Object") + "/",
        filename=object_name,
    )
    added = [name for name in bpy.data.objects.keys() if name not in before]
    obj = bpy.data.objects[added[0]] if added else bpy.data.objects.get(object_name)
    if obj is None:
        raise RuntimeError("OWNED_APPEND_FAILED:" + object_name)
    _tag(obj)
    return obj


def rebuild_appended_materials(obj, leaf_mat, bark_mat=None, stem_mat=None) -> int:
    changed = 0
    for slot in obj.material_slots:
        material = slot.material
        if material is None:
            continue
        name = material.name.lower()
        if any(token in name for token in ("leaf", "fern", "flower")):
            slot.link = "OBJECT"
            slot.material = leaf_mat
            changed += 1
        elif any(token in name for token in ("bark", "wood", "trunk")) and bark_mat is not None:
            slot.link = "OBJECT"
            slot.material = bark_mat
            changed += 1
        elif any(token in name for token in ("stem", "grass", "carex")) and stem_mat is not None:
            slot.link = "OBJECT"
            slot.material = stem_mat
            changed += 1
    return changed


def write_card_uvs(obj) -> None:
    mesh = obj.data
    if mesh.uv_layers.active is None:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active
    corners = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
    for poly in mesh.polygons:
        for offset, loop_index in enumerate(poly.loop_indices):
            uv.data[loop_index].uv = corners[offset % 4]


def make_decal(collection, name, location, rotation_z, scale, material):
    import bpy
    from mathutils import Euler, Vector

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(
        [(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0), (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)],
        [],
        [(0, 1, 2, 3)],
    )
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector(location)
    obj.rotation_euler = Euler((0.0, 0.0, rotation_z))
    obj.scale = scale
    mesh.materials.append(material)
    write_card_uvs(obj)
    _tag(mesh)
    _tag(obj)
    return obj


def make_card(collection, name, location, rotation, scale, material):
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
    write_card_uvs(obj)
    _tag(mesh)
    _tag(obj)
    return obj


def make_rock(collection, name, location, scale, material):
    import bpy
    from mathutils import Vector

    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(
        [
            (-0.18, -0.14, 0.0),
            (0.16, -0.12, 0.0),
            (0.14, 0.16, 0.0),
            (-0.15, 0.13, 0.0),
            (-0.05, -0.02, 0.11),
        ],
        [],
        [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)],
    )
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector(location)
    obj.scale = scale
    mesh.materials.append(material)
    _tag(mesh)
    _tag(obj)
    return obj


def _hide(obj) -> None:
    if obj is None:
        return
    obj.hide_render = True
    obj.hide_viewport = True
    obj["tj_feature"] = "forest_botaniq_hidden"
    try:
        obj.hide_set(True)
    except Exception:
        pass


def _exile(obj) -> None:
    _hide(obj)
    if obj is None:
        return
    obj.location = (90.0, -80.0, -40.0)
    for col in list(obj.users_collection):
        col.objects.unlink(obj)


def _place(obj, collection, location, name, scale=None, rotation_z=0.0):
    from mathutils import Vector

    if obj.name not in collection.objects:
        for col in list(obj.users_collection):
            col.objects.unlink(obj)
        collection.objects.link(obj)
    obj.name = name
    obj.location = Vector(location)
    if scale is not None:
        obj.scale = tuple(scale)
    obj.rotation_euler.z = rotation_z
    obj.hide_render = False
    obj.hide_viewport = False
    isolation = obj.name.startswith("TJ_Lookdev") or obj.name.startswith("TJ_ProdLookdev")
    _tag(obj, isolation=isolation)
    return obj


def _instance_like(source, collection, location, name, scale, rotation_z):
    obj = source.copy()
    obj.data = source.data
    collection.objects.link(obj)
    _place(obj, collection, location, name, scale=scale, rotation_z=rotation_z)
    return obj


def apply_bark_to_object(obj, bark_mat, aspect: float = TILIA_ASPECT) -> dict:
    report = cylindrical_unwrap_trunk_faces(obj, aspect=aspect)
    assign_slot_material(obj, bark_mat, trunk_slot_indices(obj) or [0])
    report["object"] = obj.name
    return report


def apply_production_trees(root, bark_mat) -> dict:
    seen = set()
    reports = []
    count = 0
    for obj in list(root.objects):
        if obj.type != "MESH":
            continue
        if not obj.name.startswith("Tree_"):
            continue
        if "trunk" in obj.name.lower() and "Tree Trunk" in obj.name:
            continue
        key = obj.data.name
        if key not in seen:
            reports.append(apply_bark_to_object(obj, bark_mat))
            seen.add(key)
        else:
            assign_slot_material(obj, bark_mat, trunk_slot_indices(obj) or [0])
        count += 1
    return {"treeObjects": count, "uniqueMeshes": len(seen), "unwraps": reports}


def replace_ecokit_vegetation(root, shrub, grass, fern, leaf_mat, flower_mat, litter_mat=None) -> dict:
    import random

    rng = random.Random(7301)
    replaced = {"bushes": 0, "grass": 0, "ferns": 0, "floral": 0, "fallenLeaves": 0}
    preserved = {"bushes": 0, "grass": 0, "ferns": 0, "floral": 0, "fallenLeaves": 0}

    def classify(name: str):
        low = name.lower()
        if low.startswith("tj_"):
            return None
        if "bush" in low:
            return "bushes"
        if "fern" in low:
            return "ferns"
        if "grass" in low:
            return "grass"
        if "floral" in low or "flower" in low:
            return "floral"
        if "fallen" in low:
            return "fallenLeaves"
        return None

    for obj in list(root.objects):
        if obj.type != "MESH":
            continue
        kind = classify(obj.name)
        if kind is None:
            continue
        if obj.location.y >= BACKGROUND_Y:
            preserved[kind] += 1
            continue
        source = {"bushes": shrub, "grass": grass, "ferns": fern}.get(kind)
        _hide(obj)
        if source is None:
            if kind == "floral":
                make_card(
                    root,
                    f"TJ_ProdFlower_{replaced['floral']:02d}",
                    (obj.location.x, obj.location.y, 0.02),
                    (0.08, 0.0, rng.uniform(-3.1, 3.1)),
                    (0.22, 0.22, 0.28),
                    flower_mat,
                )
                replaced["floral"] += 1
            elif kind == "fallenLeaves":
                make_decal(
                    root,
                    f"TJ_ProdLitter_{replaced['fallenLeaves']:02d}",
                    (obj.location.x, obj.location.y, 0.012),
                    rng.uniform(-3.1, 3.1),
                    (rng.uniform(0.22, 0.38), rng.uniform(0.22, 0.38), 1.0),
                    litter_mat or leaf_mat,
                )
                replaced["fallenLeaves"] += 1
            continue
        height = max(float(obj.dimensions.z), 0.2)
        src_h = max(float(source.dimensions.z), 0.2)
        factor = height / src_h
        factor = max(0.45, min(factor, 2.4))
        _instance_like(
            source,
            root,
            (obj.location.x, obj.location.y, 0.0),
            f"TJ_Prod{kind.title()}_{replaced[kind]:02d}",
            scale=tuple(float(v) * factor for v in source.scale),
            rotation_z=obj.rotation_euler.z + rng.uniform(-0.4, 0.4),
        )
        replaced[kind] += 1
    return {"replaced": replaced, "backgroundPreserved": preserved}


def make_moss_mound(collection, name, location, scale, material):
    import bpy
    from mathutils import Vector

    segments = 10
    verts = [(0.0, 0.0, 0.55)]
    faces = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        verts.append((math.cos(angle), math.sin(angle), 0.0))
    for index in range(segments):
        faces.append((0, 1 + index, 1 + ((index + 1) % segments)))
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector(location)
    obj.scale = scale
    mesh.materials.append(material)
    _tag(mesh)
    _tag(obj)
    return obj


def scatter_floor_geometry(collection, origin, litter_mat, moss_mat, rock_mat, count_leaf=10, count_moss=6, count_rock=5) -> dict:
    import random

    rng = random.Random(7301)
    ox, oy, oz = origin
    lookdev = collection.name == COLLECTION_NAME
    for index in range(count_leaf):
        make_decal(
            collection,
            f"TJ_LookdevLitterPatch_{index:02d}" if lookdev else f"TJ_ProdLitterPatch_{index:02d}",
            (ox + rng.uniform(-0.55, 0.55), oy + rng.uniform(-0.55, 0.55), oz + 0.018),
            rng.uniform(-3.1, 3.1),
            (rng.uniform(0.16, 0.24), rng.uniform(0.16, 0.24), 1.0),
            litter_mat,
        )
    for index in range(count_moss):
        make_moss_mound(
            collection,
            f"TJ_LookdevMossMound_{index:02d}" if lookdev else f"TJ_ProdMossMound_{index:02d}",
            (ox + rng.uniform(-0.8, 0.8), oy + rng.uniform(-0.8, 0.8), oz),
            (rng.uniform(0.12, 0.20), rng.uniform(0.12, 0.20), rng.uniform(0.10, 0.16)),
            moss_mat,
        )
    for index in range(count_rock):
        make_rock(
            collection,
            f"TJ_LookdevStone_{index:02d}" if lookdev else f"TJ_ProdStone_{index:02d}",
            (ox + rng.uniform(-0.75, 0.75), oy + rng.uniform(-0.75, 0.75), oz),
            (rng.uniform(0.55, 1.05), rng.uniform(0.5, 0.95), rng.uniform(0.45, 0.85)),
            rock_mat,
        )
    return {"litterPatches": count_leaf, "mossMounds": count_moss, "rocks": count_rock}


def make_production_trunk_cylinder(collection, location, bark_mat):
    import bpy
    from mathutils import Vector

    segments = 24
    radius = 0.32
    height = 2.15
    verts = []
    faces = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        x = radius * math.cos(angle)
        y = radius * math.sin(angle)
        verts.append((x, y, 0.0))
        verts.append((x, y, height))
    for index in range(segments):
        i0 = 2 * index
        i1 = i0 + 1
        j0 = 2 * ((index + 1) % segments)
        j1 = j0 + 1
        faces.append((i0, j0, j1, i1))
    mesh = bpy.data.meshes.new("TJ_ProdLookdevBark_CylMesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("TJ_ProdLookdevBark", mesh)
    collection.objects.link(obj)
    obj.location = Vector(location)
    mesh.materials.append(bark_mat)
    apply_bark_to_object(obj, bark_mat)
    _tag(mesh)
    _tag(obj, isolation=True)
    return obj


def apply_lookdev_subjects(scene, mats, sources) -> dict:
    import bpy

    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        raise RuntimeError("LOOKDEV_COLLECTION_MISSING")
    ox, oy, oz = 90.0, 0.0, 0.0

    for obj in list(collection.objects):
        if obj.name.startswith("TJ_LookdevTrunk") or obj.name.startswith("TJ_HiddenEcoKit"):
            obj.name = "TJ_HiddenEcoKitLookdevTrunk" if obj.name.startswith("TJ_LookdevTrunk") else obj.name
            _exile(obj)
    trunk = make_production_trunk_cylinder(collection, (ox, oy, oz), mats["bark"])

    for hidden_name, new_name in (
        ("TJ_LookdevBush", "TJ_HiddenEcoKitBush"),
        ("TJ_LookdevLeaf", "TJ_HiddenEcoKitLeaf"),
        ("TJ_LookdevGrass", "TJ_HiddenEcoKitGrass"),
        ("TJ_LookdevFlower", "TJ_HiddenEcoKitFlower"),
    ):
        obj = bpy.data.objects.get(hidden_name)
        if obj is not None:
            obj.name = new_name
            _exile(obj)
    for obj in list(collection.objects):
        if obj.name.startswith("TJ_LookdevFallen") or obj.name in {"TJ_LookdevMoss", "TJ_LookdevGroundGrass", "TJ_LookdevRock"}:
            _exile(obj)

    shrub = sources["shrub"].copy()
    shrub.data = sources["shrub"].data
    collection.objects.link(shrub)
    _place(shrub, collection, (ox + 8.0, oy, oz), "TJ_LookdevBush", scale=(1.25, 1.25, 1.25))
    rebuild_appended_materials(shrub, mats["leaf"], mats["shrubBark"])

    grass = sources["grass"].copy()
    grass.data = sources["grass"].data
    collection.objects.link(grass)
    _place(grass, collection, (ox + 20.0, oy - 0.2, oz), "TJ_LookdevGrass", scale=(1.6, 1.6, 1.7))
    rebuild_appended_materials(grass, mats["leaf"], stem_mat=mats["stem"])

    fern = sources["fern"].copy()
    fern.data = sources["fern"].data
    collection.objects.link(fern)
    _place(fern, collection, (ox + 20.4, oy + 0.35, oz), "TJ_LookdevFlower", scale=(1.15, 1.15, 1.15))
    rebuild_appended_materials(fern, mats["fern"], stem_mat=mats["stem"])

    leaf = make_card(collection, "TJ_LookdevLeaf", (ox + 14.0, oy, oz + 0.35), (0.12, 0.0, 0.0), (0.95, 0.95, 0.95), mats["leaf"])

    ground = bpy.data.objects.get("TJ_LookdevGroundPatch")
    if ground is not None:
        if ground.data.materials:
            ground.data.materials[0] = mats["ground"]
        else:
            ground.data.materials.append(mats["ground"])
        for slot in ground.material_slots:
            slot.link = "OBJECT"
            slot.material = mats["ground"]
        # Lookdev floor: layered soil/litter/moss shader only. Extra decals
        # z-fight and punch black holes through the 2 m patch.
        scatter_floor_geometry(collection, (ox + 26.0, oy, oz), mats["litter"], mats["moss"], mats["rock"], 0, 0, 0)

    bpy.context.view_layer.update()
    return {
        "trunk": None if trunk is None else trunk.name,
        "bush": shrub.name,
        "leaf": leaf.name,
        "grass": grass.name,
        "fern": fern.name,
        "ground": None if ground is None else ground.name,
    }


def apply_botaniq_production_recovery(scene, mode: str = "both", bark_kind: str = "tilia") -> dict:
    import bpy

    missing = missing_owned_paths()
    if missing:
        return {"applied": False, "blocked": True, "missing": missing}

    mats = {
        "bark": make_bark_material(bark_kind),
        "ground": make_ground_material(),
        "leaf": make_foliage_material("TJ_ProdLeaf_Corylus_V1", leaf_albedo_path(), LEAF_NORMAL, 0.22, clip=True),
        "litter": make_opaque_pbr("TJ_ProdLitterPatch_V1", LITTER_ALBEDO, LITTER_NORMAL, 0.86, mapping="uv"),
        "fern": make_foliage_material("TJ_ProdFern_V1", fern_albedo_path(), FERN_NORMAL, 0.18, clip=True),
        "moss": make_opaque_pbr("TJ_ProdMossMound_V1", MOSS_ALBEDO, None, 0.84, mapping="object"),
        "flower": make_foliage_material("TJ_ProdFlower_V1", FLOWER_ALBEDO, FLOWER_NORMAL, 0.12, clip=True),
        "rock": make_opaque_pbr("TJ_ProdRock_Granite_V1", ROCK_ALBEDO, ROCK_NORMAL, 0.76, mapping="object"),
        "shrubBark": make_opaque_pbr("TJ_ProdShrubBark_V1", CORYLUS_BARK_ALBEDO, CORYLUS_BARK_NORMAL, 0.8),
        "stem": make_opaque_pbr("TJ_ProdStem_V1", STEM_ALBEDO, STEM_NORMAL, 0.62),
    }

    shrub = _append_object(SHRUB_BLEND, "bq_Shrub_Corylus-avellana_A_spring-summer")
    grass = _append_object(GRASS_BLEND, "bq_Grass_Carex-oshimensis_A_spring")
    fern = _append_object(FERN_BLEND, "bq_Plant_Dryopteris-carthusiana_A_spring-summer-autumn")
    rebuild_appended_materials(shrub, mats["leaf"], mats["shrubBark"])
    rebuild_appended_materials(grass, mats["leaf"], stem_mat=mats["stem"])
    rebuild_appended_materials(fern, mats["fern"], stem_mat=mats["stem"])
    sources = {"shrub": shrub, "grass": grass, "fern": fern}

    production = {}
    lookdev = {}
    root = scene.collection.children.get("TJ_VENDOR_REFERENCE_ROOT")
    if mode in {"production", "both"} and root is not None:
        trees = apply_production_trees(root, mats["bark"])
        veg = replace_ecokit_vegetation(root, shrub, grass, fern, mats["leaf"], mats["flower"], mats["litter"])
        ground = bpy.data.objects.get("TJ_VendorGround")
        if ground is not None:
            if ground.data.materials:
                ground.data.materials[0] = mats["ground"]
            else:
                ground.data.materials.append(mats["ground"])
            for slot in ground.material_slots:
                slot.link = "OBJECT"
                slot.material = mats["ground"]
            scatter_floor_geometry(root, (0.0, 3.5, 0.0), mats["litter"], mats["moss"], mats["rock"], 22, 10, 6)
        production = {"trees": trees, "vegetation": veg, "ground": ground is not None}
    if mode in {"lookdev", "both"}:
        lookdev = apply_lookdev_subjects(scene, mats, sources)

    return {
        "schema": "TIVVLEJOY_BOTANIQ_FOREST_PRODUCTION_RECOVERY_APPLY_V1",
        "applied": True,
        "blocked": False,
        "feature": FEATURE,
        "barkKind": bark_kind,
        "shrubMaterialLocalized": True,
        "leafAlphaSource": "Corylus PNG alpha",
        "production": production,
        "lookdev": lookdev,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "lightingChanged": False,
        "compositionChanged": False,
        "purchasedAssetsPreserved": True,
    }
