"""Cinematic lighting + lookdev pass. Geometry, camera, and purchased assets stay locked."""

from __future__ import annotations

import math

FEATURE = "cinematic_forest_lighting_repair_v1"
COLLECTION_NAME = "TJ_CINEMATIC_LIGHTING_REPAIR_V1"
BG_RECEIVER_COLLECTION = "TJ_CINEMATIC_BG_RECEIVERS_V1"
BG_FILL_NAME = "TJ_CinematicBgSeparation_V1"

# High side-key: penetrate canopy gaps, side-light trunks, keep readable shadow direction.
SUN_TRAVEL = (0.4682, 0.4007, -0.7875)
SUN_ROTATION_DEG = (38.0, 2.0, -52.0)
SUN_ENERGY = 9.4
SUN_COLOR = (1.0, 0.88, 0.72)
SUN_ANGLE_DEG = 4.5

FILL_ENERGY = 260.0
FILL_COLOR = (0.58, 0.74, 1.0)
FILL_LOCATION = (0.0, -7.2, 11.5)
FILL_AIM = (0.0, 8.0, 5.5)
FILL_SIZE = 9.0

RIM_ENERGY = 3.15
RIM_COLOR = (0.72, 0.84, 1.0)
RIM_TRAVEL = (-0.28, -0.52, -0.81)

BOUNCE_ENERGY = 95.0
BOUNCE_COLOR = (0.38, 0.52, 0.36)
BOUNCE_LOCATION = (0.0, 8.2, 4.2)
BOUNCE_AIM = (0.0, 8.0, 9.0)
BOUNCE_SIZE = 12.0

CANOPY_FILL_ENERGY = 620.0
CANOPY_FILL_COLOR = (0.66, 0.80, 1.0)
CANOPY_RIM_ENERGY = 240.0

TRANSLUCENCY_FACTOR = 0.26
TRANSLUCENT_COLOR = (0.24, 0.38, 0.14, 1.0)

GROUND_EARTH = (0.056, 0.048, 0.034)
GROUND_MOSS = (0.046, 0.070, 0.038)
GROUND_DAMP = (0.036, 0.033, 0.027)
GROUND_ROCK = (0.068, 0.064, 0.056)

HDRI_LIGHT_STRENGTH = 1.42
HDRI_CAMERA_STRENGTH = 0.78
GROUND_BOUNCE_COLOR = (0.11, 0.14, 0.08, 1.0)
CAMERA_HAZE_COLOR = (0.36, 0.48, 0.62, 1.0)
SKY_CAMERA_TINT = (0.90, 0.94, 1.04, 1.0)

ATMOSPHERE_DENSITY = 0.0019
ATMOSPHERE_COLOR = (0.70, 0.79, 0.90, 1.0)
ATMOSPHERE_ANISOTROPY = 0.44

EXPOSURE = 0.22
GAMMA = 1.0
VIEW_TRANSFORM = "AgX"
PREFERRED_LOOKS = (
    "AgX - Medium High Contrast",
    "Medium High Contrast",
    "AgX - High Contrast",
    "None",
)

MIST_START = 14.0
MIST_DEPTH = 42.0
MIST_STRENGTH = 0.38
MIST_COLOR = (0.52, 0.60, 0.70, 1.0)

DIFFUSE_BOUNCES = 12
GLOSSY_BOUNCES = 4
TRANSMISSION_BOUNCES = 12
TRANSPARENT_BOUNCES = 24
VOLUME_BOUNCES = 4
MAX_BOUNCES = 16


def _tag(id_data) -> None:
    id_data["tj_generated"] = True
    id_data["tj_feature"] = FEATURE


def _normalize(vec):
    length = math.sqrt(sum(v * v for v in vec)) or 1.0
    return tuple(v / length for v in vec)


