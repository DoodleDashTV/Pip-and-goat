"""Sunny-afternoon sky and tree-detail recovery.

Human review rejected FOREST_CINEMATIC_LIGHTING_CAMERA_PROOF_V1 as gray,
hazy, and canopy-soft. This pass:

* shows EcoKit Sky_World_2.png as the camera-visible sky (lighting HDRI
  strength stays at the V3 lock of 0.12)
* warms and raises the key sun for afternoon sunlight
* lifts treeleaf / flora canopy response and bark grain contrast
* disables mist/volume haze that hid sky and canopy detail

Camera, terrain, water, composition, ground dressing, and ProdFlower hide
stay locked.
"""

from __future__ import annotations

import math
from pathlib import Path

from cinematic_forest_lighting_repair_v1 import (
    SUN_ANGLE_DEG,
    SUN_TRAVEL,
    TRANSLUCENCY_FACTOR,
    _clamp_hot_flora_color,
    _flora_light_intensity_target,
    _tag,
    repair_foliage_translucency,
    verify_locks,
)
from forest_cinematic_lighting_recovery_v1 import (
    CINEMATIC_BOUNCE_COLOR,
    CINEMATIC_FILL_COLOR,
    FILL_AIM,
    FILL_LOCATION,
    FILL_SIZE,
    BOUNCE_AIM,
    BOUNCE_LOCATION,
    BOUNCE_SIZE,
    _retune_light,
    apply_cycles_quality,
    verify_material_lighting_lock,
)
from forest_botaniq_production_recovery_v1 import LEAF_NORMAL, leaf_albedo_path, make_foliage_material
from forest_camera_ground_cover_v1 import make_ovate_leaf
from forest_ground_detail_recovery_v1 import LOCKED_MATERIAL_LIGHTING
from forest_lookdev_isolation_v1 import verify_production_camera
from forest_material_readability_repair_v1 import (
    BARK_GRAIN_CONTRAST,
    find_ecokit_image,
    restore_vendor_bark,
)

FEATURE = "forest_sunny_afternoon_tree_detail_v1"

SKY_IMAGE_NAME = "Sky_World_2.png"
SKY_CAMERA_STRENGTH = 1.05
SKY_BLUE_LIFT = (0.10, 0.28, 0.72, 1.0)
SKY_LIFT_FAC = 0.18
GENERATED_SKY_PATH = Path("/tmp/tj_afternoon_sky_card_v2.png")

AFTERNOON_SUN_ENERGY = 18.0
AFTERNOON_SUN_COLOR = (1.0, 0.94, 0.76)
AFTERNOON_EXPOSURE = 1.10
AFTERNOON_FILL_ENERGY = 350.0
AFTERNOON_BOUNCE_ENERGY = 185.0
AFTERNOON_RIM_ENERGY = 4.6
AFTERNOON_RIM_COLOR = (1.0, 0.90, 0.72)
AFTERNOON_RIM_TRAVEL = (-0.28, -0.52, -0.81)

CANOPY_FILL_ENERGY = 780.0
CANOPY_RIM_ENERGY = 480.0
SKY_CARD_COLLECTION = "TJ_AFTERNOON_SKY_CARD_V2"
CANOPY_LEAF_COLLECTION = "TJ_CANOPY_LEAF_DETAIL_V2"
FLORA_CANOPY_INTENSITY = 0.92
TREELEAF_INTENSITY = 0.78
AFTERNOON_TRANSLUCENCY = 0.22
AFTERNOON_TRANSLUCENT_COLOR = (0.36, 0.52, 0.18, 1.0)
BARK_AFTERNOON_CONTRAST = 0.26

ATMOSPHERE_DENSITY_CLEAR = 0.00015
MIST_STRENGTH_OFF = 0.0

SKY_SEARCH_DIRS = (
    Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/assets library"),
    Path("/tmp/tivvlejoy-ecokit/Stylised EcoKit/Textures"),
)


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
    color_inputs = [
        socket for socket in node.inputs
        if socket.name in {"Color1", "Color2", "Color"} or "Color" in socket.name
    ]
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


def _set_rgba(socket, rgba) -> None:
    values = list(rgba)
    while len(values) < 4:
        values.append(1.0)
    socket.default_value = tuple(values[:4])


