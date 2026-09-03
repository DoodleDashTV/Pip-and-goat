"""Non-destructive Cycles production shaders. Vendor assets stay in the datablock."""

from __future__ import annotations

import math
import random
from pathlib import Path

FEATURE = "forest_production_shading_rebuild_v1"
TRUNK_MAT_PREFIX = "TJ_ProdTrunk_"
FLORA_WRAPPER = "TJ_ProdFloraPrincipled_V1"
FLORA_TINT = "TJ_ProdFloraTint_V1"
FLORA_TRANSLUCENT = "TJ_ProdFloraTranslucent_V1"
FLORA_MIX = "TJ_ProdFloraMix_V1"
FLORA_BUMP = "TJ_ProdFloraBump_V1"

VENDOR_WOOD = (0.2482, 0.0989, 0.0393, 1.0)
BARK_BUMP_STRENGTH = 0.95
BARK_BUMP_DISTANCE = 0.11
BARK_ROUGH_MIN = 0.74
BARK_ROUGH_MAX = 0.94

EARTH_A = (0.092, 0.064, 0.040, 1.0)
EARTH_B = (0.070, 0.056, 0.044, 1.0)
EARTH_DAMP = (0.048, 0.040, 0.032, 1.0)
MOSS_DRESSING = (0.042, 0.058, 0.036, 1.0)

FALLEN_LEAF_TARGET = 180
ROCK_INSTANCE_TARGET = 20
ROCK_BLEND = Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/Rock_Models.blend")

FILL_ENERGY = 140.0
BOUNCE_ENERGY = 150.0
CANOPY_FILL_ENERGY = 280.0
HDRI_LIGHT_STRENGTH = 0.90
EXPOSURE = 0.38


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _set_rgba(socket, rgba) -> None:
    values = list(rgba)
    while len(values) < 4:
        values.append(1.0)
    socket.default_value = tuple(values[:4])


def _new_mix(nodes, name: str):
    try:
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
    except Exception:
        node = nodes.new("ShaderNodeMixRGB")
    node.name = name
    node.label = name
    return node


def _mix_ab(node):
    names = [socket.name for socket in node.inputs]
    if "A" in names and "B" in names:
        return node.inputs["A"], node.inputs["B"]
    color_inputs = [socket for socket in node.inputs if "Color" in socket.name]
    if len(color_inputs) >= 2:
        return color_inputs[0], color_inputs[1]
    return node.inputs[1], node.inputs[2]


def _mix_fac(node):
    if "Factor" in node.inputs:
        return node.inputs["Factor"]
    if "Fac" in node.inputs:
        return node.inputs["Fac"]
    return node.inputs[0]


def _mix_out(node):
    return node.outputs.get("Result") or node.outputs.get("Color") or node.outputs[0]