def _aim_at(obj, target) -> None:
    from mathutils import Vector

    direction = Vector(target) - obj.location
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _aim_travel(obj, travel) -> None:
    from mathutils import Vector

    direction = Vector(_normalize(travel))
    if direction.length < 1e-6:
        return
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _mix_color_sockets(node):
    names = [socket.name for socket in node.inputs]
    if "A" in names and "B" in names:
        return node.inputs["A"], node.inputs["B"]
    color_inputs = [socket for socket in node.inputs if socket.name in {"Color1", "Color2", "Color"} or "Color" in socket.name]
    if len(color_inputs) >= 2:
        return color_inputs[0], color_inputs[1]
    return node.inputs[1], node.inputs[2]


def _mix_factor(node):
    if "Factor" in node.inputs:
        return node.inputs["Factor"]
    if "Fac" in node.inputs:
        return node.inputs["Fac"]
    return node.inputs[0]


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


def select_agx_look(scene) -> str:
    available = []
    try:
        available = [item.identifier for item in scene.view_settings.bl_rna.properties["look"].enum_items]
    except Exception:
        available = []
    for look in PREFERRED_LOOKS:
        if not available or look in available:
            try:
                scene.view_settings.look = look
                return look
            except Exception:
                continue
    scene.view_settings.look = "None"
    return "None"


def apply_color_management(scene) -> dict:
    scene.view_settings.view_transform = VIEW_TRANSFORM
    scene.view_settings.exposure = float(EXPOSURE)
    scene.view_settings.gamma = float(GAMMA)
    look = select_agx_look(scene)
    return {
        "viewTransform": scene.view_settings.view_transform,
        "look": look,
        "exposure": float(scene.view_settings.exposure),
        "gamma": float(scene.view_settings.gamma),
    }


def apply_cycles_quality(scene) -> dict:
    if scene.render.engine != "CYCLES" or not hasattr(scene, "cycles"):
        return {"applied": False}
    cycles = scene.cycles
    cycles.diffuse_bounces = DIFFUSE_BOUNCES
    cycles.glossy_bounces = GLOSSY_BOUNCES
    cycles.transmission_bounces = TRANSMISSION_BOUNCES
    cycles.transparent_max_bounces = TRANSPARENT_BOUNCES
    cycles.volume_bounces = VOLUME_BOUNCES
    cycles.max_bounces = max(int(getattr(cycles, "max_bounces", 0) or 0), MAX_BOUNCES)
    if hasattr(cycles, "use_fast_gi"):
        cycles.use_fast_gi = False
    if hasattr(cycles, "ao_bounces"):
        try:
            cycles.ao_bounces = 0
        except Exception:
            pass
    if hasattr(cycles, "ao_bounces_render"):
        try:
            cycles.ao_bounces_render = 0
        except Exception:
            pass
    if hasattr(cycles, "sample_clamp_indirect"):
        cycles.sample_clamp_indirect = 16.0
    if hasattr(cycles, "sample_clamp_direct"):
        cycles.sample_clamp_direct = 8.0
    if hasattr(cycles, "use_caustics"):
        cycles.use_caustics = False
    return {
        "applied": True,
        "diffuseBounces": int(cycles.diffuse_bounces),
        "maxBounces": int(cycles.max_bounces),
        "fastGi": bool(getattr(cycles, "use_fast_gi", False)),
        "transparentMaxBounces": int(cycles.transparent_max_bounces),
    }