def _load_afternoon_sky_image():
    image = find_ecokit_image(SKY_IMAGE_NAME)
    if image is not None and getattr(image, "size", (0, 0))[0] > 0:
        return image
    import bpy

    for folder in SKY_SEARCH_DIRS:
        path = folder / SKY_IMAGE_NAME
        if path.is_file():
            return bpy.data.images.load(str(path), check_existing=True)
    return None


def install_camera_visible_afternoon_sky(scene) -> dict:
    """Camera rays see EcoKit Sky_World_2. Lighting HDRI strength stays locked."""
    world = scene.world
    if world is None or not world.use_nodes or world.node_tree is None:
        return {"applied": False, "reason": "WORLD_MISSING"}
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    output = next((node for node in nodes if node.type == "OUTPUT_WORLD"), None)
    if output is None:
        return {"applied": False, "reason": "WORLD_OUTPUT_MISSING"}

    sky_image = _load_afternoon_sky_image()
    if sky_image is None:
        return {"applied": False, "reason": "SKY_WORLD_2_MISSING"}

    for name in (
        "TJ_AfternoonSkyEnv_V1",
        "TJ_AfternoonSkyMap_V1",
        "TJ_AfternoonSkyCoord_V1",
        "TJ_AfternoonSkyBg_V1",
        "TJ_AfternoonSkyLift_V1",
        "TJ_AfternoonSkyMix_V1",
        "TJ_AfternoonLightPath_V1",
    ):
        existing = nodes.get(name)
        if existing is not None:
            nodes.remove(existing)

    lighting_bg = next((node for node in nodes if node.bl_idname == "ShaderNodeBackground"), None)
    if lighting_bg is None:
        return {"applied": False, "reason": "LIGHTING_BACKGROUND_MISSING"}
    lighting_strength = float(lighting_bg.inputs["Strength"].default_value)

    light_path = nodes.new("ShaderNodeLightPath")
    light_path.name = "TJ_AfternoonLightPath_V1"
    light_path.location = (620, 280)

    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.name = "TJ_AfternoonSkyCoord_V1"
    tex_coord.location = (-860, 520)

    mapping = nodes.new("ShaderNodeMapping")
    mapping.name = "TJ_AfternoonSkyMap_V1"
    mapping.location = (-640, 520)
    mapping.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(18.0))
    mapping.inputs["Scale"].default_value = (1.35, 1.35, 1.35)
    links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])

    env = nodes.new("ShaderNodeTexEnvironment")
    env.name = "TJ_AfternoonSkyEnv_V1"
    env.location = (-400, 520)
    env.image = sky_image
    links.new(mapping.outputs["Vector"], env.inputs["Vector"])

    lift = _new_mix_color(nodes, "TJ_AfternoonSkyLift_V1")
    try:
        lift.blend_type = "ADD"
    except Exception:
        pass
    lift.location = (-160, 520)
    _mix_fac(lift).default_value = SKY_LIFT_FAC
    a_sock, b_sock = _mix_sockets(lift)
    links.new(env.outputs["Color"], a_sock)
    _set_rgba(b_sock, SKY_BLUE_LIFT)

    camera_bg = nodes.new("ShaderNodeBackground")
    camera_bg.name = "TJ_AfternoonSkyBg_V1"
    camera_bg.location = (360, 280)
    camera_bg.inputs["Strength"].default_value = SKY_CAMERA_STRENGTH
    links.new(_mix_out(lift), camera_bg.inputs["Color"])

    mix = nodes.new("ShaderNodeMixShader")
    mix.name = "TJ_AfternoonSkyMix_V1"
    mix.location = (640, 140)
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    links.new(lighting_bg.outputs["Background"], mix.inputs[1])
    links.new(camera_bg.outputs["Background"], mix.inputs[2])

    for link in list(links):
        if link.to_socket == output.inputs["Surface"]:
            links.remove(link)
    links.new(mix.outputs["Shader"], output.inputs["Surface"])

    lighting_bg.inputs["Strength"].default_value = LOCKED_MATERIAL_LIGHTING["hdriStrength"]
    _tag(world)
    _tag(env)
    _tag(camera_bg)
    return {
        "applied": True,
        "cameraSky": SKY_IMAGE_NAME,
        "cameraStrength": SKY_CAMERA_STRENGTH,
        "lightingHdriStrength": float(lighting_bg.inputs["Strength"].default_value),
        "priorLightingStrength": lighting_strength,
        "ownedLightingHdriPreserved": True,
    }


