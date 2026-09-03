"""Material-readability repair. Camera, layout, and purchased assets stay locked."""

from __future__ import annotations

from pathlib import Path

FEATURE = "forest_material_readability_repair_v1"
VENDOR_TRUNK_BRIGHT = 0.06
VENDOR_TRUNK_CONTRAST = 0.14
BARK_GRAIN_CONTRAST = 0.20
VENDOR_TRUNK_STRENGTH = 0.20

# Live-measured vendor Color sockets before the failed Bright/Color lift.
VENDOR_TRUNK_SOCKETS = {
    "TreeTrunk_Mat_1": {
        "Color": (0.2482, 0.0989, 0.0393, 1.0),
        "Strength": 0.20,
        "Gradient": 0.30,
        "Random Color": 0.20,
    },
    "TreeTrunk_Mat_1.001": {
        "Color": (0.0662, 0.0324, 0.016, 1.0),
    },
    "TreeTrunk_Mat_3": {
        "Color": (0.0919, 0.0417, 0.0214, 1.0),
        "Strength": 0.20,
        "Gradient": 1.0,
        "Random Color": 1.0,
    },
    "TreeTrunk_Mat_4": {
        "Color": (0.2482, 0.1158, 0.1195, 1.0),
        "Strength": 0.20,
        "Gradient": 1.0,
        "Random Color": 1.0,
    },
}

GROUND_EARTH = (0.046, 0.038, 0.028, 1.0)
GROUND_MOSS_TINT = (0.034, 0.048, 0.030, 1.0)
ECOKIT_TEXTURE_DIRS = (
    Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/Textures"),
    Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/textures"),
)


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _set_rgba(socket, rgba) -> None:
    values = list(rgba)
    while len(values) < 4:
        values.append(1.0)
    socket.default_value = tuple(values[:4])


def _new_mix_color(nodes, name: str):
    try:
        node = nodes.new("ShaderNodeMix")
        node.data_type = "RGBA"
    except Exception:
        node = nodes.new("ShaderNodeMixRGB")
    node.name = name
    node.label = name
    return node


def _mix_sockets(node):
    names = [socket.name for socket in node.inputs]
    if "A" in names and "B" in names:
        return node.inputs["A"], node.inputs["B"]
    color_inputs = [socket for socket in node.inputs if "Color" in socket.name]
    if len(color_inputs) >= 2:
        return color_inputs[0], color_inputs[1]
    return node.inputs[1], node.inputs[2]


def _mix_factor(node):
    if "Factor" in node.inputs:
        return node.inputs["Factor"]
    if "Fac" in node.inputs:
        return node.inputs["Fac"]
    return node.inputs[0]


def _mix_out(node):
    return node.outputs.get("Result") or node.outputs.get("Color") or node.outputs[0]


def find_ecokit_image(name: str):
    import bpy

    existing = bpy.data.images.get(name)
    if existing is not None and existing.size[0] > 0:
        return existing
    trunk = bpy.data.images.get("Tree Trunk_1.png")
    candidates = []
    if trunk is not None and trunk.filepath:
        folder = Path(bpy.path.abspath(trunk.filepath)).parent
        candidates.append(folder / name)
    for folder in ECOKIT_TEXTURE_DIRS:
        candidates.append(folder / name)
    for path in candidates:
        if path.is_file():
            return bpy.data.images.load(str(path), check_existing=True)
    return existing