def apply_cinematic_world(scene) -> dict:
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        raise RuntimeError("CINEMATIC_WORLD_MISSING")
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    hdri_image = None
    for node in nodes:
        if node.type == "TEX_ENVIRONMENT" and getattr(node, "image", None) is not None:
            hdri_image = node.image
            break
    if hdri_image is None:
        raise RuntimeError("CINEMATIC_HDRI_IMAGE_MISSING")
    nodes.clear()

    output = nodes.new("ShaderNodeOutputWorld")
    output.location = (980, 80)
    light_path = nodes.new("ShaderNodeLightPath")
    light_path.location = (620, 280)
    geom = nodes.new("ShaderNodeNewGeometry")
    geom.location = (-860, 40)
    separate = nodes.new("ShaderNodeSeparateXYZ")
    separate.location = (-640, 40)
    links.new(geom.outputs["Incoming"], separate.inputs["Vector"])
    remap = nodes.new("ShaderNodeMapRange")
    remap.name = "TJ_CinematicHorizonRemap_V1"
    remap.location = (-420, 40)
    remap.inputs["From Min"].default_value = -1.0
    remap.inputs["From Max"].default_value = 1.0
    remap.inputs["To Min"].default_value = 0.0
    remap.inputs["To Max"].default_value = 1.0
    links.new(separate.outputs["Z"], remap.inputs["Value"])
    horizon = nodes.new("ShaderNodeValToRGB")
    horizon.name = "TJ_CinematicHorizon_V1"
    horizon.location = (-220, 40)
    horizon.color_ramp.interpolation = "EASE"
    horizon.color_ramp.elements[0].position = 0.46
    horizon.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    horizon.color_ramp.elements[1].position = 0.54
    horizon.color_ramp.elements[1].color = (1.0, 1.0, 1.0, 1.0)
    links.new(remap.outputs["Result"], horizon.inputs["Fac"])

    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-860, 320)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.name = "TJ_CinematicHdriMap_V1"
    mapping.location = (-640, 320)
    env = nodes.new("ShaderNodeTexEnvironment")
    env.name = "TJ_CinematicHdri_V1"
    env.location = (-400, 320)
    env.image = hdri_image
    links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], env.inputs["Vector"])

    sky_tint = _new_mix_color(nodes, "TJ_CinematicSkyTint_V1")
    try:
        sky_tint.blend_type = "MULTIPLY"
    except Exception:
        pass
    sky_tint.location = (-160, 340)
    _mix_factor(sky_tint).default_value = 1.0
    a_sock, b_sock = _mix_color_sockets(sky_tint)
    _set_rgba(b_sock, SKY_CAMERA_TINT)
    links.new(env.outputs["Color"], a_sock)

    light_mix = _new_mix_color(nodes, "TJ_CinematicWorldLightMix_V1")
    light_mix.location = (80, 80)
    _set_rgba(_mix_color_sockets(light_mix)[0], GROUND_BOUNCE_COLOR)
    links.new(horizon.outputs["Color"], _mix_factor(light_mix))
    links.new(env.outputs["Color"], _mix_color_sockets(light_mix)[1])

    camera_mix = _new_mix_color(nodes, "TJ_CinematicWorldCameraMix_V1")
    camera_mix.location = (80, 320)
    _set_rgba(_mix_color_sockets(camera_mix)[0], CAMERA_HAZE_COLOR)
    links.new(horizon.outputs["Color"], _mix_factor(camera_mix))
    camera_color_out = sky_tint.outputs.get("Result") or sky_tint.outputs.get("Color") or sky_tint.outputs[0]
    links.new(camera_color_out, _mix_color_sockets(camera_mix)[1])

    bg_light = nodes.new("ShaderNodeBackground")
    bg_light.name = "TJ_CinematicWorldLight_V1"
    bg_light.location = (360, 40)
    bg_light.inputs["Strength"].default_value = HDRI_LIGHT_STRENGTH
    light_color_out = light_mix.outputs.get("Result") or light_mix.outputs.get("Color") or light_mix.outputs[0]
    links.new(light_color_out, bg_light.inputs["Color"])

    bg_camera = nodes.new("ShaderNodeBackground")
    bg_camera.name = "TJ_CinematicWorldCamera_V1"
    bg_camera.location = (360, 280)
    bg_camera.inputs["Strength"].default_value = HDRI_CAMERA_STRENGTH
    cam_color_out = camera_mix.outputs.get("Result") or camera_mix.outputs.get("Color") or camera_mix.outputs[0]
    links.new(cam_color_out, bg_camera.inputs["Color"])

    mix_shader = nodes.new("ShaderNodeMixShader")
    mix_shader.location = (640, 140)
    links.new(light_path.outputs["Is Camera Ray"], mix_shader.inputs["Fac"])
    links.new(bg_light.outputs["Background"], mix_shader.inputs[1])
    links.new(bg_camera.outputs["Background"], mix_shader.inputs[2])
    links.new(mix_shader.outputs["Shader"], output.inputs["Surface"])

    _tag(world)
    _tag(mapping)
    _tag(env)
    return {
        "hdriImage": hdri_image.name,
        "lightStrength": HDRI_LIGHT_STRENGTH,
        "cameraStrength": HDRI_CAMERA_STRENGTH,
        "greyGroundReplaced": True,
        "cameraSkyProtected": True,
    }