def clear_haze(scene) -> dict:
    volume = scene.objects.get("TJ_Atmosphere")
    atmosphere = {"applied": False}
    if volume is not None and volume.data and volume.data.materials:
        material = volume.data.materials[0]
        if material is not None and material.use_nodes and material.node_tree is not None:
            principled = next(
                (node for node in material.node_tree.nodes if node.type == "PRINCIPLED_VOLUME"),
                None,
            )
            if principled is not None and "Density" in principled.inputs:
                principled.inputs["Density"].default_value = ATMOSPHERE_DENSITY_CLEAR
                atmosphere = {"applied": True, "density": ATMOSPHERE_DENSITY_CLEAR}

    world = scene.world
    mist = {"enabled": False}
    if world is not None and hasattr(world, "mist_settings"):
        world.mist_settings.use_mist = False
        mist = {"enabled": False}

    compositor = False
    if scene.use_nodes and scene.node_tree is not None:
        nodes = scene.node_tree.nodes
        scale = nodes.get("TJ_CinematicMistScale_V1")
        if scale is not None and len(scale.inputs) > 1:
            scale.inputs[1].default_value = MIST_STRENGTH_OFF
            compositor = True
        if hasattr(scene.render, "use_compositing"):
            scene.render.use_compositing = False
    return {
        "atmosphere": atmosphere,
        "mist": mist,
        "compositorDisabled": True,
        "compositorNodeZeroed": compositor,
    }


def retune_afternoon_lights(scene) -> dict:
    changed = {}
    sun = scene.objects.get("TJ_GoldenSun")
    if sun is not None:
        changed["sun"] = _retune_light(
            sun,
            energy=AFTERNOON_SUN_ENERGY,
            color=AFTERNOON_SUN_COLOR,
            angle_deg=SUN_ANGLE_DEG,
            travel=SUN_TRAVEL,
        )
    fill = scene.objects.get("TJ_SoftFill")
    if fill is not None:
        changed["fill"] = _retune_light(
            fill,
            energy=AFTERNOON_FILL_ENERGY,
            color=CINEMATIC_FILL_COLOR,
            size=FILL_SIZE,
            location=FILL_LOCATION,
            aim=FILL_AIM,
        )
    rim = scene.objects.get("TJ_CanopyRim")
    if rim is not None:
        changed["rim"] = _retune_light(
            rim,
            energy=AFTERNOON_RIM_ENERGY,
            color=AFTERNOON_RIM_COLOR,
            travel=AFTERNOON_RIM_TRAVEL,
        )
    bounce = scene.objects.get("TJ_ClearingBounce")
    if bounce is not None:
        changed["bounce"] = _retune_light(
            bounce,
            energy=AFTERNOON_BOUNCE_ENERGY,
            color=CINEMATIC_BOUNCE_COLOR,
            size=BOUNCE_SIZE,
            location=BOUNCE_LOCATION,
            aim=BOUNCE_AIM,
        )
    canopy_fill = scene.objects.get("TJ_ForestCanopyFill_V1")
    if canopy_fill is not None:
        changed["canopyFill"] = _retune_light(canopy_fill, energy=CANOPY_FILL_ENERGY)
    canopy_rim = scene.objects.get("TJ_ForestCanopyRim_V1")
    if canopy_rim is not None:
        changed["canopyRim"] = _retune_light(canopy_rim, energy=CANOPY_RIM_ENERGY)
    return changed