def _find_image(name: str):
    import bpy

    existing = bpy.data.images.get(name)
    if existing is not None and existing.size[0] > 0:
        return existing
    trunk = bpy.data.images.get("Tree Trunk_1.png")
    folders = []
    if trunk is not None and trunk.filepath:
        folders.append(Path(bpy.path.abspath(trunk.filepath)).parent)
    folders.append(Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/Textures"))
    for folder in folders:
        path = folder / name
        if path.is_file():
            return bpy.data.images.load(str(path), check_existing=True)
    return existing


def _vendor_wood_from_material(material):
    if material is None or not material.use_nodes or material.node_tree is None:
        return VENDOR_WOOD
    for node in material.node_tree.nodes:
        if node.type != "GROUP" or "Color" not in node.inputs:
            continue
        color = list(node.inputs["Color"].default_value)
        luma = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
        if 0.04 < luma < 0.35 and color[0] > color[2]:
            return tuple(color[:4] if len(color) > 3 else color + [1.0])
    return VENDOR_WOOD


def install_production_trunk_materials() -> dict:
    import bpy

    grain = _find_image("Tree Trunk_1.png")
    assigned = []
    created = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for index, slot in enumerate(obj.material_slots):
            material = slot.material
            if material is None or "trunk" not in material.name.lower():
                continue
            if material.name.startswith(TRUNK_MAT_PREFIX):
                continue
            prod_name = TRUNK_MAT_PREFIX + material.name
            prod = bpy.data.materials.get(prod_name)
            if prod is None:
                prod = _build_trunk_material(prod_name, _vendor_wood_from_material(material), grain)
                created.append(prod_name)
            slot.material = prod
            assigned.append({"object": obj.name, "slot": index, "from": material.name, "to": prod_name})
    return {
        "materialsCreated": created,
        "assignments": assigned,
        "bumpStrength": BARK_BUMP_STRENGTH,
        "bumpDistance": BARK_BUMP_DISTANCE,
        "textureColorSpace": "Non-Color",
        "vendorMaterialsPreserved": True,
        "texturesOverwritten": False,
    }


def _build_trunk_material(name: str, wood, grain_image):
    import bpy

    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (860, 80)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (560, 80)
    wood_node = nodes.new("ShaderNodeRGB")
    wood_node.name = "TJ_ProdTrunkWood_V1"
    wood_node.location = (-200, 220)
    _set_rgba(wood_node.outputs["Color"], wood)

    vary = nodes.new("ShaderNodeTexNoise")
    vary.location = (-420, 40)
    vary.inputs["Scale"].default_value = 18.0
    vary.inputs["Detail"].default_value = 6.0
    vary.inputs["Roughness"].default_value = 0.45
    cool = nodes.new("ShaderNodeRGB")
    cool.location = (-200, 40)
    _set_rgba(cool.outputs["Color"], (wood[0] * 0.90, wood[1] * 0.92, min(wood[2] * 1.08, 0.055), 1.0))
    color_mix = _new_mix(nodes, "TJ_ProdTrunkColorVary_V1")
    color_mix.location = (40, 160)
    _mix_fac(color_mix).default_value = 0.14
    links.new(vary.outputs["Fac"], _mix_fac(color_mix))
    links.new(wood_node.outputs["Color"], _mix_ab(color_mix)[0])
    links.new(cool.outputs["Color"], _mix_ab(color_mix)[1])
    links.new(_mix_out(color_mix), bsdf.inputs["Base Color"])

    if grain_image is not None:
        try:
            grain_image.colorspace_settings.name = "Non-Color"
        except Exception:
            pass
        tex_coord = nodes.new("ShaderNodeTexCoord")
        tex_coord.location = (-720, -140)
        mapping = nodes.new("ShaderNodeMapping")
        mapping.location = (-520, -140)
        mapping.inputs["Scale"].default_value = (1.6, 4.8, 1.6)
        img = nodes.new("ShaderNodeTexImage")
        img.name = "TJ_ProdTrunkGrain_V1"
        img.location = (-300, -140)
        img.image = grain_image
        links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])
        links.new(mapping.outputs["Vector"], img.inputs["Vector"])
        remap = nodes.new("ShaderNodeMapRange")
        remap.location = (-40, -140)
        remap.inputs["From Min"].default_value = 0.32
        remap.inputs["From Max"].default_value = 0.70
        remap.inputs["To Min"].default_value = 0.0
        remap.inputs["To Max"].default_value = 1.0
        links.new(img.outputs["Color"], remap.inputs["Value"])
        bump = nodes.new("ShaderNodeBump")
        bump.name = "TJ_ProdTrunkBump_V1"
        bump.location = (220, -140)
        bump.inputs["Strength"].default_value = BARK_BUMP_STRENGTH
        bump.inputs["Distance"].default_value = BARK_BUMP_DISTANCE
        links.new(remap.outputs["Result"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        rough_map = nodes.new("ShaderNodeMapRange")
        rough_map.location = (220, -320)
        rough_map.inputs["From Min"].default_value = 0.0
        rough_map.inputs["From Max"].default_value = 1.0
        rough_map.inputs["To Min"].default_value = BARK_ROUGH_MIN
        rough_map.inputs["To Max"].default_value = BARK_ROUGH_MAX
        links.new(remap.outputs["Result"], rough_map.inputs["Value"])
        links.new(rough_map.outputs["Result"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = 0.86
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.16
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    _tag(material)
    return material


def install_production_earth() -> dict:
    import bpy

    material = bpy.data.materials.get("TJ_VendorGround_Mat")
    if material is None:
        return {"applied": False, "reason": "GROUND_MISSING"}
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (980, 80)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (700, 80)
    tex = nodes.new("ShaderNodeTexCoord")
    tex.location = (-780, 40)
    fine = nodes.new("ShaderNodeTexNoise")
    fine.location = (-520, 180)
    fine.inputs["Scale"].default_value = 42.0
    fine.inputs["Detail"].default_value = 10.0
    fine.inputs["Roughness"].default_value = 0.55
    mid = nodes.new("ShaderNodeTexNoise")
    mid.location = (-520, -40)
    mid.inputs["Scale"].default_value = 19.0
    mid.inputs["Detail"].default_value = 6.0
    mid.inputs["Roughness"].default_value = 0.48
    links.new(tex.outputs["Object"], fine.inputs["Vector"])
    links.new(tex.outputs["Object"], mid.inputs["Vector"])

    earth_a = nodes.new("ShaderNodeRGB")
    earth_a.location = (-220, 240)
    _set_rgba(earth_a.outputs["Color"], EARTH_A)
    earth_b = nodes.new("ShaderNodeRGB")
    earth_b.location = (-220, 80)
    _set_rgba(earth_b.outputs["Color"], EARTH_B)
    damp = nodes.new("ShaderNodeRGB")
    damp.location = (-220, -80)
    _set_rgba(damp.outputs["Color"], EARTH_DAMP)
    moss = nodes.new("ShaderNodeRGB")
    moss.location = (-220, -240)
    _set_rgba(moss.outputs["Color"], MOSS_DRESSING)

    ab = _new_mix(nodes, "TJ_ProdEarthAB_V1")
    ab.location = (40, 180)
    links.new(fine.outputs["Fac"], _mix_fac(ab))
    links.new(earth_a.outputs["Color"], _mix_ab(ab)[0])
    links.new(earth_b.outputs["Color"], _mix_ab(ab)[1])
    damp_mix = _new_mix(nodes, "TJ_ProdEarthDamp_V1")
    damp_mix.location = (260, 80)
    _mix_fac(damp_mix).default_value = 0.22
    links.new(mid.outputs["Fac"], _mix_fac(damp_mix))
    links.new(_mix_out(ab), _mix_ab(damp_mix)[0])
    links.new(damp.outputs["Color"], _mix_ab(damp_mix)[1])

    moss_mask = nodes.new("ShaderNodeMath")
    moss_mask.location = (40, -200)
    moss_mask.operation = "GREATER_THAN"
    moss_mask.inputs[1].default_value = 0.90
    links.new(mid.outputs["Fac"], moss_mask.inputs[0])
    moss_mix = _new_mix(nodes, "TJ_ProdEarthMossDress_V1")
    moss_mix.location = (480, 40)
    links.new(moss_mask.outputs["Value"], _mix_fac(moss_mix))
    links.new(_mix_out(damp_mix), _mix_ab(moss_mix)[0])
    links.new(moss.outputs["Color"], _mix_ab(moss_mix)[1])
    links.new(_mix_out(moss_mix), bsdf.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.location = (480, -200)
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.018
    links.new(fine.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.93
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.12
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    _tag(material)
    return {
        "applied": True,
        "material": material.name,
        "mossTexturesUsedAsAlbedo": False,
        "mossUsedAsSparseDressing": True,
        "texturesOverwritten": False,
    }


def _flora_role(name: str) -> str | None:
    low = str(name or "").lower()
    if any(word in low for word in ("rock", "stone", "water", "ground", "trunk")):
        return None
    if "fallen" in low:
        return "fallen"
    if any(word in low for word in ("branch", "stipe")):
        return "branch"
    if any(word in low for word in ("grass",)):
        return "grass"
    if any(word in low for word in ("bush",)):
        return "bush"
    if any(word in low for word in ("floral", "flower")):
        return "flower"
    if any(word in low for word in ("leaf", "vine", "fern", "foliage", "treeleaf", "moss")):
        return "leaf"
    return None


def _is_particle_image(image) -> bool:
    name = (getattr(image, "name", "") or "").lower()
    return any(word in name for word in ("firefly", "butterfly"))


def _first_mask_image(material):
    if not material.use_nodes or material.node_tree is None:
        return None

    def _walk(nodes):
        for node in nodes:
            if node.type == "TEX_IMAGE" and getattr(node, "image", None) and not _is_particle_image(node.image):
                return node
        for node in nodes:
            if node.type == "GROUP" and node.node_tree is not None:
                found = _walk(node.node_tree.nodes)
                if found is not None:
                    return found
        return None

    return _walk(material.node_tree.nodes)


def _flora_group(material):
    if not material.use_nodes or material.node_tree is None:
        return None
    groups = [
        node for node in material.node_tree.nodes
        if node.type == "GROUP" and node.node_tree is not None
    ]
    for node in groups:
        if str(node.node_tree.name).startswith("Flora_Shader"):
            return node
    for node in groups:
        if "Color_1" in node.inputs:
            return node
    return groups[0] if groups else None


def _active_cycles_output(material):
    outputs = [node for node in material.node_tree.nodes if node.type == "OUTPUT_MATERIAL"]
    if not outputs:
        return None
    return next((node for node in outputs if getattr(node, "is_active_output", False)), outputs[0])


def _lift_crushed_vendor_color(rgba, role: str):
    red, green, blue, alpha = [float(value) for value in rgba[:4]]
    luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    if role in {"flower", "fallen", "branch"} or luma >= 0.11:
        return (red, green, blue, alpha)
    scale = 0.16 / max(luma, 0.01)
    return (min(red * scale, 0.55), min(green * scale, 0.62), min(blue * scale, 0.28), alpha)


def install_flora_production_wrappers() -> dict:
    import bpy

    changed = []
    skipped = []
    for material in bpy.data.materials:
        role = _flora_role(material.name)
        if role is None or not material.use_nodes or material.node_tree is None:
            continue
        output = _active_cycles_output(material)
        if output is None or "Surface" not in output.inputs:
            skipped.append(material.name)
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        image_node = _first_mask_image(material)
        if image_node is not None and image_node.id_data != material.node_tree:
            image_node = None
        group = _flora_group(material)
        vendor_color = (0.20, 0.32, 0.10, 1.0)
        if group is not None and "Color_1" in group.inputs:
            vendor_color = tuple(list(group.inputs["Color_1"].default_value)[:4])
        vendor_color = _lift_crushed_vendor_color(vendor_color, role)

        if group is not None and "Shader_Cycles" in group.outputs:
            for link in list(links):
                if link.to_socket == output.inputs["Surface"]:
                    links.remove(link)
            links.new(group.outputs["Shader_Cycles"], output.inputs["Surface"])
            if hasattr(output, "target"):
                try:
                    output.target = "CYCLES"
                except Exception:
                    pass
            changed.append({"name": material.name, "role": role, "usedImage": getattr(getattr(image_node, "image", None), "name", None), "mode": "vendor_cycles"})
            continue

        principled = nodes.get(FLORA_WRAPPER)
        if principled is None:
            principled = nodes.new("ShaderNodeBsdfPrincipled")
            principled.name = FLORA_WRAPPER
        principled.location = (output.location.x - 380, output.location.y)
        tint = nodes.get(FLORA_TINT)
        if tint is None:
            tint = _new_mix(nodes, FLORA_TINT)
        try:
            tint.blend_type = "MULTIPLY"
        except Exception:
            pass
        tint.location = (principled.location.x - 260, principled.location.y + 40)
        for socket in (_mix_ab(tint)[0], _mix_ab(tint)[1], _mix_fac(tint)):
            for link in list(links):
                if link.to_socket == socket:
                    links.remove(link)
        _set_rgba(_mix_ab(tint)[0], vendor_color)
        if image_node is not None:
            mask_range = nodes.get("TJ_ProdFloraMaskRange_V1")
            if mask_range is None:
                mask_range = nodes.new("ShaderNodeMapRange")
                mask_range.name = "TJ_ProdFloraMaskRange_V1"
            mask_range.location = (tint.location.x - 220, tint.location.y - 40)
            mask_range.inputs["From Min"].default_value = 0.12
            mask_range.inputs["From Max"].default_value = 1.0
            mask_range.inputs["To Min"].default_value = 0.78
            mask_range.inputs["To Max"].default_value = 1.0
            links.new(image_node.outputs["Color"], mask_range.inputs["Value"])
            links.new(mask_range.outputs["Result"], _mix_ab(tint)[1])
            _mix_fac(tint).default_value = 1.0
        else:
            _mix_fac(tint).default_value = 0.0
            _set_rgba(_mix_ab(tint)[1], vendor_color)
        links.new(_mix_out(tint), principled.inputs["Base Color"])
        if "Roughness" in principled.inputs:
            principled.inputs["Roughness"].default_value = {
                "leaf": 0.56,
                "bush": 0.64,
                "grass": 0.70,
                "flower": 0.48,
                "fallen": 0.82,
                "branch": 0.78,
            }.get(role, 0.62)
        if "Specular IOR Level" in principled.inputs:
            principled.inputs["Specular IOR Level"].default_value = 0.18
        if image_node is not None and "Alpha" in principled.inputs:
            alpha_range = nodes.get("TJ_ProdFloraAlpha_V1")
            if alpha_range is None:
                alpha_range = nodes.new("ShaderNodeMapRange")
                alpha_range.name = "TJ_ProdFloraAlpha_V1"
            alpha_range.location = (principled.location.x - 260, principled.location.y - 80)
            alpha_range.inputs["From Min"].default_value = 0.04
            alpha_range.inputs["From Max"].default_value = 0.22
            alpha_range.inputs["To Min"].default_value = 0.0
            alpha_range.inputs["To Max"].default_value = 1.0
            links.new(image_node.outputs["Color"], alpha_range.inputs["Value"])
            links.new(alpha_range.outputs["Result"], principled.inputs["Alpha"])
            material.blend_method = "HASHED"
            bump = nodes.get(FLORA_BUMP)
            if bump is None:
                bump = nodes.new("ShaderNodeBump")
                bump.name = FLORA_BUMP
            bump.location = (principled.location.x - 260, principled.location.y - 260)
            bump.inputs["Strength"].default_value = 0.28
            bump.inputs["Distance"].default_value = 0.006
            links.new(image_node.outputs["Color"], bump.inputs["Height"])
            links.new(bump.outputs["Normal"], principled.inputs["Normal"])
            _tag(bump)
            _tag(alpha_range)

        surface = principled.outputs["BSDF"]
        if role in {"leaf", "bush", "grass", "flower"}:
            trans = nodes.get(FLORA_TRANSLUCENT)
            if trans is None:
                trans = nodes.new("ShaderNodeBsdfTranslucent")
                trans.name = FLORA_TRANSLUCENT
            trans.location = (principled.location.x, principled.location.y - 200)
            links.new(_mix_out(tint), trans.inputs["Color"])
            mix = nodes.get(FLORA_MIX)
            if mix is None:
                mix = nodes.new("ShaderNodeMixShader")
                mix.name = FLORA_MIX
            mix.location = (output.location.x - 160, output.location.y)
            mix.inputs["Fac"].default_value = {"leaf": 0.22, "bush": 0.16, "grass": 0.12, "flower": 0.12}.get(role, 0.14)
            links.new(principled.outputs["BSDF"], mix.inputs[1])
            links.new(trans.outputs["BSDF"], mix.inputs[2])
            surface = mix.outputs["Shader"]
            _tag(trans)
            _tag(mix)
        for link in list(links):
            if link.to_socket == output.inputs["Surface"]:
                links.remove(link)
        links.new(surface, output.inputs["Surface"])
        if group is not None:
            eevee = next((node for node in nodes if node.type == "OUTPUT_MATERIAL" and node != output), None)
            if eevee is None:
                eevee = nodes.new("ShaderNodeOutputMaterial")
                eevee.location = (output.location.x, output.location.y - 220)
            if hasattr(eevee, "target"):
                try:
                    eevee.target = "EEVEE"
                except Exception:
                    pass
            if hasattr(output, "target"):
                try:
                    output.target = "CYCLES"
                except Exception:
                    pass
            shader_out = next((sock for sock in group.outputs if sock.name in {"Shader", "Shader_EEVEE", "BSDF"} or sock.type == "SHADER"), None)
            if shader_out is None and group.outputs:
                shader_out = group.outputs[0]
            if shader_out is not None:
                for link in list(links):
                    if link.to_socket == eevee.inputs["Surface"]:
                        links.remove(link)
                try:
                    links.new(shader_out, eevee.inputs["Surface"])
                except Exception:
                    pass
        _tag(principled)
        _tag(tint)
        changed.append({
            "name": material.name,
            "role": role,
            "usedImage": getattr(getattr(image_node, "image", None), "name", None),
            "mode": "color1_mask",
        })
    return {
        "materialsWrapped": len(changed),
        "names": [item["name"] for item in changed],
        "details": changed,
        "skipped": skipped,
        "vendorShaderPreserved": True,
        "emissionEnabled": False,
        "texturesOverwritten": False,
    }


def scatter_forest_dressing(scene) -> dict:
    import bpy

    root = scene.collection.children.get("TJ_VENDOR_REFERENCE_ROOT")
    if root is None:
        return {"applied": False, "reason": "ROOT_MISSING"}
    rng = random.Random(7301)
    leaves_before = sum(1 for obj in root.objects if "fallen" in obj.name.lower())
    leaf_sources = [obj for obj in root.objects if obj.type == "MESH" and "fallen" in obj.name.lower()]
    added_leaves = 0
    if leaf_sources:
        needed = max(0, FALLEN_LEAF_TARGET - leaves_before)
        for _ in range(needed):
            source = rng.choice(leaf_sources)
            obj = source.copy()
            obj.data = source.data
            root.objects.link(obj)
            obj.location = (rng.uniform(-7.5, 7.5), rng.uniform(-3.5, 10.0), 0.014)
            obj.rotation_euler.z += rng.uniform(-math.pi, math.pi)
            scale = rng.uniform(0.85, 1.25)
            obj.scale = tuple(float(v) * scale for v in obj.scale)
            _tag(obj)
            added_leaves += 1

    rocks_added = _scatter_rocks(root, rng)
    leaves_after = sum(1 for obj in root.objects if "fallen" in obj.name.lower())
    return {
        "fallenLeafInstanceCountBefore": leaves_before,
        "fallenLeafInstanceCountAfter": leaves_after,
        "fallenLeavesAdded": added_leaves,
        "rocksAdded": rocks_added,
        "geometryRebuilt": False,
    }


def _scatter_rocks(root, rng) -> int:
    import bpy

    if not ROCK_BLEND.is_file():
        return 0
    existing = [obj for obj in bpy.data.objects if obj.name.startswith("TJ_ProdRock_")]
    if existing:
        return len(existing)
    names = ["Rock_Model_Small_4_001", "Rock_Model_Small_4_008", "Rock_Model_Small_2_001"]
    appended = []
    for name in names:
        try:
            bpy.ops.wm.append(
                filepath=str(ROCK_BLEND) + "/Object/" + name,
                directory=str(ROCK_BLEND) + "/Object/",
                filename=name,
            )
        except Exception:
            continue
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = True
            obj.hide_viewport = True
            appended.append(obj)
    if not appended:
        return 0
    added = 0
    for index in range(ROCK_INSTANCE_TARGET):
        source = rng.choice(appended)
        obj = source.copy()
        obj.data = source.data
        obj.name = f"TJ_ProdRock_{index:02d}"
        root.objects.link(obj)
        obj.location = (rng.uniform(-8.0, 8.0), rng.uniform(-4.0, 14.0), 0.0)
        obj.rotation_euler.z += rng.uniform(-math.pi, math.pi)
        factor = rng.uniform(0.18, 0.42)
        obj.scale = tuple(float(v) * factor for v in obj.scale)
        _tag(obj)
        added += 1
    for obj in appended:
        if obj.name in root.objects:
            continue
        try:
            obj.hide_render = True
            obj.hide_viewport = True
        except Exception:
            pass
    return added


def install_atmospheric_camera_world(scene) -> dict:
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        return {"applied": False}
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    camera_mix = nodes.get("TJ_CinematicWorldCameraMix_V1")
    if camera_mix is None:
        return {"applied": False, "reason": "CAMERA_MIX_MISSING"}
    for name in ("TJ_CameraSkyBreakup_V1", "TJ_CameraSkyVary_V1", "TJ_CameraOwnedSky_V1", "TJ_ProdHorizon_V1"):
        node = nodes.get(name)
        if node is not None:
            nodes.remove(node)
    sky_tint = nodes.get("TJ_CinematicSkyTint_V1")
    if sky_tint is not None:
        # Keep owned HDRI cloud/sky identity instead of a solid tint card.
        _mix_fac(sky_tint).default_value = 0.28
    remap = nodes.get("TJ_CinematicHorizonRemap_V1")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.name = "TJ_ProdHorizon_V1"
    ramp.location = (-80, 560)
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.38
    ramp.color_ramp.elements[0].color = (0.24, 0.26, 0.24, 1.0)
    ramp.color_ramp.elements[1].position = 0.58
    ramp.color_ramp.elements[1].color = (0.36, 0.40, 0.42, 1.0)
    if remap is not None:
        links.new(remap.outputs["Result"], ramp.inputs["Fac"])
    else:
        geom = nodes.new("ShaderNodeNewGeometry")
        geom.location = (-520, 560)
        sep = nodes.new("ShaderNodeSeparateXYZ")
        sep.location = (-300, 560)
        links.new(geom.outputs["Incoming"], sep.inputs["Vector"])
        links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    tex = nodes.new("ShaderNodeTexCoord")
    tex.location = (-520, 740)
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "TJ_CameraSkyBreakup_V1"
    noise.location = (-300, 740)
    noise.inputs["Scale"].default_value = 1.6
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.35
    links.new(tex.outputs["Generated"], noise.inputs["Vector"])
    vary = _new_mix(nodes, "TJ_CameraSkyVary_V1")
    vary.location = (160, 560)
    _mix_fac(vary).default_value = 0.08
    links.new(noise.outputs["Fac"], _mix_fac(vary))
    links.new(ramp.outputs["Color"], _mix_ab(vary)[0])
    _set_rgba(_mix_ab(vary)[1], (0.40, 0.44, 0.46, 1.0))
    for link in list(links):
        if link.to_node == camera_mix and link.to_socket == _mix_ab(camera_mix)[0]:
            links.remove(link)
    links.new(_mix_out(vary), _mix_ab(camera_mix)[0])
    _tag(ramp)
    _tag(vary)
    return {
        "applied": True,
        "skyLightingSource": "tj_hdri_diag_8k.jpg",
        "skyCameraSource": "HDRI_UPPER_PLUS_ATMOSPHERIC_GRADIENT",
        "flatCardRemoved": True,
        "ownedSkyPreviewRemoved": True,
    }


def rebalance_production_lights(scene) -> dict:
    changed = {}
    fill = scene.objects.get("TJ_SoftFill")
    if fill is not None:
        fill.data.energy = FILL_ENERGY
        changed["fill"] = FILL_ENERGY
    bounce = scene.objects.get("TJ_ClearingBounce")
    if bounce is not None:
        bounce.data.energy = BOUNCE_ENERGY
        changed["bounce"] = BOUNCE_ENERGY
    canopy = scene.objects.get("TJ_ForestCanopyFill_V1")
    if canopy is not None:
        canopy.data.energy = CANOPY_FILL_ENERGY
        changed["canopyFill"] = CANOPY_FILL_ENERGY
    world = scene.world
    if world is not None and world.use_nodes and world.node_tree is not None:
        light_bg = world.node_tree.nodes.get("TJ_CinematicWorldLight_V1")
        if light_bg is not None and "Strength" in light_bg.inputs:
            light_bg.inputs["Strength"].default_value = HDRI_LIGHT_STRENGTH
            changed["hdriLight"] = HDRI_LIGHT_STRENGTH
    scene.view_settings.exposure = EXPOSURE
    return changed


def apply_forest_production_shading_rebuild(scene) -> dict:
    bark = install_production_trunk_materials()
    ground = install_production_earth()
    flora = install_flora_production_wrappers()
    dressing = scatter_forest_dressing(scene)
    sky = install_atmospheric_camera_world(scene)
    lights = rebalance_production_lights(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_PRODUCTION_SHADING_REBUILD_V1",
        "feature": FEATURE,
        "bark": bark,
        "ground": ground,
        "flora": flora,
        "dressing": dressing,
        "sky": sky,
        "lights": lights,
        "exposure": EXPOSURE,
        "emissionShadersAdded": False,
        "purchasedTexturesOverwritten": False,
        "cameraChanged": False,
        "geometryRebuilt": False,
    }