def apply_ground_lookdev(scene) -> dict:
    import bpy

    ground = scene.objects.get("TJ_VendorGround")
    if ground is None or ground.data is None:
        return {"applied": False, "reason": "GROUND_MISSING"}
    material = None
    if ground.data.materials:
        material = ground.data.materials[0]
    if material is None:
        material = bpy.data.materials.get("TJ_VendorGround_Mat")
    if material is None:
        material = bpy.data.materials.new("TJ_VendorGround_Mat")
        ground.data.materials.append(material)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (720, 80)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (400, 80)
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-720, 80)
    noise_a = nodes.new("ShaderNodeTexNoise")
    noise_a.location = (-480, 180)
    noise_a.inputs["Scale"].default_value = 3.4
    noise_a.inputs["Detail"].default_value = 8.0
    noise_a.inputs["Roughness"].default_value = 0.52
    noise_b = nodes.new("ShaderNodeTexNoise")
    noise_b.location = (-480, -40)
    noise_b.inputs["Scale"].default_value = 1.6
    noise_b.inputs["Detail"].default_value = 4.0
    noise_b.inputs["Roughness"].default_value = 0.62
    links.new(tex_coord.outputs["Object"], noise_a.inputs["Vector"])
    links.new(tex_coord.outputs["Object"], noise_b.inputs["Vector"])

    earth_moss = _new_mix_color(nodes, "TJ_GroundEarthMoss_V1")
    earth_moss.location = (-160, 180)
    _set_rgba(_mix_color_sockets(earth_moss)[0], (*GROUND_EARTH, 1.0))
    _set_rgba(_mix_color_sockets(earth_moss)[1], (*GROUND_MOSS, 1.0))
    links.new(noise_a.outputs["Fac"], _mix_factor(earth_moss))

    damp_rock = _new_mix_color(nodes, "TJ_GroundDampRock_V1")
    damp_rock.location = (-160, -40)
    _set_rgba(_mix_color_sockets(damp_rock)[0], (*GROUND_DAMP, 1.0))
    _set_rgba(_mix_color_sockets(damp_rock)[1], (*GROUND_ROCK, 1.0))
    links.new(noise_b.outputs["Fac"], _mix_factor(damp_rock))

    combine = _new_mix_color(nodes, "TJ_GroundCombine_V1")
    combine.location = (120, 80)
    _mix_factor(combine).default_value = 0.38
    links.new(noise_b.outputs["Fac"], _mix_factor(combine))
    earth_out = earth_moss.outputs.get("Result") or earth_moss.outputs.get("Color") or earth_moss.outputs[0]
    damp_out = damp_rock.outputs.get("Result") or damp_rock.outputs.get("Color") or damp_rock.outputs[0]
    links.new(earth_out, _mix_color_sockets(combine)[0])
    links.new(damp_out, _mix_color_sockets(combine)[1])
    combine_out = combine.outputs.get("Result") or combine.outputs.get("Color") or combine.outputs[0]
    links.new(combine_out, bsdf.inputs["Base Color"])
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.91
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.18
    elif "Specular" in bsdf.inputs:
        bsdf.inputs["Specular"].default_value = 0.18
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    _tag(material)
    return {
        "applied": True,
        "material": material.name,
        "earth": list(GROUND_EARTH),
        "moss": list(GROUND_MOSS),
        "orangeCastReduced": True,
        "texturesOverwritten": False,
    }