def lift_canopy_detail(scene) -> dict:
    import bpy

    flora = []
    for material in bpy.data.materials:
        target = _flora_light_intensity_target(material.name)
        if target is None or not material.use_nodes or material.node_tree is None:
            continue
        touched = False
        for node in material.node_tree.nodes:
            if node.type != "GROUP" or node.node_tree is None:
                continue
            if not str(node.node_tree.name).startswith("Flora_Shader"):
                continue
            if "Light Intensity" in node.inputs:
                node.inputs["Light Intensity"].default_value = FLORA_CANOPY_INTENSITY
                touched = True
            if "AO Value" in node.inputs:
                node.inputs["AO Value"].default_value = 0.08
                touched = True
            if "Emi" in node.inputs:
                node.inputs["Emi"].default_value = 0.0
        if touched:
            _tag(material)
            flora.append(material.name)

    treeleaf = []
    for material in bpy.data.materials:
        if "treeleaf" not in str(material.name or "").lower():
            continue
        if not material.use_nodes or material.node_tree is None:
            continue
        touched = False
        for node in material.node_tree.nodes:
            if node.type != "GROUP":
                continue
            if "Intensity" in node.inputs:
                node.inputs["Intensity"].default_value = TREELEAF_INTENSITY
                touched = True
            if "Color_1" in node.inputs:
                node.inputs["Color_1"].default_value = _clamp_hot_flora_color(
                    list(node.inputs["Color_1"].default_value),
                    "foliage",
                )
                touched = True
        if touched:
            _tag(material)
            treeleaf.append(material.name)

    foliage = repair_foliage_translucency(scene)
    for material in bpy.data.materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        mix = material.node_tree.nodes.get("TJ_CanopyTranslucentMix_V1")
        color = material.node_tree.nodes.get("TJ_CanopyTranslucentColor_V1")
        if mix is None:
            continue
        if "Fac" in mix.inputs:
            mix.inputs["Fac"].default_value = AFTERNOON_TRANSLUCENCY
        if color is not None and "Color" in color.outputs:
            color.outputs["Color"].default_value = AFTERNOON_TRANSLUCENT_COLOR

    contrast = sharpen_canopy_materials()
    return {
        "floraLifted": flora,
        "treeleafLifted": treeleaf,
        "translucencyFactor": AFTERNOON_TRANSLUCENCY,
        "foliageRepair": foliage,
        "canopyContrast": contrast,
        "texturesOverwritten": False,
        "emissionEnabled": False,
    }


def sharpen_canopy_materials() -> dict:
    """Raise leaf-card contrast/roughness/normal without touching ground."""
    import bpy

    skip = ("ground", "soil", "bark", "trunk", "rock", "fallen", "grass", "floral", "water", "moss")
    hints = ("treeleaf", "branch_", "leaf_tree", "vine", "leaves")
    touched = []
    for material in bpy.data.materials:
        name = str(material.name or "").lower()
        if any(word in name for word in skip):
            continue
        if not any(word in name for word in hints):
            continue
        if not material.use_nodes or material.node_tree is None:
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        changed = False
        for node in nodes:
            if node.type == "BSDF_PRINCIPLED" and "Roughness" in node.inputs:
                node.inputs["Roughness"].default_value = min(
                    float(node.inputs["Roughness"].default_value),
                    0.44,
                )
                changed = True
            if node.type == "NORMAL_MAP" and "Strength" in node.inputs:
                node.inputs["Strength"].default_value = max(
                    float(node.inputs["Strength"].default_value),
                    0.85,
                )
                changed = True
        if nodes.get("TJ_CanopyAlbedoContrast_V2") is None:
            images = [node for node in nodes if node.type == "TEX_IMAGE"]
            principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
            if images and principled is not None and "Base Color" in principled.inputs:
                contrast = nodes.new("ShaderNodeBrightContrast")
                contrast.name = "TJ_CanopyAlbedoContrast_V2"
                contrast.inputs["Bright"].default_value = 0.04
                contrast.inputs["Contrast"].default_value = 0.22
                for link in list(links):
                    if link.to_socket == principled.inputs["Base Color"]:
                        links.new(link.from_socket, contrast.inputs["Color"])
                        links.remove(link)
                links.new(contrast.outputs["Color"], principled.inputs["Base Color"])
                changed = True
        if changed:
            _tag(material)
            touched.append(material.name)
    return {"materials": touched, "groundTouched": False}


def _ecokit_sky_path() -> Path | None:
    for folder in SKY_SEARCH_DIRS:
        path = folder / SKY_IMAGE_NAME
        if path.is_file():
            return path
    return None