def restore_vendor_bark() -> dict:
    import bpy

    groups = []
    for group in bpy.data.node_groups:
        if not str(group.name).startswith("TreeTrunk_Mat"):
            continue
        changed = {"name": group.name, "brightRestored": False, "mix001": None, "contrast": None}
        for node in group.nodes:
            if node.type == "BRIGHTCONTRAST":
                if "Bright" in node.inputs:
                    node.inputs["Bright"].default_value = VENDOR_TRUNK_BRIGHT
                    changed["brightRestored"] = True
                if "Contrast" in node.inputs:
                    current = float(node.inputs["Contrast"].default_value)
                    if abs(current - VENDOR_TRUNK_CONTRAST) < 0.02 or current < BARK_GRAIN_CONTRAST:
                        node.inputs["Contrast"].default_value = BARK_GRAIN_CONTRAST
                    changed["contrast"] = float(node.inputs["Contrast"].default_value)
            if node.name == "Mix.001" and getattr(node, "blend_type", None) == "MULTIPLY":
                # Two UV-offset copies of Tree Trunk_1.png were multiplied, squaring
                # grayscale grain into crushed midtones. Average them instead.
                node.blend_type = "MIX"
                factor = _mix_factor(node)
                try:
                    factor.default_value = 0.5
                except Exception:
                    factor.default_value = (0.5, 0.5, 0.5)
                changed["mix001"] = "MULTIPLY_TO_MIX"
            for node_image in (n for n in group.nodes if n.type == "TEX_IMAGE" and getattr(n, "image", None)):
                if "Trunk" in (node_image.image.name or ""):
                    try:
                        node_image.image.colorspace_settings.name = "sRGB"
                    except Exception:
                        pass
        _tag(group)
        groups.append(changed)

    materials = []
    for material in bpy.data.materials:
        sockets = VENDOR_TRUNK_SOCKETS.get(material.name)
        if sockets is None or not material.use_nodes or material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if node.type != "GROUP":
                continue
            for key, value in sockets.items():
                if key not in node.inputs:
                    continue
                if key == "Color":
                    _set_rgba(node.inputs[key], value)
                else:
                    node.inputs[key].default_value = float(value)
        _tag(material)
        materials.append(material.name)

    return {
        "groups": groups,
        "materialsRestored": materials,
        "bright": VENDOR_TRUNK_BRIGHT,
        "contrast": BARK_GRAIN_CONTRAST,
        "texturesOverwritten": False,
        "textureUsed": "Tree Trunk_1.png",
        "colorLifted": False,
        "brightRaised": False,
    }


def apply_purchased_forest_floor() -> dict:
    import bpy

    ground = bpy.data.objects.get("TJ_VendorGround")
    material = bpy.data.materials.get("TJ_VendorGround_Mat")
    if ground is None:
        return {"applied": False, "reason": "GROUND_MISSING", "purchasedDirtAlbedoFound": False}
    if material is None:
        material = bpy.data.materials.new("TJ_VendorGround_Mat")
        if ground.data.materials:
            ground.data.materials[0] = material
        else:
            ground.data.materials.append(material)

    moss_a = find_ecokit_image("Moss_2.png")
    moss_b = find_ecokit_image("Moss_1.png")
    purchased = [image.name for image in (moss_a, moss_b) if image is not None]

    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (920, 80)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (640, 80)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-780, 80)

    earth = nodes.new("ShaderNodeRGB")
    earth.name = "TJ_GroundEarthColor_V1"
    earth.location = (-200, 220)
    earth.outputs["Color"].default_value = GROUND_EARTH

    moss_tint = nodes.new("ShaderNodeRGB")
    moss_tint.name = "TJ_GroundMossTint_V1"
    moss_tint.location = (-200, 40)
    moss_tint.outputs["Color"].default_value = GROUND_MOSS_TINT

    map_a = nodes.new("ShaderNodeMapping")
    map_a.location = (-560, 180)
    map_a.inputs["Scale"].default_value = (7.5, 7.5, 7.5)
    map_b = nodes.new("ShaderNodeMapping")
    map_b.location = (-560, -80)
    map_b.inputs["Scale"].default_value = (3.2, 3.2, 3.2)
    links.new(tex_coord.outputs["Object"], map_a.inputs["Vector"])
    links.new(tex_coord.outputs["Object"], map_b.inputs["Vector"])

    if moss_a is not None:
        img_a = nodes.new("ShaderNodeTexImage")
        img_a.name = "TJ_GroundMoss2_V1"
        img_a.location = (-320, 180)
        img_a.image = moss_a
        try:
            moss_a.colorspace_settings.name = "sRGB"
        except Exception:
            pass
        links.new(map_a.outputs["Vector"], img_a.inputs["Vector"])
        moss_var = img_a.outputs["Color"]
    else:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.location = (-320, 180)
        noise.inputs["Scale"].default_value = 18.0
        noise.inputs["Detail"].default_value = 8.0
        links.new(map_a.outputs["Vector"], noise.inputs["Vector"])
        moss_var = noise.outputs["Fac"]

    if moss_b is not None:
        img_b = nodes.new("ShaderNodeTexImage")
        img_b.name = "TJ_GroundMoss1_V1"
        img_b.location = (-320, -80)
        img_b.image = moss_b
        try:
            moss_b.colorspace_settings.name = "sRGB"
        except Exception:
            pass
        links.new(map_b.outputs["Vector"], img_b.inputs["Vector"])
        moss_mask = img_b.outputs["Color"]
    else:
        noise_b = nodes.new("ShaderNodeTexNoise")
        noise_b.location = (-320, -80)
        noise_b.inputs["Scale"].default_value = 14.0
        links.new(map_b.outputs["Vector"], noise_b.inputs["Vector"])
        moss_mask = noise_b.outputs["Fac"]

    vary = _new_mix_color(nodes, "TJ_GroundMossVary_V1")
    vary.location = (40, 180)
    try:
        vary.blend_type = "MULTIPLY"
    except Exception:
        pass
    _mix_factor(vary).default_value = 0.55
    links.new(earth.outputs["Color"], _mix_sockets(vary)[0])
    links.new(moss_var, _mix_sockets(vary)[1])

    combine = _new_mix_color(nodes, "TJ_GroundMossMask_V1")
    combine.location = (280, 80)
    links.new(moss_mask, _mix_factor(combine))
    links.new(_mix_out(vary), _mix_sockets(combine)[0])
    links.new(moss_tint.outputs["Color"], _mix_sockets(combine)[1])
    links.new(_mix_out(combine), bsdf.inputs["Base Color"])

    bump = nodes.new("ShaderNodeBump")
    bump.location = (280, -160)
    bump.inputs["Strength"].default_value = 0.18
    links.new(moss_var, bump.inputs["Height"])
    if "Normal" in bsdf.inputs:
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.93
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.16
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    _tag(material)
    return {
        "applied": True,
        "material": material.name,
        "purchasedDirtAlbedoFound": False,
        "purchasedTexturesUsed": purchased,
        "texturesOverwritten": False,
        "largeOliveNoiseRemoved": True,
    }