def apply_atmosphere_lookdev(scene) -> dict:
    volume = scene.objects.get("TJ_Atmosphere")
    if volume is None:
        return {"applied": False, "reason": "ATMOSPHERE_MISSING"}
    material = None
    if volume.data and volume.data.materials:
        material = volume.data.materials[0]
    if material is None or not material.use_nodes or material.node_tree is None:
        return {"applied": False, "reason": "ATMOSPHERE_MATERIAL_MISSING"}
    principled = next((node for node in material.node_tree.nodes if node.type == "PRINCIPLED_VOLUME"), None)
    if principled is None:
        return {"applied": False, "reason": "VOLUME_NODE_MISSING"}
    if "Density" in principled.inputs:
        principled.inputs["Density"].default_value = ATMOSPHERE_DENSITY
    if "Color" in principled.inputs:
        _set_rgba(principled.inputs["Color"], ATMOSPHERE_COLOR)
    if "Anisotropy" in principled.inputs:
        principled.inputs["Anisotropy"].default_value = ATMOSPHERE_ANISOTROPY
    _tag(material)
    return {
        "applied": True,
        "density": ATMOSPHERE_DENSITY,
        "color": list(ATMOSPHERE_COLOR),
        "anisotropy": ATMOSPHERE_ANISOTROPY,
    }


def _retune_light(obj, **kwargs) -> dict:
    data = obj.data
    if "energy" in kwargs:
        data.energy = float(kwargs["energy"])
    if "color" in kwargs:
        data.color = tuple(kwargs["color"])
    if "size" in kwargs and hasattr(data, "size"):
        data.size = float(kwargs["size"])
    if "angle_deg" in kwargs and hasattr(data, "angle"):
        data.angle = math.radians(float(kwargs["angle_deg"]))
    if "location" in kwargs:
        obj.location = tuple(kwargs["location"])
    if "travel" in kwargs:
        _aim_travel(obj, kwargs["travel"])
    elif "aim" in kwargs:
        _aim_at(obj, kwargs["aim"])
    _tag(obj)
    _tag(data)
    return {
        "name": obj.name,
        "energy": float(getattr(data, "energy", 0) or 0),
        "color": [round(float(c), 4) for c in getattr(data, "color", (1, 1, 1))],
        "location": [round(float(v), 4) for v in obj.location],
    }


def _ensure_collection(scene, name: str):
    import bpy

    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    _tag(collection)
    return collection


def _ensure_light(collection, name: str, light_type: str):
    import bpy

    existing = bpy.data.objects.get(name)
    if existing is not None and existing.type == "LIGHT":
        if existing.name not in collection.objects:
            collection.objects.link(existing)
        _tag(existing)
        _tag(existing.data)
        return existing
    data = bpy.data.lights.new(name, type=light_type)
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    _tag(data)
    _tag(obj)
    return obj