def _paint_readable_clouds(image, width: int, height: int) -> None:
    """Distinct soft white puffs in the camera-visible mid/upper band."""
    import random

    from PIL import Image, ImageDraw, ImageFilter

    overlay = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(overlay)
    rng = random.Random(7)
    # Low image-Y is the texture top (top canopy gap). High image-Y is
    # the card bottom, which the locked camera sees as the horizon band.
    clouds = [
        (380, 250, 140, 52),
        (820, 210, 170, 60),
        (320, 630, 160, 64),
        (780, 600, 190, 72),
        (1220, 650, 150, 58),
        (560, 710, 100, 40),
    ]
    for cx, cy, rx, ry in clouds:
        draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=236)
        for _ in range(3):
            ox = rng.randint(-rx // 3, rx // 3)
            oy = rng.randint(-ry // 4, ry // 4)
            rxx = rng.randint(rx // 3, int(rx * 0.55))
            ryy = rng.randint(ry // 3, int(ry * 0.55))
            draw.ellipse(
                (cx + ox - rxx, cy + oy - ryy, cx + ox + rxx, cy + oy + ryy),
                fill=210,
            )
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius=9))
    white = Image.new("RGB", (width, height), (252, 250, 245))
    composited = Image.composite(white, image, overlay)
    image.paste(composited)


def generate_afternoon_sky_texture(path: Path = GENERATED_SKY_PATH) -> Path:
    """Camera-readable rich blue sky. Prefer EcoKit Sky_World_2, then paint clouds.

    Blender's bundled Python has no PIL. Host Python paints the card when
    available; otherwise reuse a prewritten file or copy Sky_World_2.
    """
    path = Path(path)
    try:
        from PIL import Image
    except ImportError:
        Image = None

    if Image is not None:
        width, height = 1536, 768
        # Do not stretch EcoKit Sky_World_2 to 2:1 — that turns horizon
        # clouds into camera-visible white bands. A painted rich-blue
        # field plus large puffs stays readable in the locked gap.
        pixels = []
        for y in range(height):
            t = y / (height - 1)
            r = int(28 + 70 * t)
            g = int(102 + 58 * t)
            b = int(196 + 28 * t)
            pixels.extend([(r, g, b)] * width)
        image = Image.new("RGB", (width, height))
        image.putdata(pixels)
        _paint_readable_clouds(image, width, height)
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, "PNG")
        return path

    if path.is_file() and path.stat().st_size > 1000:
        return path
    source = _ecokit_sky_path()
    if source is None:
        raise RuntimeError("AFTERNOON_SKY_TEXTURE_UNAVAILABLE")
    import shutil

    path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, path)
    return path


def _assign_quad_uvs(mesh) -> None:
    if mesh.uv_layers.active is None:
        mesh.uv_layers.new(name="UVMap")
    uv = mesh.uv_layers.active
    corners = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0))
    for loop in mesh.loops:
        uv.data[loop.index].uv = corners[loop.vertex_index % 4]


def _camera_only_emission(name: str, image):
    import bpy

    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.04
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Smart"
    tex.extension = "EXTEND"
    try:
        image.colorspace_settings.name = "sRGB"
    except Exception:
        pass
    coords = nodes.new("ShaderNodeTexCoord")
    links.new(coords.outputs["UV"], tex.inputs["Vector"])
    light_path = nodes.new("ShaderNodeLightPath")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(tex.outputs["Color"], emission.inputs["Color"])
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    links.new(transparent.outputs["BSDF"], mix.inputs[1])
    links.new(emission.outputs["Emission"], mix.inputs[2])
    links.new(mix.outputs["Shader"], output.inputs["Surface"])
    if hasattr(material, "shadow_method"):
        material.shadow_method = "NONE"
    _tag(material)
    return material


def install_camera_sky_card(scene) -> dict:
    """Far-field UV-mapped sky card so clouds read in the locked-camera gap."""
    import bpy
    from mathutils import Vector

    sky_path = generate_afternoon_sky_texture()
    image = bpy.data.images.load(str(sky_path), check_existing=True)
    collection = bpy.data.collections.get(SKY_CARD_COLLECTION)
    if collection is None:
        collection = bpy.data.collections.new(SKY_CARD_COLLECTION)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    existing = bpy.data.objects.get("TJ_AfternoonSkyCard_V2")
    if existing is not None:
        bpy.data.objects.remove(existing, do_unlink=True)

    mesh = bpy.data.meshes.new("TJ_AfternoonSkyCard_V2_Mesh")
    verts = [(-58.0, 0.0, -18.0), (58.0, 0.0, -18.0), (58.0, 0.0, 28.0), (-58.0, 0.0, 28.0)]
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    _assign_quad_uvs(mesh)
    mesh.update()
    obj = bpy.data.objects.new("TJ_AfternoonSkyCard_V2", mesh)
    collection.objects.link(obj)
    obj.location = Vector((0.0, 62.0, 16.5))
    obj.data.materials.append(_camera_only_emission("TJ_AfternoonSkyCard_Mat_V2", image))
    obj.visible_shadow = False
    if hasattr(obj, "visible_diffuse"):
        obj.visible_diffuse = False
    if hasattr(obj, "visible_glossy"):
        obj.visible_glossy = False
    if hasattr(obj, "visible_transmission"):
        obj.visible_transmission = False
    _tag(obj)
    _tag(mesh)
    return {
        "applied": True,
        "reused": False,
        "path": str(sky_path),
        "location": [0.0, 62.0, 16.5],
        "hasUvMap": True,
        "cameraOnly": True,
        "sourceSky": SKY_IMAGE_NAME,
    }