def enhance_camera_sky_variation(scene) -> dict:
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        return {"applied": False, "reason": "WORLD_MISSING"}
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    camera_bg = nodes.get("TJ_CinematicWorldCamera_V1")
    camera_mix = nodes.get("TJ_CinematicWorldCameraMix_V1")
    if camera_bg is None or camera_mix is None:
        return {"applied": False, "reason": "CAMERA_WORLD_MISSING"}

    ecokit_world = None
    import bpy

    for candidate in bpy.data.worlds:
        if candidate.name == "World" and candidate.use_nodes and candidate.node_tree:
            for node in candidate.node_tree.nodes:
                if node.type == "TEX_IMAGE" and getattr(node, "image", None):
                    ecokit_world = node.image
                    break
    sky_image = ecokit_world or find_ecokit_image("Sky_World_2.png")

    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "TJ_CameraSkyBreakup_V1"
    noise.location = (-160, 520)
    noise.inputs["Scale"].default_value = 3.4
    noise.inputs["Detail"].default_value = 6.0
    noise.inputs["Roughness"].default_value = 0.45
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-380, 520)
    links.new(tex_coord.outputs["Generated"], noise.inputs["Vector"])

    vary = _new_mix_color(nodes, "TJ_CameraSkyVary_V1")
    vary.location = (80, 500)
    _mix_factor(vary).default_value = 0.22
    haze = (0.20, 0.28, 0.40, 1.0)
    _set_rgba(_mix_sockets(vary)[0], haze)
    if sky_image is not None:
        env = nodes.new("ShaderNodeTexImage")
        env.name = "TJ_CameraOwnedSky_V1"
        env.location = (-160, 700)
        env.image = sky_image
        try:
            env.projection = "EQUIRECTANGULAR"
        except Exception:
            pass
        links.new(tex_coord.outputs["Generated"], env.inputs["Vector"])
        links.new(env.outputs["Color"], _mix_sockets(vary)[1])
        sky_source = sky_image.name
    else:
        _set_rgba(_mix_sockets(vary)[1], (0.36, 0.48, 0.68, 1.0))
        links.new(noise.outputs["Color"], _mix_factor(vary))
        sky_source = "PROCEDURAL_SKY_BREAKUP"

    if sky_image is not None:
        links.new(noise.outputs["Fac"], _mix_factor(vary))

    # Replace the flat haze color previously fed into the camera mix A socket.
    for link in list(links):
        if link.to_node == camera_mix and link.to_socket == _mix_sockets(camera_mix)[0]:
            links.remove(link)
    links.new(_mix_out(vary), _mix_sockets(camera_mix)[0])
    _tag(noise)
    _tag(vary)
    return {
        "applied": True,
        "cameraSkySource": sky_source,
        "ownedHdriKeptForLighting": True,
        "cameraStrengthUnchanged": True,
    }


def apply_forest_material_readability_repair(scene) -> dict:
    bark = restore_vendor_bark()
    ground = apply_purchased_forest_floor()
    sky = enhance_camera_sky_variation(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_MATERIAL_READABILITY_REPAIR_V1",
        "feature": FEATURE,
        "bark": bark,
        "ground": ground,
        "sky": sky,
        "emissionShadersAdded": False,
        "purchasedTexturesOverwritten": False,
        "cameraChanged": False,
        "geometryRebuilt": False,
    }