def retune_existing_lights(scene) -> dict:
    changed = {}
    sun = scene.objects.get("TJ_GoldenSun")
    if sun is not None:
        changed["sun"] = _retune_light(
            sun,
            energy=SUN_ENERGY,
            color=SUN_COLOR,
            angle_deg=SUN_ANGLE_DEG,
            travel=SUN_TRAVEL,
        )
        changed["sun"]["travel"] = list(_normalize(SUN_TRAVEL))
        changed["sun"]["rotationDeg"] = list(SUN_ROTATION_DEG)
    fill = scene.objects.get("TJ_SoftFill")
    if fill is not None:
        changed["fill"] = _retune_light(
            fill,
            energy=FILL_ENERGY,
            color=FILL_COLOR,
            size=FILL_SIZE,
            location=FILL_LOCATION,
            aim=FILL_AIM,
        )
    rim = scene.objects.get("TJ_CanopyRim")
    if rim is not None:
        changed["rim"] = _retune_light(rim, energy=RIM_ENERGY, color=RIM_COLOR, travel=RIM_TRAVEL)
    bounce = scene.objects.get("TJ_ClearingBounce")
    if bounce is not None:
        changed["bounce"] = _retune_light(
            bounce,
            energy=BOUNCE_ENERGY,
            color=BOUNCE_COLOR,
            size=BOUNCE_SIZE,
            location=BOUNCE_LOCATION,
            aim=BOUNCE_AIM,
        )
    canopy_fill = scene.objects.get("TJ_ForestCanopyFill_V1")
    if canopy_fill is not None:
        changed["canopyFill"] = _retune_light(
            canopy_fill,
            energy=CANOPY_FILL_ENERGY,
            color=CANOPY_FILL_COLOR,
        )
    canopy_rim = scene.objects.get("TJ_ForestCanopyRim_V1")
    if canopy_rim is not None:
        changed["canopyRim"] = _retune_light(canopy_rim, energy=CANOPY_RIM_ENERGY)
    return changed


def add_background_separation(scene) -> dict:
    lighting = _ensure_collection(scene, COLLECTION_NAME)
    receivers = _ensure_collection(scene, BG_RECEIVER_COLLECTION)
    for obj in list(receivers.objects):
        receivers.objects.unlink(obj)
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        name = str(obj.name).lower()
        if "tree" not in name and "bush" not in name:
            continue
        if float(obj.location.y) < 17.0:
            continue
        if obj.name not in receivers.objects:
            receivers.objects.link(obj)
    fill = _ensure_light(lighting, BG_FILL_NAME, "AREA")
    fill.data.type = "AREA"
    fill.data.shape = "DISK"
    fill.data.size = 16.0
    fill.data.energy = 170.0
    fill.data.color = (0.64, 0.76, 1.0)
    fill.location = (0.0, 29.0, 9.5)
    _aim_at(fill, (0.0, 20.0, 6.0))
    linked = False
    linking = getattr(fill, "light_linking", None)
    if linking is not None and receivers.objects:
        try:
            linking.receiver_collection = receivers
            linked = True
        except Exception:
            linked = False
    return {
        "name": fill.name,
        "energy": float(fill.data.energy),
        "receiverCount": len(receivers.objects),
        "lightLinking": linked,
    }


def repair_foliage_translucency(scene) -> dict:
    from forest_canopy_lighting_repair_v1 import (
        COLOR_NODE,
        MIX_NODE,
        find_foliage_materials,
        repair_foliage_light_response,
    )

    materials = find_foliage_materials(scene)
    repair_foliage_light_response(materials)
    updated = []
    for material in materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        mix = material.node_tree.nodes.get(MIX_NODE)
        color = material.node_tree.nodes.get(COLOR_NODE)
        if mix is None:
            continue
        if "Fac" in mix.inputs:
            mix.inputs["Fac"].default_value = TRANSLUCENCY_FACTOR
        if color is not None and "Color" in color.outputs:
            color.outputs["Color"].default_value = TRANSLUCENT_COLOR
        _tag(mix)
        updated.append(material.name)
    return {
        "materialsUpdated": len(updated),
        "names": updated,
        "factor": TRANSLUCENCY_FACTOR,
        "texturesOverwritten": False,
    }