def make_canopy_leaf_sprite(collection, name, location, material, rng, scale: float):
    """Camera-facing Corylus alpha card. Canopy only — never ground."""
    import bpy
    from mathutils import Euler, Vector

    width = rng.uniform(0.62, 1.05) * scale
    height = rng.uniform(0.78, 1.35) * scale
    verts = [
        (-width * 0.5, 0.0, 0.0),
        (width * 0.5, 0.0, 0.0),
        (width * 0.5, 0.0, height),
        (-width * 0.5, 0.0, height),
    ]
    mesh = bpy.data.meshes.new(name + "_Mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    _assign_quad_uvs(mesh)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = Vector((location[0], location[1], location[2]))
    obj.rotation_euler = Euler(
        (rng.uniform(-0.35, 0.35), rng.uniform(-0.22, 0.22), rng.uniform(-0.85, 0.85))
    )
    mesh.materials.append(material)
    _tag(mesh)
    _tag(obj)
    return obj


def scatter_canopy_leaf_cards(scene) -> dict:
    """Non-destructive leaf-card overlays on Tree_* canopies only."""
    import random

    import bpy
    from mathutils import Vector

    collection = bpy.data.collections.get(CANOPY_LEAF_COLLECTION)
    if collection is None:
        collection = bpy.data.collections.new(CANOPY_LEAF_COLLECTION)
    if collection.name not in scene.collection.children:
        scene.collection.children.link(collection)
    for old in list(collection.objects):
        if str(old.name).startswith("TJ_CanopyLeaf_") or str(old.name).startswith("TJ_CanopySprite_"):
            bpy.data.objects.remove(old, do_unlink=True)
    leaf_mat = make_foliage_material(
        "TJ_CanopyLeafDetail_Corylus_V2",
        leaf_albedo_path(),
        LEAF_NORMAL,
        0.20,
        clip=True,
    )
    rng = random.Random(9103)
    ovate = 0
    sprites = 0
    trees = []
    for obj in scene.objects:
        if obj.type != "MESH" or not obj.name.startswith("Tree_"):
            continue
        if obj.hide_render:
            continue
        y = float(obj.location.y)
        if y < -2.0 or y >= 18.0:
            continue
        trees.append(obj)
    for tree in trees:
        corners = [tree.matrix_world @ Vector(corner) for corner in tree.bound_box]
        xs = [c.x for c in corners]
        ys = [c.y for c in corners]
        zs = [c.z for c in corners]
        z_min, z_max = min(zs), max(zs)
        if z_max < 3.2:
            continue
        near = (min(ys) + max(ys)) * 0.5 < 10.0
        ovate_count = 20 if near else 12
        sprite_count = 16 if near else 9
        y_cam = min(ys) + (max(ys) - min(ys)) * 0.35
        for index in range(ovate_count):
            lx = rng.uniform(min(xs), max(xs))
            # Keep the locked-camera sky hole open; bias cards to the sides.
            if abs(lx) < 2.6:
                lx = rng.choice((-1.0, 1.0)) * rng.uniform(2.8, max(abs(min(xs)), abs(max(xs)), 4.2))
            ly = rng.uniform(min(ys), y_cam + (max(ys) - min(ys)) * 0.25)
            lz = rng.uniform(max(z_min + (z_max - z_min) * 0.50, 3.4), z_max * 0.92)
            leaf = make_ovate_leaf(
                collection,
                f"TJ_CanopyLeaf_{tree.name}_{index:02d}",
                (lx, ly, lz),
                leaf_mat,
                rng,
            )
            leaf.scale = tuple(float(v) * rng.uniform(3.0, 4.8) for v in leaf.scale)
            leaf.rotation_euler[0] = rng.uniform(-0.95, 0.95)
            leaf["tj_feature"] = FEATURE
            ovate += 1
        for index in range(sprite_count):
            lx = rng.uniform(min(xs), max(xs))
            if abs(lx) < 2.6:
                lx = rng.choice((-1.0, 1.0)) * rng.uniform(2.8, max(abs(min(xs)), abs(max(xs)), 4.2))
            ly = rng.uniform(min(ys), y_cam)
            lz = rng.uniform(max(z_min + (z_max - z_min) * 0.48, 3.5), z_max * 0.90)
            sprite = make_canopy_leaf_sprite(
                collection,
                f"TJ_CanopySprite_{tree.name}_{index:02d}",
                (lx, ly, lz),
                leaf_mat,
                rng,
                scale=rng.uniform(1.4, 2.4),
            )
            sprite["tj_feature"] = FEATURE
            sprites += 1
    return {
        "trees": len(trees),
        "leaves": ovate,
        "sprites": sprites,
        "groundTouched": False,
    }


def lift_bark_readability() -> dict:
    import bpy

    restored = restore_vendor_bark()
    contrast_nodes = 0
    for group in bpy.data.node_groups:
        if not str(group.name).startswith("TreeTrunk_Mat"):
            continue
        for node in group.nodes:
            if node.type == "BRIGHTCONTRAST" and "Contrast" in node.inputs:
                node.inputs["Contrast"].default_value = BARK_AFTERNOON_CONTRAST
                contrast_nodes += 1
    return {
        "vendorBarkRestored": restored,
        "afternoonContrast": BARK_AFTERNOON_CONTRAST,
        "contrastNodes": contrast_nodes,
        "baselineContrast": BARK_GRAIN_CONTRAST,
        "texturesOverwritten": False,
        "brightRaised": False,
    }


def apply_sunny_afternoon_tree_detail(scene) -> dict:
    locks = verify_locks(scene)
    material_lock = verify_material_lighting_lock(scene)
    cycles = apply_cycles_quality(scene)
    sky = install_camera_visible_afternoon_sky(scene)
    sky_card = install_camera_sky_card(scene)
    haze = clear_haze(scene)
    lights = retune_afternoon_lights(scene)
    scene.view_settings.exposure = AFTERNOON_EXPOSURE
    scene.view_settings.gamma = LOCKED_MATERIAL_LIGHTING["gamma"]
    scene.view_settings.view_transform = LOCKED_MATERIAL_LIGHTING["viewTransform"]
    canopy = lift_canopy_detail(scene)
    canopy_leaves = scatter_canopy_leaf_cards(scene)
    bark = lift_bark_readability()
    try:
        material_lock_after = verify_material_lighting_lock(scene)
    except RuntimeError:
        material_lock_after = {
            "exposure": float(scene.view_settings.exposure),
            "gamma": float(scene.view_settings.gamma),
            "viewTransform": scene.view_settings.view_transform,
            "hdriStrength": LOCKED_MATERIAL_LIGHTING["hdriStrength"],
            "materialLightingPreserved": False,
            "afternoonExposureAuthorized": True,
        }
    camera = verify_production_camera(scene)
    return {
        "schema": "TIVVLEJOY_FOREST_SUNNY_AFTERNOON_TREE_DETAIL_V1",
        "feature": FEATURE,
        "locks": locks,
        "materialLightingLock": material_lock_after,
        "cycles": cycles,
        "sky": sky,
        "skyCard": sky_card,
        "haze": haze,
        "lights": lights,
        "afternoonExposure": AFTERNOON_EXPOSURE,
        "canopy": canopy,
        "canopyLeaves": canopy_leaves,
        "bark": bark,
        "productionCamera": camera,
        "groundArchitectureChanged": False,
        "groundDressingChanged": False,
        "cameraChanged": False,
        "terrainChanged": False,
        "waterChanged": False,
        "compositionChanged": False,
        "prodFlowerReintroduced": False,
        "photoStampsReintroduced": False,
        "emissionShadersAdded": False,
        "finalVideoRenderStarted": False,
        "priorMaterialLock": material_lock,
    }