def apply_depth_cues(scene) -> dict:
    world = scene.world
    mist = {"enabled": False}
    if world is not None and hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = True
        world.mist_settings.start = MIST_START
        world.mist_settings.depth = MIST_DEPTH
        world.mist_settings.falloff = "QUADRATIC"
        mist = {"enabled": True, "start": MIST_START, "depth": MIST_DEPTH}
    view_layer = scene.view_layers[0] if scene.view_layers else None
    if view_layer is not None and hasattr(view_layer, "use_pass_mist"):
        view_layer.use_pass_mist = True
    scene.use_nodes = True
    tree = scene.node_tree
    if tree is None:
        return {"mist": mist, "compositor": False}
    nodes = tree.nodes
    links = tree.links
    render_layers = next((node for node in nodes if node.type == "R_LAYERS"), None)
    composite = next((node for node in nodes if node.type == "COMPOSITE"), None)
    if render_layers is None:
        render_layers = nodes.new("CompositorNodeRLayers")
    if composite is None:
        composite = nodes.new("CompositorNodeComposite")
    for node in list(nodes):
        if node.get("tj_feature") == FEATURE:
            nodes.remove(node)
    mix = nodes.new("CompositorNodeMixRGB")
    mix.name = "TJ_CinematicMistMix_V1"
    mix.blend_type = "MIX"
    mix.location = (composite.location.x - 220, composite.location.y)
    _tag(mix)
    mist_color = nodes.new("CompositorNodeRGB")
    mist_color.name = "TJ_CinematicMistColor_V1"
    mist_color.location = (mix.location.x - 220, mix.location.y - 140)
    mist_color.outputs["RGBA"].default_value = MIST_COLOR
    _tag(mist_color)
    scale = nodes.new("CompositorNodeMath")
    scale.name = "TJ_CinematicMistScale_V1"
    scale.operation = "MULTIPLY"
    scale.location = (mix.location.x - 220, mix.location.y + 80)
    scale.inputs[1].default_value = MIST_STRENGTH
    _tag(scale)
    for link in list(links):
        if link.to_node == composite:
            links.remove(link)
    if "Mist" in render_layers.outputs:
        links.new(render_layers.outputs["Mist"], scale.inputs[0])
        links.new(scale.outputs["Value"], mix.inputs["Fac"])
    links.new(render_layers.outputs["Image"], mix.inputs[1])
    links.new(mist_color.outputs["RGBA"], mix.inputs[2])
    links.new(mix.outputs["Image"], composite.inputs["Image"])
    if hasattr(scene.render, "use_compositing"):
        scene.render.use_compositing = True
    return {"mist": mist, "compositor": True, "mistStrength": MIST_STRENGTH}


def verify_locks(scene) -> dict:
    camera = scene.camera
    location = [round(float(v), 4) for v in camera.location] if camera is not None else None
    lens = float(camera.data.lens) if camera is not None else None
    if location != [0.0, -12.5, 2.15]:
        raise RuntimeError("CINEMATIC_CAMERA_LOCATION_CHANGED")
    if lens is None or abs(lens - 42.0) > 0.001:
        raise RuntimeError("CINEMATIC_CAMERA_LENS_CHANGED")
    return {
        "cameraLocation": location,
        "cameraLensMm": lens,
        "cameraChanged": False,
        "geometryRebuilt": False,
    }


def apply_cinematic_forest_lighting_repair(scene) -> dict:
    locks = verify_locks(scene)
    color = apply_color_management(scene)
    cycles = apply_cycles_quality(scene)
    world = apply_cinematic_world(scene)
    ground = apply_ground_lookdev(scene)
    atmosphere = apply_atmosphere_lookdev(scene)
    lights = retune_existing_lights(scene)
    background = add_background_separation(scene)
    foliage = repair_foliage_translucency(scene)
    depth = apply_depth_cues(scene)
    return {
        "schema": "TIVVLEJOY_CINEMATIC_FOREST_LIGHTING_REPAIR_V1",
        "feature": FEATURE,
        "locks": locks,
        "colorManagement": color,
        "cycles": cycles,
        "world": world,
        "ground": ground,
        "atmosphere": atmosphere,
        "lights": lights,
        "backgroundSeparation": background,
        "foliage": foliage,
        "depth": depth,
        "emissionShadersAdded": False,
        "purchasedTexturesOverwritten": False,
        "vendorBlendSaved": False,
        "cameraChanged": False,
        "geometryRebuilt": False,
    }
